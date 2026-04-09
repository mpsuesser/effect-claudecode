/**
 * SessionEnd hook event.
 *
 * Fires when a session terminates (clear, resume, logout, exit). Supports
 * a matcher on `exit_reason`. Observability-only — the hook's output is
 * not acted on. See https://code.claude.com/docs/en/hooks#sessionend.
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

export const ExitReason = Schema.Literals([
	'clear',
	'resume',
	'logout',
	'prompt_input_exit',
	'bypass_permissions_disabled',
	'other'
] as const);

export class Input extends Schema.Class<Input>('SessionEndInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('SessionEnd'),
		exit_reason: ExitReason
	},
	{ description: 'Input for the SessionEnd hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class Output extends Schema.Class<Output>('SessionEndOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String)
}) {}

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

export const passthrough = (): Output =>
	new Output({ continue: undefined });

// ---------------------------------------------------------------------------
// define
// ---------------------------------------------------------------------------

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'SessionEnd',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
