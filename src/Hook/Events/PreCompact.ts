/**
 * PreCompact hook event.
 *
 * Fires before Claude Code compacts the conversation context. Supports
 * a matcher on `trigger` (`manual` or `auto`).
 * See https://code.claude.com/docs/en/hooks#precompact.
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

export const Trigger = Schema.Literals(['manual', 'auto'] as const);

export class Input extends Schema.Class<Input>('PreCompactInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('PreCompact'),
		trigger: Trigger
	},
	{ description: 'Input for the PreCompact hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class Output extends Schema.Class<Output>('PreCompactOutput')({
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
	event: 'PreCompact',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
