/**
 * SubagentStart hook event.
 *
 * Fires when a subagent is spawned. A handler can inject additional
 * context the subagent will see. Supports a matcher on `agent_type`.
 * The subagent cannot be blocked from starting.
 * See https://code.claude.com/docs/en/hooks#subagentstart.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export class Input extends Schema.Class<Input>('SubagentStartInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('SubagentStart'),
		agent_id: Schema.String,
		agent_type: Schema.String
	},
	{ description: 'Input for the SubagentStart hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'SubagentStartHookSpecificOutput'
)({
	hookEventName: Schema.Literal('SubagentStart'),
	additionalContext: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('SubagentStartOutput')({
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
			hookEventName: 'SubagentStart',
			additionalContext
		})
	});

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'SubagentStart',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
