/**
 * Hook runner — the FFI boundary between Claude Code's stdio process API
 * and Effect.
 *
 * `Hook.runMain(hookDefinition)` is the primary entry point for scripts
 * that handle a single event. `Hook.dispatch(map)` is for scripts that
 * handle multiple events from one entry file — it reads stdin once,
 * peeks `hook_event_name`, and routes to the matching handler.
 *
 * @since 0.1.0
 */
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as Runtime from 'effect/Runtime';
import * as Schema from 'effect/Schema';
import * as Stdio from 'effect/Stdio';
import * as Stream from 'effect/Stream';

import * as NodeStdio from '@effect/platform-node-shared/NodeStdio';
import { runMain as platformRunMain } from '@effect/platform-node-shared/NodeRuntime';

import {
	HookControlledExit,
	HookHandlerError,
	HookInputDecodeError,
	HookOutputEncodeError,
	HookStdinReadError,
	HookStdoutWriteError
} from '../Errors.ts';
import { HookContext } from './Context.ts';
import { HookEnvelope } from './Envelope.ts';

// ---------------------------------------------------------------------------
// HookDefinition
// ---------------------------------------------------------------------------

/**
 * A complete, runnable hook definition.
 *
 * Produced by each event's `define(config)` factory. Passed to
 * `Hook.runMain(hook)`, `Hook.dispatch({...})`, or the test helpers in
 * `Testing`.
 *
 * @category Models
 * @since 0.1.0
 */
export class HookProcessOutput extends Schema.TaggedClass<HookProcessOutput>()(
	'HookProcessOutput',
	{
		stdout: Schema.optional(Schema.String),
		stderr: Schema.optional(Schema.String),
		exitCode: Schema.Number
	}
) {}

export const processOutput = (options: {
	readonly exitCode?: number;
	readonly stdout?: string;
	readonly stderr?: string;
}): HookProcessOutput =>
	new HookProcessOutput({
		exitCode: options.exitCode ?? 0,
		...(options.stdout !== undefined ? { stdout: options.stdout } : {}),
		...(options.stderr !== undefined ? { stderr: options.stderr } : {})
	});

export const stderrExit = (
	stderr: string,
	exitCode = 2
): HookProcessOutput => processOutput({ stderr, exitCode });

export const rawStdout = (stdout: string): HookProcessOutput =>
	processOutput({ stdout });

const isHookProcessOutput = Schema.is(HookProcessOutput);

export interface HookDefinition<In extends HookEnvelope, Out> {
	readonly event: string;
	readonly inputSchema: Schema.Codec<In, unknown>;
	readonly outputSchema: Schema.Codec<Out, unknown>;
	readonly handler: (
		input: In
	) => Effect.Effect<Out | HookProcessOutput, unknown, HookContext.Service>;
}

/**
 * Dispatch map for `Hook.dispatch` — keys are hook event names and values
 * are complete `HookDefinition`s for that event.
 *
 * The inner type parameters are intentionally `any` so a single map may
 * hold definitions for different events (each with its own narrow input
 * and output type). Per-entry type safety is preserved at the
 * construction site because each event's `define(config)` factory
 * returns a precisely-typed `HookDefinition` before it lands in the
 * dispatch map.
 *
 * @category Models
 * @since 0.1.0
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DispatchMap = Readonly<Record<string, HookDefinition<any, any>>>;

/**
 * The union of every error the runner can produce internally.
 *
 * @internal
 */
type RunnerError =
	| HookStdinReadError
	| HookInputDecodeError
	| HookHandlerError
	| HookOutputEncodeError
	| HookStdoutWriteError
	| HookControlledExit;

// ---------------------------------------------------------------------------
// Internal: stdin/stdout
// ---------------------------------------------------------------------------

/**
 * Read all bytes from stdin and decode as UTF-8.
 *
 * @internal
 */
const readStdin: Effect.Effect<string, HookStdinReadError, Stdio.Stdio> =
	Effect.gen(function* () {
		yield* Effect.logDebug('reading hook stdin');
		const stdio = yield* Stdio.Stdio;
		const chunks = yield* Stream.runCollect(
			Stream.decodeText(stdio.stdin)
		).pipe(
			Effect.mapError((cause) => new HookStdinReadError({ cause }))
		);
		const raw = Array.from(chunks).join('');
		yield* Effect.logDebug('read hook stdin').pipe(
			Effect.annotateLogs({ byteLength: raw.length })
		);
		return raw;
	}).pipe(Effect.withLogSpan('Hook.readStdin'));

/**
 * Write a single JSON line to stdout.
 *
 * @internal
 */
const writeStdout = (
	json: string
): Effect.Effect<void, HookStdoutWriteError, Stdio.Stdio> =>
	Effect.gen(function* () {
		yield* Effect.logDebug('writing hook stdout').pipe(
			Effect.annotateLogs({ byteLength: json.length })
		);
		const stdio = yield* Stdio.Stdio;
		yield* Stream.run(Stream.make(json + '\n'), stdio.stdout()).pipe(
			Effect.mapError((cause) => new HookStdoutWriteError({ cause }))
		);
	}).pipe(Effect.withLogSpan('Hook.writeStdout'));

