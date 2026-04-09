/**
 * TaskCreated hook event.
 *
 * Fires when a task is created via `TaskCreate` (agent-team context).
 * A handler can block task creation via `continue: false` with a reason.
 * Does not support a matcher.
 * See https://code.claude.com/docs/en/hooks#taskcreated.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export class Input extends Schema.Class<Input>('TaskCreatedInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('TaskCreated'),
		task_id: Schema.String,
		task_subject: Schema.String,
		task_description: Schema.optional(Schema.String),
		teammate_name: Schema.optional(Schema.String),
		team_name: Schema.optional(Schema.String)
	},
	{ description: 'Input for the TaskCreated hook event.' }
) {}

export class Output extends Schema.Class<Output>('TaskCreatedOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String)
}) {}

export const allow = (): Output => new Output({ continue: undefined });

/**
 * Block the task creation by setting `continue: false` with a reason.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const block = (reason: string): Output =>
	new Output({ continue: false, stopReason: reason });

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'TaskCreated',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
