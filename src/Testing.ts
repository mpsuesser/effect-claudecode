/**
 * Test helpers for effect-claudecode.
 *
 * Provides a test harness (`runHookWithMockStdin`) that exercises the entire
 * runner pipeline — stdin → decode → handler → encode → stdout — without
 * spawning a process. Plus mock constructors and assertion helpers.
 *
 * @since 0.1.0
 */
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as PlatformError from 'effect/PlatformError';
import * as Schema from 'effect/Schema';
import * as Sink from 'effect/Sink';
import * as Stdio from 'effect/Stdio';
import * as Stream from 'effect/Stream';
import { expect } from 'vitest';

import {
	HookHandlerError,
	HookInputDecodeError,
	HookOutputEncodeError,
	HookStdinReadError,
	HookStdoutWriteError
} from './Errors.ts';
import { HookContext } from './Hook/Context.ts';
import { HookEnvelope } from './Hook/Envelope.ts';
import type * as Events from './Hook/Events/index.ts';
import {
	runHookProgram,
	type HookDefinition
} from './Hook/Runner.ts';

// ---------------------------------------------------------------------------
// Mock context
// ---------------------------------------------------------------------------

const defaultContext: HookContext.Interface = {
	sessionId: 'test-session',
	transcriptPath: '/tmp/transcript.jsonl',
	cwd: '/tmp/workspace',
	permissionMode: Option.some('default'),
	hookEventName: 'TestEvent'
};

/**
 * Build a `HookContext.Interface` with sensible defaults, overridable
 * via the `overrides` argument.
 *
 * @category Mocks
 * @since 0.1.0
 */
export const makeMockHookContext = (
	overrides?: Partial<HookContext.Interface>
): HookContext.Interface =>
	overrides === undefined
		? defaultContext
		: { ...defaultContext, ...overrides };

const defaultEnvelopeFields = {
	session_id: 'test-session',
	transcript_path: '/tmp/transcript.jsonl',
	cwd: '/tmp/workspace',
	hook_event_name: 'TestEvent',
	permission_mode: 'default'
} as const;

/**
 * Build a `HookEnvelope` with sensible defaults, overridable via `overrides`.
 *
 * @category Mocks
 * @since 0.1.0
 */
export const makeMockEnvelope = (
	overrides?: Partial<HookEnvelope>
): HookEnvelope =>
	HookEnvelope.makeUnsafe(
		overrides === undefined
			? defaultEnvelopeFields
			: { ...defaultEnvelopeFields, ...overrides }
	);

// ---------------------------------------------------------------------------
// Mock Stdio layer
// ---------------------------------------------------------------------------

/**
 * Build a `Layer<Stdio.Stdio>` whose stdin emits the given JSON string once
 * and whose stdout/stderr push into the given arrays.
 *
 * @category Mocks
 * @since 0.1.0
 */
export const makeMockStdioLayer = (options: {
	readonly stdinJson: string;
	readonly stdoutBuffer: Array<string>;
	readonly stderrBuffer?: Array<string>;
}) => {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const stdoutSink = (): Sink.Sink<
		void,
		string | Uint8Array,
		never,
		never
	> =>
		Sink.forEach((chunk: string | Uint8Array) =>
			Effect.sync(() => {
				options.stdoutBuffer.push(
					typeof chunk === 'string' ? chunk : decoder.decode(chunk)
				);
			})
		);
	const stderrSink = (): Sink.Sink<
		void,
		string | Uint8Array,
		never,
		never
	> =>
		Sink.forEach((chunk: string | Uint8Array) =>
			Effect.sync(() => {
				const buf = options.stderrBuffer;
				if (buf !== undefined) {
					buf.push(
						typeof chunk === 'string' ? chunk : decoder.decode(chunk)
					);
				}
			})
		);
	return Stdio.layerTest({
		stdin: Stream.make(encoder.encode(options.stdinJson)),
		stdout: stdoutSink,
		stderr: stderrSink
	});
};

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

interface ErrorClassification {
	readonly exitCode: number;
	readonly errorTag: string | undefined;
}

const successClassification: ErrorClassification = {
	exitCode: 0,
	errorTag: undefined
};

const interruptClassification: ErrorClassification = {
	exitCode: 130,
	errorTag: undefined
};

const classifyFailure = (squashed: unknown): ErrorClassification => {
	if (squashed instanceof HookInputDecodeError) {
		return { exitCode: 2, errorTag: 'HookInputDecodeError' };
	}
	if (squashed instanceof HookStdinReadError) {
		return { exitCode: 1, errorTag: 'HookStdinReadError' };
	}
	if (squashed instanceof HookHandlerError) {
		return { exitCode: 1, errorTag: 'HookHandlerError' };
	}
	if (squashed instanceof HookOutputEncodeError) {
		return { exitCode: 1, errorTag: 'HookOutputEncodeError' };
	}
	if (squashed instanceof HookStdoutWriteError) {
		return { exitCode: 1, errorTag: 'HookStdoutWriteError' };
	}
	return { exitCode: 1, errorTag: undefined };
};

