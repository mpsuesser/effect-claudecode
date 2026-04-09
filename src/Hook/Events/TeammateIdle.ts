/**
 * TeammateIdle hook event.
 *
 * Fires when a teammate in an agent-team context is about to go idle.
 * A handler can prevent idle by returning `continue: false`. Does not
 * support a matcher.
 * See https://code.claude.com/docs/en/hooks#teammateidle.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export class Input extends Schema.Class<Input>('TeammateIdleInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('TeammateIdle'),
		team_name: Schema.optional(Schema.String),
		teammate_name: Schema.optional(Schema.String)
	},
	{ description: 'Input for the TeammateIdle hook event.' }
) {}

export class Output extends Schema.Class<Output>('TeammateIdleOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String)
}) {}

export const allowIdle = (): Output =>
	new Output({ continue: undefined });

/**
 * Prevent the teammate from going idle by setting `continue: false`.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const keepWorking = (reason: string): Output =>
	new Output({ continue: false, stopReason: reason });

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'TeammateIdle',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
