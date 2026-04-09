/**
 * PostCompact hook event.
 *
 * Fires after Claude Code compacts the conversation context. Supports a
 * matcher on `trigger` (`manual` | `auto`). Observability-only —
 * there is no decision control.
 * See https://code.claude.com/docs/en/hooks#postcompact.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export const Trigger = Schema.Literals(['manual', 'auto'] as const);

export class Input extends Schema.Class<Input>('PostCompactInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('PostCompact'),
		trigger: Trigger
	},
	{ description: 'Input for the PostCompact hook event.' }
) {}

export class Output extends Schema.Class<Output>('PostCompactOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String)
}) {}

export const passthrough = (): Output =>
	new Output({ continue: undefined });

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'PostCompact',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