const classifyExit = <E, A>(
	exit: Exit.Exit<E, A>
): ErrorClassification => {
	if (Exit.isSuccess(exit)) return successClassification;
	if (Cause.hasInterruptsOnly(exit.cause)) return interruptClassification;
	return classifyFailure(Cause.squash(exit.cause));
};

// ---------------------------------------------------------------------------
// runHookWithMockStdin
// ---------------------------------------------------------------------------

/**
 * Result of running a hook against a mock stdin.
 *
 * @category Runner
 * @since 0.1.0
 */
export interface RunHookResult {
	/** Parsed JSON written to stdout, or `undefined` if nothing was written. */
	readonly output: unknown;
	/** Raw stdout string. */
	readonly stdout: string;
	/** Captured stderr string. */
	readonly stderr: string;
	/**
	 * Exit code the runner would produce under the real `runMain` teardown.
	 * `0` success, `2` blocking decode error, `1` other failure, `130` interrupt.
	 */
	readonly exitCode: number;
	/** The `_tag` of the runner failure, if any. */
	readonly errorTag: string | undefined;
}

/**
 * Run a hook definition end-to-end against a mock stdin payload and capture
 * the stdout the runner would have written.
 *
 * This exercises the full runner pipeline (stdin read → JSON parse →
 * schema decode → handler → schema encode → stdout write) using
 * `Stdio.layerTest` instead of the real `process.stdin`/`process.stdout`.
 * No fiber is forked; no process.exit is called.
 *
 * @category Runner
 * @since 0.1.0
 * @example
 * ```ts
 * import { describe, expect, it } from '@effect/vitest'
 * import * as Effect from 'effect/Effect'
 * import { Hook, Testing } from 'effect-claudecode'
 *
 * describe('Hook', () => {
 *   it.effect('round-trips a trivial hook', () =>
 *     Effect.gen(function* () {
 *       const result = yield* Testing.runHookWithMockStdin(myHook, jsonString)
 *       expect(result.exitCode).toBe(0)
 *     })
 *   )
 * })
 * ```
 */
export const runHookWithMockStdin = <In extends HookEnvelope, Out>(
	hook: HookDefinition<In, Out>,
	stdinJson: string
): Effect.Effect<RunHookResult, never> =>
	Effect.gen(function* () {
		const stdoutBuffer: Array<string> = [];
		const stderrBuffer: Array<string> = [];

		const layer = makeMockStdioLayer({
			stdinJson,
			stdoutBuffer,
			stderrBuffer
		});

		const exit = yield* Effect.exit(
			runHookProgram(hook).pipe(Effect.provide(layer))
		);

		const stdout = stdoutBuffer.join('');
		const stderr = stderrBuffer.join('');
		const trimmed = stdout.trim();
		const output: unknown =
			trimmed.length > 0
				? Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
						trimmed
					)
				: undefined;

		const { exitCode, errorTag } = classifyExit(exit);

		return { output, stdout, stderr, exitCode, errorTag };
	});

// ---------------------------------------------------------------------------
// Event input fixtures
// ---------------------------------------------------------------------------

/**
 * Build a fixture function for a single event. The returned function
 * takes an `overrides` object and produces the JSON wire string the
 * runner would decode. Defaults are merged in from the common
 * envelope and the per-event defaults passed here; overrides win.
 *
 * The generic `TInput` parameter carries the event's `Input` class
 * type so call sites get typed IntelliSense over the override shape.
 *
 * @internal
 */
const makeFixture =
	<TInput>(event: string, defaults: Record<string, unknown>) =>
	(overrides?: Partial<TInput>): string =>
		// `avoid-direct-json` (info): writing a JSON wire string IS the
		// point of a fixture builder.
		JSON.stringify({
			...defaultEnvelopeFields,
			hook_event_name: event,
			...defaults,
			...overrides
		});

/**
 * Fixture builders for every Claude Code hook event. Each entry
 * returns a JSON string suitable for passing to
 * `runHookWithMockStdin`.
 *
 * Defaults carry only the minimum fields required by the event
 * schema; callers override only what matters for the test.
 *
 * @category Fixtures
 * @since 0.1.0
 * @example
 * ```ts
 * import { Testing } from 'effect-claudecode'
 *
 * const json = Testing.fixtures.PreToolUse({
 *   tool_name: 'Bash',
 *   tool_input: { command: 'rm -rf /' }
 * })
 * ```
 */
