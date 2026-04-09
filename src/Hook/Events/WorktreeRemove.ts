/**
 * WorktreeRemove hook event.
 *
 * Fires when Claude Code is about to remove a git worktree. Observability
 * and cleanup only — output is not acted on. Does not support a matcher.
 * See https://code.claude.com/docs/en/hooks#worktreeremove.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export class Input extends Schema.Class<Input>('WorktreeRemoveInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('WorktreeRemove'),
		worktree_path: Schema.String
	},
	{ description: 'Input for the WorktreeRemove hook event.' }
) {}

export class Output extends Schema.Class<Output>('WorktreeRemoveOutput')({
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
	event: 'WorktreeRemove',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
