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
import * as Path from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';
import * as Schema from 'effect/Schema';
import * as Sink from 'effect/Sink';
import * as Stdio from 'effect/Stdio';
import * as Stream from 'effect/Stream';

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
import * as Plugin from './Plugin.ts';
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
	HookEnvelope.make(
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
	const writeStdoutChunk = (chunk: string | Uint8Array) =>
		Effect.sync(() => {
			options.stdoutBuffer.push(
				typeof chunk === 'string' ? chunk : decoder.decode(chunk)
			);
		});
	const writeStderrChunk = (chunk: string | Uint8Array) =>
		Effect.sync(() => {
			const buf = options.stderrBuffer;
			if (buf !== undefined) {
				buf.push(typeof chunk === 'string' ? chunk : decoder.decode(chunk));
			}
		});
	const stdoutSink = (): Sink.Sink<
		void,
		string | Uint8Array,
		never,
		never
	> => Sink.forEach(writeStdoutChunk);
	const stderrSink = (): Sink.Sink<
		void,
		string | Uint8Array,
		never,
		never
	> => Sink.forEach(writeStderrChunk);
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

const AnyString = Symbol.for('effect-claudecode/Testing/AnyString');

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const formatAssertionValue = (value: unknown): string => {
	return typeof value === 'string'
		? value
		: JSON.stringify(value, null, 2) ?? String(value);
};

const failAssertion = (message: string): never => {
	throw new Error(message);
};

const matchesExpected = (actual: unknown, expected: unknown): boolean => {
	if (expected === AnyString) {
		return typeof actual === 'string';
	}

	if (expected instanceof RegExp) {
		return typeof actual === 'string' && expected.test(actual);
	}

	if (Array.isArray(expected)) {
		return (
			Array.isArray(actual) &&
			actual.length === expected.length &&
			expected.every((item, index) => matchesExpected(actual[index], item))
		);
	}

	if (isRecord(expected)) {
		return (
			isRecord(actual) &&
			Object.entries(expected).every(([key, value]) =>
				matchesExpected(actual[key], value)
			)
		);
	}

	return Object.is(actual, expected);
};

const assertMatchObject = (
	actual: unknown,
	expected: Record<string, unknown>,
	label: string
): void => {
	if (!matchesExpected(actual, expected)) {
		failAssertion(
			`${label}\nExpected: ${formatAssertionValue(expected)}\nActual: ${formatAssertionValue(actual)}`
		);
	}
};

const assertEqual = (actual: unknown, expected: unknown, label: string): void => {
	if (!matchesExpected(actual, expected)) {
		failAssertion(
			`${label}\nExpected: ${formatAssertionValue(expected)}\nActual: ${formatAssertionValue(actual)}`
		);
	}
};

const assertMatch = (actual: unknown, expected: unknown, label: string): void => {
	if (!matchesExpected(actual, expected)) {
		failAssertion(
			`${label}\nExpected: ${formatAssertionValue(expected)}\nActual: ${formatAssertionValue(actual)}`
		);
	}
};

const assertDefined = <A>(value: A | undefined, label: string): A => {
	if (value !== undefined) {
		return value;
	}

	return failAssertion(label);
};

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
	assertMatchObject(
		output,
		{ hookSpecificOutput: expected },
		'Expected an allow decision.'
	);
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
	assertMatchObject(
		output,
		{ hookSpecificOutput: expected },
		'Expected a deny decision.'
	);
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
	assertMatchObject(
		output,
		{ hookSpecificOutput: expected },
		'Expected an ask decision.'
	);
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
	assertMatchObject(output, expected, 'Expected a block decision.');
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
			? { additionalContext: AnyString }
			: { additionalContext: context };
	assertMatchObject(
		output,
		{ hookSpecificOutput: expected },
		'Expected an addContext decision.'
	);
};

// ---------------------------------------------------------------------------
// Mock FileSystem
// ---------------------------------------------------------------------------

/**
 * Operations that the mock file system can intercept.
 *
 * @category Mocks
 * @since 0.1.0
 */
export type MockFileSystemOperation =
	| 'exists'
	| 'readFile'
	| 'readFileString'
	| 'writeFile'
	| 'writeFileString'
	| 'makeDirectory'
	| 'readDirectory'
	| 'remove';

/**
 * Options for the in-memory file system harness.
 *
 * @category Mocks
 * @since 0.1.0
 */
export interface MockFileSystemOptions {
	readonly failOn?: (
		operation: MockFileSystemOperation,
		path: string
	) => boolean;
}

/**
 * Deterministic snapshot of the mock file system state.
 *
 * @category Mocks
 * @since 0.1.0
 */
