/**
 * PostToolBatch hook event.
 *
 * Fires after a full batch of parallel tool calls resolves, before the
 * next model call. Does not support a matcher.
 * See https://code.claude.com/docs/en/hooks#posttoolbatch.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export class ToolCall extends Schema.Class<ToolCall>('PostToolBatchToolCall')({
	tool_name: Schema.String,
	tool_input: Schema.Record(Schema.String, Schema.Unknown),
	tool_use_id: Schema.optional(Schema.String),
	tool_response: Schema.Unknown
}) {}

export class Input extends Schema.Class<Input>('PostToolBatchInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('PostToolBatch'),
		tool_calls: Schema.Array(ToolCall)
	},
	{ description: 'Input for the PostToolBatch hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'PostToolBatchHookSpecificOutput'
)({
	hookEventName: Schema.Literal('PostToolBatch'),
	additionalContext: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('PostToolBatchOutput')({
	decision: Schema.optional(Schema.Literal('block')),
	reason: Schema.optional(Schema.String),
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	terminalSequence: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

export const passthrough = (): Output =>
	new Output({ continue: undefined });

export const block = (reason: string): Output =>
	new Output({ decision: 'block', reason });

export const addContext = (additionalContext: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PostToolBatch',
			additionalContext
		})
	});

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'PostToolBatch',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
