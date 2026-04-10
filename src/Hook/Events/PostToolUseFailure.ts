/**
 * PostToolUseFailure hook event.
 *
 * Fires after a tool call fails or is interrupted. A handler can attach
 * additional context that Claude will see in place of (or alongside) the
 * raw error. Supports a matcher on `tool_name`.
 * See https://code.claude.com/docs/en/hooks#posttooluseailure.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import * as Matcher from '../Matcher.ts';
import type { HookDefinition } from '../Runner.ts';

export class Input extends Schema.Class<Input>('PostToolUseFailureInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('PostToolUseFailure'),
		tool_name: Schema.String,
		tool_input: Schema.Record(Schema.String, Schema.Unknown),
		tool_use_id: Schema.optional(Schema.String),
		error: Schema.String,
		is_interrupt: Schema.optional(Schema.Boolean)
	},
	{ description: 'Input for the PostToolUseFailure hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'PostToolUseFailureHookSpecificOutput'
)({
	hookEventName: Schema.Literal('PostToolUseFailure'),
	additionalContext: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('PostToolUseFailureOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

export const passthrough = (): Output =>
	new Output({ continue: undefined });

export const addContext = (additionalContext: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PostToolUseFailure',
			additionalContext
		})
	});

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'PostToolUseFailure',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build a PostToolUseFailure hook that only handles matching `tool_name`
 * values.
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