export const fixtures = {
	// ---- Tier 1 ----
	PreToolUse: makeFixture<Events.PreToolUse.Input>('PreToolUse', {
		tool_name: 'Bash',
		tool_input: { command: 'echo test' }
	}),
	PostToolUse: makeFixture<Events.PostToolUse.Input>('PostToolUse', {
		tool_name: 'Bash',
		tool_input: { command: 'echo test' },
		tool_response: { output: 'test\n', exit_code: 0 }
	}),
	UserPromptSubmit: makeFixture<Events.UserPromptSubmit.Input>(
		'UserPromptSubmit',
		{ prompt: 'hello' }
	),
	Notification: makeFixture<Events.Notification.Input>('Notification', {
		message: 'test notification',
		notification_type: 'info'
	}),
	Stop: makeFixture<Events.Stop.Input>('Stop', { stop_hook_active: false }),
	SubagentStop: makeFixture<Events.SubagentStop.Input>('SubagentStop', {
		stop_hook_active: false,
		agent_id: 'agent-1',
		agent_type: 'default',
		agent_transcript_path: '/tmp/agent.jsonl',
		last_assistant_message: 'done'
	}),
	SessionStart: makeFixture<Events.SessionStart.Input>('SessionStart', {
		source: 'startup'
	}),
	SessionEnd: makeFixture<Events.SessionEnd.Input>('SessionEnd', {
		exit_reason: 'clear'
	}),
	PreCompact: makeFixture<Events.PreCompact.Input>('PreCompact', {
		trigger: 'manual'
	}),

	// ---- Tier 2 ----
	PostCompact: makeFixture<Events.PostCompact.Input>('PostCompact', {
		trigger: 'manual'
	}),
	PermissionRequest: makeFixture<Events.PermissionRequest.Input>(
		'PermissionRequest',
		{
			tool_name: 'Bash',
			tool_input: { command: 'echo test' }
		}
	),
	PermissionDenied: makeFixture<Events.PermissionDenied.Input>(
		'PermissionDenied',
		{
			tool_name: 'Bash',
			tool_input: { command: 'echo test' },
			reason: 'denied by policy'
		}
	),
	PostToolUseFailure: makeFixture<Events.PostToolUseFailure.Input>(
		'PostToolUseFailure',
		{
			tool_name: 'Bash',
			tool_input: { command: 'echo test' },
			error: 'command failed'
		}
	),
	InstructionsLoaded: makeFixture<Events.InstructionsLoaded.Input>(
		'InstructionsLoaded',
		{
			file_path: '/repo/CLAUDE.md',
			memory_type: 'project',
			load_reason: 'session_start'
		}
	),
	StopFailure: makeFixture<Events.StopFailure.Input>('StopFailure', {
		error_type: 'api_error'
	}),
	CwdChanged: makeFixture<Events.CwdChanged.Input>('CwdChanged', {}),
	FileChanged: makeFixture<Events.FileChanged.Input>('FileChanged', {
		file_path: '/repo/src/index.ts',
		change_type: 'modified'
	}),
	ConfigChange: makeFixture<Events.ConfigChange.Input>('ConfigChange', {
		config_source: 'settings.json'
	}),
	SubagentStart: makeFixture<Events.SubagentStart.Input>('SubagentStart', {
		agent_id: 'agent-1',
		agent_type: 'default'
	}),

	// ---- Tier 3 ----
	TaskCreated: makeFixture<Events.TaskCreated.Input>('TaskCreated', {
		task_id: 'task-1',
		task_subject: 'Do something'
	}),
	TaskCompleted: makeFixture<Events.TaskCompleted.Input>('TaskCompleted', {
		task_id: 'task-1',
		task_subject: 'Do something'
	}),
	TeammateIdle: makeFixture<Events.TeammateIdle.Input>('TeammateIdle', {}),
	WorktreeCreate: makeFixture<Events.WorktreeCreate.Input>(
		'WorktreeCreate',
		{}
	),
	WorktreeRemove: makeFixture<Events.WorktreeRemove.Input>('WorktreeRemove', {
		worktree_path: '/repo/.worktrees/feature'
	}),
	Elicitation: makeFixture<Events.Elicitation.Input>('Elicitation', {
		mcp_server_name: 'test-server'
	}),
	ElicitationResult: makeFixture<Events.ElicitationResult.Input>(
		'ElicitationResult',
		{ mcp_server_name: 'test-server' }
	)
};

// ---------------------------------------------------------------------------
// Decision assertion helpers
// ---------------------------------------------------------------------------

