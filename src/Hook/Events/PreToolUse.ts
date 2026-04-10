/**
 * PreToolUse hook event.
 *
 * Fires before Claude Code executes a tool call. A handler can return
 * `allow`, `deny`, `ask`, or `defer` to control whether the tool is run.
 * Supports a regex matcher on `tool_name`. See
 * https://code.claude.com/docs/en/hooks#pretooluse.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { HookToolDecodeError } from '../../Errors.ts';
import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';
import * as Tool from '../Tool.ts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Decoded PreToolUse hook input received on stdin.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class Input extends Schema.Class<Input>('PreToolUseInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('PreToolUse'),
		tool_name: Schema.String,
		tool_input: Schema.Record(Schema.String, Schema.Unknown),
		tool_use_id: Schema.optional(Schema.String)
	},
	{ description: 'Input for the PreToolUse hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Valid `permissionDecision` values. `defer` defers to other hooks /
 * Claude Code's permission system.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const PermissionDecision = Schema.Literals([
	'allow',
	'deny',
	'ask',
	'defer'
] as const);

/**
 * `hookSpecificOutput` payload for a PreToolUse hook. This is where the
 * permission decision lives.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'PreToolUseHookSpecificOutput'
)({
	hookEventName: Schema.Literal('PreToolUse'),
	permissionDecision: PermissionDecision,
	permissionDecisionReason: Schema.optional(Schema.String),
	updatedInput: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
	additionalContext: Schema.optional(Schema.String)
}) {}

/**
 * Full PreToolUse hook output, including universal fields.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class Output extends Schema.Class<Output>('PreToolUseOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

/**
 * Build an `allow` decision. The tool call proceeds.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const allow = (reason?: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PreToolUse',
			permissionDecision: 'allow',
			permissionDecisionReason: reason
		})
	});

/**
 * Build a `deny` decision with a required explanation. The tool call
 * is blocked and the reason is fed back to Claude.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const deny = (reason: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PreToolUse',
			permissionDecision: 'deny',
			permissionDecisionReason: reason
		})
	});

/**
 * Build an `ask` decision. Claude Code shows the user a permission
 * prompt for the tool call.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const ask = (reason?: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PreToolUse',
			permissionDecision: 'ask',
			permissionDecisionReason: reason
		})
	});

/**
 * Build a `defer` decision. No opinion from this hook — other hooks
 * and the permission system continue to evaluate the tool call.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const defer = (reason?: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PreToolUse',
			permissionDecision: 'defer',
			permissionDecisionReason: reason
		})
	});

/**
 * Build an `allow` decision that replaces the tool input with a
 * modified version.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const allowWithUpdatedInput = (
	updatedInput: Readonly<Record<string, unknown>>,
	reason?: string
): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PreToolUse',
			permissionDecision: 'allow',
			permissionDecisionReason: reason,
			updatedInput
		})
	});

// ---------------------------------------------------------------------------
// define
// ---------------------------------------------------------------------------

/**
 * Build a runnable PreToolUse hook from a handler effect.
 *
 * @category Constructors
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import { Hook } from 'effect-claudecode'
 *
 * const hook = Hook.PreToolUse.define({
 *   handler: (input) => Effect.gen(function* () {
 *     if (input.tool_name !== 'Bash') return Hook.PreToolUse.allow()
 *     const cmd = (input.tool_input as { command?: string }).command ?? ''
 *     return cmd.includes('rm -rf /')
 *       ? Hook.PreToolUse.deny('destructive')
 *       : Hook.PreToolUse.allow()
 *   })
 * })
 *
 * Hook.runMain(hook)
 * ```
 */
export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'PreToolUse',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build a PreToolUse hook that only handles a specific supported tool.
 * Non-matching tool invocations default to `allow()`.
 *
 * @category Constructors
 * @since 0.1.0
 */
type BashOnToolConfig = {
	readonly toolName: 'Bash';
	readonly handler: (
		input: Tool.DecodedPreToolUse<'Bash'>
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onMismatch?: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onDecodeError?: (
		error: HookToolDecodeError,
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
};

type ReadOnToolConfig = {
	readonly toolName: 'Read';
	readonly handler: (
		input: Tool.DecodedPreToolUse<'Read'>
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onMismatch?: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onDecodeError?: (
		error: HookToolDecodeError,
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
};

type OnToolConfig = BashOnToolConfig | ReadOnToolConfig;

export function onTool(config: BashOnToolConfig): HookDefinition<Input, Output>;
export function onTool(config: ReadOnToolConfig): HookDefinition<Input, Output>;
export function onTool(config: OnToolConfig): HookDefinition<Input, Output> {
	return define({
		handler: (input): Effect.Effect<Output, unknown, HookContext.Service> => {
			if (input.tool_name !== config.toolName) {
				return config.onMismatch?.(input) ?? Effect.succeed(allow());
			}
			return config.toolName === 'Bash'
				? Tool.decodePreToolUse('Bash', input).pipe(
						Effect.flatMap(config.handler),
						Effect.catch((error) =>
							error instanceof HookToolDecodeError
								? config.onDecodeError?.(error, input) ?? Effect.fail(error)
								: Effect.fail(error)
						)
				  )
				: Tool.decodePreToolUse('Read', input).pipe(
						Effect.flatMap(config.handler),
						Effect.catch((error) =>
							error instanceof HookToolDecodeError
								? config.onDecodeError?.(error, input) ?? Effect.fail(error)
								: Effect.fail(error)
						)
				  );
		}
	});
}

/**
 * Build a PreToolUse hook from a custom typed tool adapter.
 * Non-matching tool invocations default to `allow()`.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const onAdapter = <TName extends string, TTool>(config: {
	readonly adapter: Tool.PreToolAdapter<TName, TTool>;
	readonly handler: (
		input: Tool.DecodedPreToolUseWith<TTool>
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onMismatch?: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onDecodeError?: (
		error: HookToolDecodeError,
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> =>
	define({
		handler: (input): Effect.Effect<Output, unknown, HookContext.Service> => {
			if (input.tool_name !== config.adapter.toolName) {
				return config.onMismatch?.(input) ?? Effect.succeed(allow());
			}
			return Tool.decodePreToolUseWith(config.adapter, input).pipe(
				Effect.flatMap(config.handler),
				Effect.catch((error) =>
					error instanceof HookToolDecodeError
						? config.onDecodeError?.(error, input) ?? Effect.fail(error)
						: Effect.fail(error)
				)
			);
		}
	});