export interface MockFileSystemSnapshot {
	readonly files: ReadonlyMap<string, string>;
	readonly directories: ReadonlyArray<string>;
}

/**
 * Stateful in-memory file system harness used by tests.
 *
 * @category Mocks
 * @since 0.1.0
 */
export interface MockFileSystem {
	readonly layer: Layer.Layer<FileSystem.FileSystem | Path.Path>;
	readonly snapshot: () => MockFileSystemSnapshot;
	readonly readFile: (path: string) => string | undefined;
	readonly exists: (path: string) => boolean;
}

type MockFileEntries = ReadonlyMap<string, string> | Record<string, string>;

const textEncoder = new TextEncoder();

const normalizeDirectoryPath = (path: string): string => {
	if (path === '/') {
		return '/';
	}
	const normalized = path.replace(/\/+$/, '');
	return normalized.length === 0 ? '/' : normalized;
};

const parentDirectory = (path: string): string => {
	const normalized = normalizeDirectoryPath(path);
	if (normalized === '/') {
		return '/';
	}
	const slashIndex = normalized.lastIndexOf('/');
	return slashIndex <= 0 ? '/' : normalized.slice(0, slashIndex);
};

const ancestorDirectories = (path: string): ReadonlyArray<string> => {
	const normalized = normalizeDirectoryPath(path);
	if (normalized === '/') {
		return ['/'];
	}

	const segments = normalized.split('/').filter((segment) => segment.length > 0);
	const directories = ['/'];
	let current = '';

	for (const segment of segments) {
		current = `${current}/${segment}`;
		directories.push(current);
	}

	return directories;
};

const toFileMap = (files?: MockFileEntries): Map<string, string> =>
	files === undefined
		? new Map()
		: files instanceof Map
			? new Map(files)
			: new Map(Object.entries(files));

const permissionDeniedError = (
	path: string,
	method: MockFileSystemOperation
) =>
	PlatformError.systemError({
		_tag: 'PermissionDenied',
		module: 'FileSystem',
		method,
		description: 'Permission denied',
		pathOrDescriptor: path
	});

const notFoundError = (
	path: string,
	method: MockFileSystemOperation
) =>
	PlatformError.systemError({
		_tag: 'NotFound',
		module: 'FileSystem',
		method,
		description: 'No such file or directory',
		pathOrDescriptor: path
	});

const directoryNotEmptyError = (path: string) =>
	PlatformError.systemError({
		_tag: 'BadResource',
		module: 'FileSystem',
		method: 'remove',
		description: 'Directory not empty',
		pathOrDescriptor: path
	});

const ensureInitialDirectories = (files: Map<string, string>): Set<string> => {
	const directories = new Set<string>(['/']);
	for (const filePath of files.keys()) {
		for (const directory of ancestorDirectories(parentDirectory(filePath))) {
			directories.add(directory);
		}
	}
	return directories;
};

const hasEntry = (
	files: ReadonlyMap<string, string>,
	directories: ReadonlySet<string>,
	path: string
): boolean => files.has(path) || directories.has(normalizeDirectoryPath(path));

const directDirectoryEntries = (
	files: ReadonlyMap<string, string>,
	directories: ReadonlySet<string>,
	dirPath: string
): ReadonlyArray<string> => {
	const normalized = normalizeDirectoryPath(dirPath);
	const prefix = normalized === '/' ? '/' : `${normalized}/`;
	const entries = new Set<string>();

	for (const filePath of files.keys()) {
		if (!filePath.startsWith(prefix)) continue;
		const remainder = filePath.slice(prefix.length);
		const slashIndex = remainder.indexOf('/');
		entries.add(slashIndex === -1 ? remainder : remainder.slice(0, slashIndex));
	}

	for (const directoryPath of directories) {
		if (directoryPath === normalized || !directoryPath.startsWith(prefix)) continue;
		const remainder = directoryPath.slice(prefix.length);
		if (remainder.length === 0) continue;
		const slashIndex = remainder.indexOf('/');
		entries.add(slashIndex === -1 ? remainder : remainder.slice(0, slashIndex));
	}

	return Array.from(entries)
		.filter((entry) => entry.length > 0)
		.sort();
};

