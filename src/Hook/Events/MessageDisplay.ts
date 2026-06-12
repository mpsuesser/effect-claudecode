/**
 * MessageDisplay hook event.
 *
 * Fires while assistant message text is displayed. Display-only: the
 * transcript and Claude's context keep the original text. Does not
 * support a matcher.
 * See https://code.claude.com/docs/en/hooks#messagedisplay.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export class Input extends Schema.Class<Input>('MessageDisplayInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('MessageDisplay'),
		turn_id: Schema.String,
		message_id: Schema.String,
		index: Schema.Number,
		final: Schema.Boolean,
		delta: Schema.String
	},
	{ description: 'Input for the MessageDisplay hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'MessageDisplayHookSpecificOutput'
)({
	hookEventName: Schema.Literal('MessageDisplay'),
	displayContent: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('MessageDisplayOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	terminalSequence: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

export const passthrough = (): Output =>
	new Output({ continue: undefined });

export const display = (displayContent: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'MessageDisplay',
			displayContent
		})
	});

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'MessageDisplay',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