/**
 * Assert that `output` is a PreToolUse `allow` decision. If `reason`
 * is provided, it must match `permissionDecisionReason`.
 *
 * @category Assertions
 * @since 0.1.0
 */
export const expectAllowDecision = (
	output: unknown,
	reason?: string
): void => {
	const expected: Record<string, unknown> = {
		permissionDecision: 'allow'
	};
	if (reason !== undefined) {
		expected['permissionDecisionReason'] = reason;
	}
	expect(output).toMatchObject({ hookSpecificOutput: expected });
};

/**
 * Assert that `output` is a PreToolUse `deny` decision. If `reason`
 * is provided, it must match `permissionDecisionReason`.
 *
 * @category Assertions
 * @since 0.1.0
 */
export const expectDenyDecision = (
	output: unknown,
	reason?: string
): void => {
	const expected: Record<string, unknown> = {
		permissionDecision: 'deny'
	};
	if (reason !== undefined) {
		expected['permissionDecisionReason'] = reason;
	}
	expect(output).toMatchObject({ hookSpecificOutput: expected });
};

/**
 * Assert that `output` is a PreToolUse `ask` decision. If `reason`
 * is provided, it must match `permissionDecisionReason`.
 *
 * @category Assertions
 * @since 0.1.0
 */
export const expectAskDecision = (
	output: unknown,
	reason?: string
): void => {
	const expected: Record<string, unknown> = {
		permissionDecision: 'ask'
	};
	if (reason !== undefined) {
		expected['permissionDecisionReason'] = reason;
	}
	expect(output).toMatchObject({ hookSpecificOutput: expected });
};

/**
 * Assert that `output` is a top-level `block` decision. If `reason`
 * is provided, it must match `reason`.
 *
 * Applies to UserPromptSubmit, PostToolUse, Stop, SubagentStop,
 * ConfigChange, TaskCreated, TaskCompleted, and TeammateIdle.
 *
 * @category Assertions
 * @since 0.1.0
 */
export const expectBlockDecision = (
	output: unknown,
	reason?: string
): void => {
	const expected: Record<string, unknown> = { decision: 'block' };
	if (reason !== undefined) {
		expected['reason'] = reason;
	}
	expect(output).toMatchObject(expected);
};

/**
 * Assert that `output` carries an `additionalContext` entry in its
 * `hookSpecificOutput`. When `context` is provided, the string must
 * match exactly.
 *
 * @category Assertions
 * @since 0.1.0
 */
export const expectAddContext = (
	output: unknown,
	context?: string
): void => {
	const expected: Record<string, unknown> =
		context === undefined
			? { additionalContext: expect.any(String) }
			: { additionalContext: context };
	expect(output).toMatchObject({ hookSpecificOutput: expected });
};

// ---------------------------------------------------------------------------
// Mock FileSystem
// ---------------------------------------------------------------------------

const notFoundError = (path: string) =>
	PlatformError.systemError({
		_tag: 'NotFound',
		module: 'FileSystem',
		method: 'readFileString',
		description: 'No such file or directory',
		pathOrDescriptor: path
	});

/**
 * Build a `Layer<FileSystem>` backed by an in-memory map of
 * absolute paths to file contents. Paths not in the map are
 * reported as non-existent (and `readFileString` fails with a
 * `NotFound` platform error).
 *
 * Useful for testing `Settings.load`, `Frontmatter.parseFile`,
 * `Mcp.loadJson`, `Hook.readTranscript`, and any other code path
 * that reads files through the `FileSystem` service.
 *
 * @category Mocks
 * @since 0.1.0
 * @example
 * ```ts
 * import { describe, it } from '@effect/vitest'
 * import * as Effect from 'effect/Effect'
 * import { Settings, Testing } from 'effect-claudecode'
 *
 * it.effect('loads settings', () =>
 *   Effect.gen(function* () {
 *     const settings = yield* Settings.load('/repo')
 *     // ...
 *   }).pipe(
 *     Effect.provide(
 *       Testing.makeMockFileSystem({
 *         '/repo/.claude/settings.json': '{"model":"claude-opus-4-6"}'
 *       })
 *     )
 *   )
 * )
 * ```
 */
export const makeMockFileSystem = (
	files: ReadonlyMap<string, string> | Record<string, string>
): Layer.Layer<FileSystem.FileSystem> => {
	const fileMap =
		files instanceof Map
			? files
			: new Map(Object.entries(files));
	return FileSystem.layerNoop({
		exists: (path: string) => Effect.succeed(fileMap.has(path)),
		readFileString: (path: string) => {
			const content = fileMap.get(path);
			return content === undefined
				? Effect.fail(notFoundError(path))
				: Effect.succeed(content);
		}
	});
};