const recursiveDirectoryEntries = (
	files: ReadonlyMap<string, string>,
	directories: ReadonlySet<string>,
	dirPath: string
): ReadonlyArray<string> => {
	const normalized = normalizeDirectoryPath(dirPath);
	const prefix = normalized === '/' ? '/' : `${normalized}/`;
	const entries = new Set<string>();

	for (const filePath of files.keys()) {
		if (filePath.startsWith(prefix)) {
			const remainder = filePath.slice(prefix.length);
			if (remainder.length > 0) {
				entries.add(remainder);
			}
		}
	}

	for (const directoryPath of directories) {
		if (directoryPath === normalized || !directoryPath.startsWith(prefix)) continue;
		const remainder = directoryPath.slice(prefix.length);
		if (remainder.length > 0) {
			entries.add(remainder);
		}
	}

	return Array.from(entries).sort();
};

/**
 * Build a stateful in-memory file system harness with a ready-to-provide
 * `FileSystem` + `Path` layer and snapshot helpers for assertions.
 *
 * Unlike the earlier read-only helper, this harness supports directory
 * listings and writes, so it can exercise `Plugin.write`, `Plugin.scan`,
 * `Plugin.load`, `Settings.load`, frontmatter parsing, transcript reads, and
 * install/sync flows against one consistent in-memory project tree.
 *
 * @category Mocks
 * @since 0.1.0
 */
export const makeMockFileSystem = (
	files?: MockFileEntries,
	options?: MockFileSystemOptions
): MockFileSystem => {
	const fileMap = toFileMap(files);
	const directories = ensureInitialDirectories(fileMap);
	const shouldFail = options?.failOn ?? (() => false);

	const failIfRequested = (operation: MockFileSystemOperation, path: string) =>
		shouldFail(operation, path)
			? Option.some(permissionDeniedError(path, operation))
			: Option.none();

	const layer = Layer.mergeAll(
		FileSystem.layerNoop({
			exists: (path: string) => {
				const failure = failIfRequested('exists', path);
				return Option.isSome(failure)
					? Effect.fail(failure.value)
					: Effect.succeed(hasEntry(fileMap, directories, path));
			},
			readFileString: (path: string) => {
				const failure = failIfRequested('readFileString', path);
				if (Option.isSome(failure)) {
					return Effect.fail(failure.value);
				}
				const content = fileMap.get(path);
				return content === undefined
					? Effect.fail(notFoundError(path, 'readFileString'))
					: Effect.succeed(content);
			},
			readFile: (path: string) => {
				const failure = failIfRequested('readFile', path);
				if (Option.isSome(failure)) {
					return Effect.fail(failure.value);
				}
				const content = fileMap.get(path);
				return content === undefined
					? Effect.fail(notFoundError(path, 'readFile'))
					: Effect.succeed(textEncoder.encode(content));
			},
			writeFileString: (path: string, content: string) => {
				const failure = failIfRequested('writeFileString', path);
				if (Option.isSome(failure)) {
					return Effect.fail(failure.value);
				}
				const directory = parentDirectory(path);
				if (!directories.has(directory)) {
					return Effect.fail(notFoundError(path, 'writeFileString'));
				}
				return Effect.sync(() => {
					fileMap.set(path, content);
				});
			},
			writeFile: (path: string, data: Uint8Array) => {
				const failure = failIfRequested('writeFile', path);
				if (Option.isSome(failure)) {
					return Effect.fail(failure.value);
				}
				const directory = parentDirectory(path);
				if (!directories.has(directory)) {
					return Effect.fail(notFoundError(path, 'writeFile'));
				}
				return Effect.sync(() => {
					fileMap.set(path, new TextDecoder().decode(data));
				});
			},
			makeDirectory: (path: string, makeOptions) => {
				const failure = failIfRequested('makeDirectory', path);
				if (Option.isSome(failure)) {
					return Effect.fail(failure.value);
				}
				const normalized = normalizeDirectoryPath(path);
				const recursive = makeOptions?.recursive ?? false;
				if (!recursive && !directories.has(parentDirectory(normalized))) {
					return Effect.fail(notFoundError(path, 'makeDirectory'));
				}
				return Effect.sync(() => {
					for (const directory of recursive
						? ancestorDirectories(normalized)
						: [normalized]) {
						directories.add(directory);
					}
				});
			},
			readDirectory: (path: string, readOptions) => {
				const failure = failIfRequested('readDirectory', path);
				if (Option.isSome(failure)) {
					return Effect.fail(failure.value);
				}
				const normalized = normalizeDirectoryPath(path);
				if (!directories.has(normalized)) {
					return Effect.fail(notFoundError(path, 'readDirectory'));
				}
				return Effect.succeed(
					readOptions?.recursive
						? [...recursiveDirectoryEntries(fileMap, directories, normalized)]
						: [...directDirectoryEntries(fileMap, directories, normalized)]
				);
			},
			remove: (path: string, removeOptions) => {
				const failure = failIfRequested('remove', path);
				if (Option.isSome(failure)) {
					return Effect.fail(failure.value);
				}
				const normalized = normalizeDirectoryPath(path);
				const recursive = removeOptions?.recursive ?? false;
				const force = removeOptions?.force ?? false;

				if (fileMap.has(path)) {
					return Effect.sync(() => {
						fileMap.delete(path);
					});
				}

				if (!directories.has(normalized)) {
					return force
						? Effect.void
						: Effect.fail(notFoundError(path, 'remove'));
				}

				const descendants = Array.from(fileMap.keys()).filter((filePath) =>
					filePath.startsWith(`${normalized}/`)
				);
				const descendantDirectories = Array.from(directories).filter(
					(directoryPath) =>
						directoryPath !== normalized &&
						directoryPath.startsWith(`${normalized}/`)
				);

				if (!recursive && (descendants.length > 0 || descendantDirectories.length > 0)) {
					return Effect.fail(directoryNotEmptyError(path));
				}

				return Effect.sync(() => {
					for (const filePath of descendants) {
						fileMap.delete(filePath);
					}
					for (const directoryPath of descendantDirectories) {
						directories.delete(directoryPath);
					}
					directories.delete(normalized);
				});
			}
		}),
		Path.layer
	);

	return {
		layer,
		snapshot: () => ({
			files: new Map(
				Array.from(fileMap.entries()).sort(([left], [right]) =>
					left.localeCompare(right)
				)
			),
			directories: Array.from(directories).sort()
		}),
		readFile: (path: string) => fileMap.get(path),
		exists: (path: string) => hasEntry(fileMap, directories, path)
	};
};

