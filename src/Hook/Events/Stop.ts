/**
 * Stop hook event.
 *
 * Fires when Claude finishes responding and is about to end its turn.
 * A handler can return `block` with a reason to force Claude to continue
 * the conversation instead of stopping. Does not support a matcher.
 * See https://code.claude.com/docs/en/hooks#stop.
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

export class Input extends Schema.Class<Input>('StopInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('Stop'),
		stop_hook_active: Schema.Boolean,
		custom_instructions: Schema.optional(Schema.String)
	},
	{ description: 'Input for the Stop hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class Output extends Schema.Class<Output>('StopOutput')({
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

/**
 * Allow Claude to stop its turn (the default).
 *
 * @category Decisions
 * @since 0.1.0
 */
export const allowStop = (): Output =>
	new Output({ continue: undefined });

/**
 * Force Claude to continue responding by emitting `decision: "block"`.
 * The `reason` is fed back to Claude as instructions for the continuation.
 *
 * @category Decisions
 * @since 0.1.0
 */
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
	event: 'Stop',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