const writeRawStdout = (
	text: string
): Effect.Effect<void, HookStdoutWriteError, Stdio.Stdio> =>
	Effect.gen(function* () {
		yield* Effect.logDebug('writing raw hook stdout').pipe(
			Effect.annotateLogs({ byteLength: text.length })
		);
		const stdio = yield* Stdio.Stdio;
		yield* Stream.run(Stream.make(text), stdio.stdout()).pipe(
			Effect.mapError((cause) => new HookStdoutWriteError({ cause }))
		);
	}).pipe(Effect.withLogSpan('Hook.writeRawStdout'));

const writeStderr = (
	text: string
): Effect.Effect<void, HookStdoutWriteError, Stdio.Stdio> =>
	Effect.gen(function* () {
		yield* Effect.logDebug('writing hook stderr').pipe(
			Effect.annotateLogs({ byteLength: text.length })
		);
		const stdio = yield* Stdio.Stdio;
		yield* Stream.run(Stream.make(text), stdio.stderr()).pipe(
			Effect.mapError((cause) => new HookStdoutWriteError({ cause }))
		);
	}).pipe(Effect.withLogSpan('Hook.writeStderr'));

// ---------------------------------------------------------------------------
// Per-hook execution
// ---------------------------------------------------------------------------

/**
 * Run a single hook against a pre-parsed JSON value (already JSON.parsed
 * into an `unknown`). Used by both `runHookProgram` and `dispatch` — the
 * former reads stdin first, the latter peeks the event name before
 * choosing which hook to apply.
 *
 * @internal
 */
const runHookFromParsed = <In extends HookEnvelope, Out>(
	hook: HookDefinition<In, Out>,
	parsed: unknown
): Effect.Effect<void, RunnerError, Stdio.Stdio> =>
	Effect.gen(function* () {
		yield* Effect.logDebug('decoding hook input').pipe(
			Effect.annotateLogs({ expectedEvent: hook.event })
		);
		const input = yield* Schema.decodeUnknownEffect(hook.inputSchema)(
			parsed
		).pipe(
			Effect.mapError(
				(cause) =>
					new HookInputDecodeError({
						cause,
						phase: 'schema' as const
					})
			)
		);
		yield* Effect.annotateCurrentSpan('hook.event', input.hook_event_name);
		yield* Effect.logDebug('running hook handler').pipe(
			Effect.annotateLogs({ hookEventName: input.hook_event_name })
		);
		const envelope = HookEnvelope.make({
			session_id: input.session_id,
			transcript_path: input.transcript_path,
			cwd: input.cwd,
			hook_event_name: input.hook_event_name,
			...(input.permission_mode !== undefined && {
				permission_mode: input.permission_mode
			}),
			...(input.effort !== undefined && { effort: input.effort }),
			...(input.agent_id !== undefined && { agent_id: input.agent_id }),
			...(input.agent_type !== undefined && { agent_type: input.agent_type })
		});
		const output = yield* hook.handler(input).pipe(
			Effect.provide(HookContext.layer(envelope)),
			Effect.mapError((cause) => new HookHandlerError({ cause }))
		);
		if (isHookProcessOutput(output)) {
			if (output.stdout !== undefined) {
				yield* writeRawStdout(output.stdout);
			}
			if (output.stderr !== undefined) {
				yield* writeStderr(output.stderr);
			}
			if (output.exitCode !== 0) {
				return yield* Effect.fail(
					new HookControlledExit({ code: output.exitCode })
				);
			}
			return;
		}
		yield* Effect.logDebug('encoding hook output').pipe(
			Effect.annotateLogs({ hookEventName: input.hook_event_name })
		);
		const encoded = yield* Schema.encodeUnknownEffect(
			Schema.fromJsonString(hook.outputSchema)
		)(output).pipe(
			Effect.mapError((cause) => new HookOutputEncodeError({ cause }))
		);
		yield* writeStdout(encoded);
	}).pipe(Effect.withLogSpan('Hook.runHookFromParsed'));

// ---------------------------------------------------------------------------
// Runner programs
// ---------------------------------------------------------------------------

/**
 * Build the Effect program that executes one hook invocation end-to-end.
 *
 * Pure Effect form of the runner, exposed primarily for testing.
 * Production code should use `runMain`.
 *
 * @category Runner
 * @since 0.1.0
 */
