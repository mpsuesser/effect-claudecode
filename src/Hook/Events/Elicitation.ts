/**
 * Elicitation hook event.
 *
 * Fires when an MCP server requests user input via an elicitation flow.
 * A handler can accept (with form field values), decline, or cancel the
 * request without user interaction. Supports a matcher on
 * `mcp_server_name`.
 * See https://code.claude.com/docs/en/hooks#elicitation.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export const Action = Schema.Literals(['accept', 'decline', 'cancel'] as const);

export class Input extends Schema.Class<Input>('ElicitationInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('Elicitation'),
		mcp_server_name: Schema.String,
		tool_name: Schema.optional(Schema.String),
		tool_input: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
	},
	{ description: 'Input for the Elicitation hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'ElicitationHookSpecificOutput'
)({
	hookEventName: Schema.Literal('Elicitation'),
	action: Action,
	content: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
}) {}

export class Output extends Schema.Class<Output>('ElicitationOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

export const accept = (
	content?: Readonly<Record<string, unknown>>
): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'Elicitation',
			action: 'accept',
			content
		})
	});

export const decline = (): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'Elicitation',
			action: 'decline'
		})
	});

export const cancel = (): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'Elicitation',
			action: 'cancel'
		})
	});

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'Elicitation',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