/**
 * Assert that a written plugin tree matches the expected file set exactly.
 *
 * String expectations must match exactly. `RegExp` expectations must match the
 * full file content via `expect(...).toMatch(...)`.
 *
 * @category Assertions
 * @since 0.1.0
 */
export const expectPluginTree = (
	input: MockFileSystem | MockFileSystemSnapshot,
	expected: Readonly<Record<string, string | RegExp>>
): void => {
	const snapshot = 'layer' in input ? input.snapshot() : input;
	const actualPaths = Array.from(snapshot.files.keys()).sort();
	const expectedPaths = Object.keys(expected).sort();

	assertEqual(actualPaths, expectedPaths, 'Plugin tree paths did not match.');

	for (const path of expectedPaths) {
		const actual = assertDefined(
			snapshot.files.get(path),
			`Expected plugin tree to contain ${path}.`
		);
		const matcher = expected[path];
		if (matcher instanceof RegExp) {
			assertMatch(
				actual,
				matcher,
				`Plugin tree file ${path} did not match the expected pattern.`
			);
		} else {
			assertEqual(
				actual,
				matcher,
				`Plugin tree file ${path} did not match the expected contents.`
			);
		}
	}
};

/**
 * Write a plugin definition into an in-memory file system harness and return
 * the harness for further assertions or round-trip loading.
 *
 * @category Runner
 * @since 0.1.0
 */
export const writePluginToMemory = (
	definition: Plugin.PluginDefinition,
	destDir = '/plugin',
	options?: MockFileSystemOptions
): Effect.Effect<MockFileSystem, import('./Errors.ts').PluginWriteError> =>
	Effect.gen(function* () {
		const fileSystem = makeMockFileSystem(undefined, options);
		yield* Plugin.write(definition, destDir).pipe(
			Effect.provide(fileSystem.layer)
		);
		return fileSystem;
	});

/**
 * Result of writing a plugin to an in-memory file system and loading it back.
 *
 * @category Runner
 * @since 0.1.0
 */
export interface PluginRoundTripResult {
	readonly fileSystem: MockFileSystem;
	readonly loaded: Plugin.LoadedPlugin;
}

/**
 * Round-trip a plugin definition through `Plugin.write` and `Plugin.load`
 * without touching disk.
 *
 * @category Runner
 * @since 0.1.0
 */
export const roundTripPlugin = (
	definition: Plugin.PluginDefinition,
	destDir = '/plugin',
	options?: MockFileSystemOptions
): Effect.Effect<
	PluginRoundTripResult,
	import('./Errors.ts').PluginWriteError | import('./Errors.ts').PluginLoadError
> =>
	Effect.gen(function* () {
		const fileSystem = yield* writePluginToMemory(definition, destDir, options);
		const loaded = yield* Plugin.load(destDir).pipe(
			Effect.provide(fileSystem.layer)
		);
		return { fileSystem, loaded };
	});