export const runHookProgram = <In extends HookEnvelope, Out>(
	hook: HookDefinition<In, Out>
): Effect.Effect<void, RunnerError, Stdio.Stdio> =>
	Effect.gen(function* () {
		yield* Effect.logDebug('starting single hook runner').pipe(
			Effect.annotateLogs({ hookEventName: hook.event })
		);
		const raw = yield* readStdin;
		const parsed = yield* Schema.decodeUnknownEffect(
			Schema.UnknownFromJsonString
		)(raw).pipe(
			Effect.mapError(
				(cause) =>
					new HookInputDecodeError({ cause, phase: 'json' as const })
			)
		);
		yield* runHookFromParsed(hook, parsed);
	}).pipe(Effect.withLogSpan('Hook.runHookProgram'));

/**
 * Build the Effect program that reads stdin, peeks `hook_event_name`,
 * and dispatches to the matching handler in the map. If no handler is
 * registered for the event, the program succeeds with no output.
 *
 * @category Runner
 * @since 0.1.0
 */
export const runDispatchProgram = (
	hooks: DispatchMap
): Effect.Effect<void, RunnerError, Stdio.Stdio> =>
	Effect.gen(function* () {
		yield* Effect.logDebug('starting hook dispatch runner').pipe(
			Effect.annotateLogs({ registeredHandlers: Object.keys(hooks).length })
		);
		const raw = yield* readStdin;
		const parsed = yield* Schema.decodeUnknownEffect(
			Schema.UnknownFromJsonString
		)(raw).pipe(
			Effect.mapError(
				(cause) =>
					new HookInputDecodeError({ cause, phase: 'json' as const })
			)
		);
		const envelope = yield* Schema.decodeUnknownEffect(HookEnvelope)(
			parsed
		).pipe(
			Effect.mapError(
				(cause) =>
					new HookInputDecodeError({
						cause,
						phase: 'schema' as const
					})
			)
		);
		yield* Effect.annotateCurrentSpan('hook.event', envelope.hook_event_name);
		const hook = hooks[envelope.hook_event_name];
		if (hook === undefined) {
			yield* Effect.logDebug('no registered hook handler for event').pipe(
				Effect.annotateLogs({ hookEventName: envelope.hook_event_name })
			);
			return;
		}
		yield* runHookFromParsed(hook, parsed);
	}).pipe(Effect.withLogSpan('Hook.runDispatchProgram'));

// ---------------------------------------------------------------------------
// Teardown: Effect Exit → OS exit code
// ---------------------------------------------------------------------------

/**
 * Custom teardown that maps the runner's typed errors to Claude Code's
 * hook exit-code convention:
 *
 * - `0` success
 * - handler-authored `HookProcessOutput` exits use their requested code
 * - `2` for `HookInputDecodeError` (Claude Code interprets exit 2 per
 *   event: blocking for PreToolUse, PermissionRequest, ConfigChange, etc.;
 *   feedback-only or ignored for several observability events)
 * - `1` non-blocking runner error (stdin read, handler crash, encode, write)
 * - `130` fiber interruption (SIGINT-style)
 *
 * @category Runner
 * @since 0.1.0
 */
export const hookTeardown: Runtime.Teardown = <E, A>(
	exit: Exit.Exit<E, A>,
	onExit: (code: number) => void
) => {
	if (Exit.isSuccess(exit)) return onExit(0);
	if (Cause.hasInterruptsOnly(exit.cause)) return onExit(130);
	const squashed = Cause.squash(exit.cause);
	if (squashed instanceof HookControlledExit) return onExit(squashed.code);
	if (squashed instanceof HookInputDecodeError) return onExit(2);
	return onExit(1);
};

// ---------------------------------------------------------------------------
// Public runMain / dispatch
// ---------------------------------------------------------------------------

/**
 * Run a single-event hook definition as the main program of the current
 * process.
 *
 * @category Runner
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import { Hook } from 'effect-claudecode'
 *
 * const hook = Hook.PreToolUse.define({
 *   handler: (input) => Effect.succeed(Hook.PreToolUse.allow())
 * })
 *
 * Hook.runMain(hook)
 * ```
 */
export const runMain = <In extends HookEnvelope, Out>(
	hook: HookDefinition<In, Out>
): void =>
	platformRunMain(
		runHookProgram(hook).pipe(Effect.provide(NodeStdio.layer)),
		{ teardown: hookTeardown }
	);

/**
 * Run a multi-event dispatch script as the main program of the current
 * process. The map's keys are hook event names and values are
 * `HookDefinition`s produced by each event's `define()` factory.
 *
 * @category Runner
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import { Hook } from 'effect-claudecode'
 *
 * Hook.dispatch({
 *   PreToolUse: Hook.PreToolUse.define({
 *     handler: () => Effect.succeed(Hook.PreToolUse.allow())
 *   }),
 *   PostToolUse: Hook.PostToolUse.define({
 *     handler: () => Effect.succeed(Hook.PostToolUse.passthrough())
 *   })
 * })
 * ```
 */
export const dispatch = (hooks: DispatchMap): void =>
	platformRunMain(
		runDispatchProgram(hooks).pipe(Effect.provide(NodeStdio.layer)),
		{ teardown: hookTeardown }
	);
