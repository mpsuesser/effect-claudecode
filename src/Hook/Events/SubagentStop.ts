/**
 * SubagentStop hook event.
 *
 * Fires when a subagent finishes responding. Like Stop, a handler can
 * return `block` to force the subagent to continue. Supports a matcher
 * on `agent_type`. Carries the subagent's transcript path and last
 * assistant message. See https://code.claude.com/docs/en/hooks#subagentstop.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export class Input extends Schema.Class<Input>('SubagentStopInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('SubagentStop'),
		stop_hook_active: Schema.Boolean,
		agent_id: Schema.String,
		agent_type: Schema.String,
		agent_transcript_path: Schema.String,
		last_assistant_message: Schema.String
	},
	{ description: 'Input for the SubagentStop hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class Output extends Schema.Class<Output>('SubagentStopOutput')({
	decision: Schema.optional(Schema.Literal('block')),
	reason: Schema.optional(Schema.String),
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String)
}) {}

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

export const allowStop = (): Output =>
	new Output({ continue: undefined });

export const block = (reason: string): Output =>
	new Output({ decision: 'block', reason });

// ---------------------------------------------------------------------------
// define
// ---------------------------------------------------------------------------

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'SubagentStop',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
