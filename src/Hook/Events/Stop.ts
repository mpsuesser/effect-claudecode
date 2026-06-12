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

export class BackgroundTask extends Schema.Class<BackgroundTask>(
	'BackgroundTask'
)({
	id: Schema.String,
	type: Schema.String,
	status: Schema.String,
	description: Schema.optional(Schema.String),
	command: Schema.optional(Schema.String),
	agent_type: Schema.optional(Schema.String),
	server: Schema.optional(Schema.String),
	tool: Schema.optional(Schema.String),
	name: Schema.optional(Schema.String)
}) {}

export class SessionCron extends Schema.Class<SessionCron>('SessionCron')({
	id: Schema.String,
	schedule: Schema.String,
	recurring: Schema.Boolean,
	prompt: Schema.String
}) {}

export class Input extends Schema.Class<Input>('StopInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('Stop'),
		stop_hook_active: Schema.Boolean,
		last_assistant_message: Schema.optional(Schema.String),
		background_tasks: Schema.optional(Schema.Array(BackgroundTask)),
		session_crons: Schema.optional(Schema.Array(SessionCron))
	},
	{ description: 'Input for the Stop hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'StopHookSpecificOutput'
)({
	hookEventName: Schema.Literal('Stop'),
	additionalContext: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('StopOutput')({
	decision: Schema.optional(Schema.Literal('block')),
	reason: Schema.optional(Schema.String),
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	terminalSequence: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
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

export const addContext = (additionalContext: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'Stop',
			additionalContext
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
	event: 'Stop',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
