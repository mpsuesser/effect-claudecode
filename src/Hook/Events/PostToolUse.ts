/**
 * PostToolUse hook event.
 *
 * Fires after a tool call completes successfully. A handler can block the
 * tool result (feeding feedback back to Claude), inject additional context,
 * or replace the tool's response (for MCP tools). Supports a regex matcher
 * on `tool_name`. See https://code.claude.com/docs/en/hooks#posttooluse.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { HookToolDecodeError } from '../../Errors.ts';
import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import * as Matcher from '../Matcher.ts';
import type { HookDefinition } from '../Runner.ts';
import * as Tool from '../Tool.ts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export class Input extends Schema.Class<Input>('PostToolUseInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('PostToolUse'),
		tool_name: Schema.String,
		tool_input: Schema.Record(Schema.String, Schema.Unknown),
		tool_response: Schema.Record(Schema.String, Schema.Unknown),
		tool_use_id: Schema.optional(Schema.String)
	},
	{ description: 'Input for the PostToolUse hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'PostToolUseHookSpecificOutput'
)({
	hookEventName: Schema.Literal('PostToolUse'),
	additionalContext: Schema.optional(Schema.String),
	updatedMCPToolOutput: Schema.optional(Schema.Unknown)
}) {}

export class Output extends Schema.Class<Output>('PostToolUseOutput')({
	decision: Schema.optional(Schema.Literal('block')),
	reason: Schema.optional(Schema.String),
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
 * No-op output — tool result passes through unchanged.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const passthrough = (): Output =>
	new Output({ continue: undefined });

/**
 * Block the tool result and feed the reason back to Claude.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const block = (reason: string): Output =>
	new Output({ decision: 'block', reason });

/**
 * Inject additional context into the transcript without blocking.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const addContext = (additionalContext: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PostToolUse',
			additionalContext
		})
	});

/**
 * Replace the MCP tool's response. Only valid for MCP tool invocations.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const replaceMcpOutput = (
	updatedMCPToolOutput: unknown,
	additionalContext?: string
): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PostToolUse',
			additionalContext,
			updatedMCPToolOutput
		})
	});

// ---------------------------------------------------------------------------
// define
// ---------------------------------------------------------------------------

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'PostToolUse',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build a PostToolUse hook that only handles a specific supported tool.
 * Non-matching tool invocations default to `passthrough()`.
 *
 * @category Constructors
 * @since 0.1.0
 */
type BashOnToolConfig = {
	readonly toolName: 'Bash';
	readonly handler: (
		input: Tool.DecodedPostToolUse<'Bash'>
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
		input: Tool.DecodedPostToolUse<'Read'>
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
				return config.onMismatch?.(input) ?? Effect.succeed(passthrough());
			}
			return config.toolName === 'Bash'
				? Tool.decodePostToolUse('Bash', input).pipe(
						Effect.flatMap(config.handler),
						Effect.catch((error) =>
							error instanceof HookToolDecodeError
								? config.onDecodeError?.(error, input) ?? Effect.fail(error)
								: Effect.fail(error)
						)
				  )
				: Tool.decodePostToolUse('Read', input).pipe(
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
 * Build a PostToolUse hook that only handles matching `tool_name` values.
 * Non-matching tool invocations default to `passthrough()`.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const onMatcher = (config: {
	readonly matcher: string | RegExp;
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onMismatch?: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> =>
	define({
		handler: Matcher.handleMatcher({
			matcher: config.matcher,
			select: (input) => input.tool_name,
			onMatch: config.handler,
			onMismatch:
				config.onMismatch ?? (() => Effect.succeed(passthrough()))
		})
	});

/**
 * Build a PostToolUse hook from a custom typed tool adapter.
 * Non-matching tool invocations default to `passthrough()`.
 *
 * @category Constructors
 * @since 0.1.0
 */
export const onAdapter = <TName extends string, TTool, TResponse>(config: {
	readonly adapter: Tool.PostToolAdapter<TName, TTool, TResponse>;
	readonly handler: (
		input: Tool.DecodedPostToolUseWith<TTool, TResponse>
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
				return config.onMismatch?.(input) ?? Effect.succeed(passthrough());
			}
			return Tool.decodePostToolUseWith(config.adapter, input).pipe(
				Effect.flatMap(config.handler),
				Effect.catch((error) =>
					error instanceof HookToolDecodeError
						? config.onDecodeError?.(error, input) ?? Effect.fail(error)
						: Effect.fail(error)
				)
			);
		}
	});
