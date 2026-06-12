/**
 * WorktreeCreate hook event.
 *
 * Fires when Claude Code is about to create a git worktree (e.g. for an
 * isolated subagent). Command-based hooks must print the worktree path
 * to stdout; HTTP-based hooks return the path as
 * `hookSpecificOutput.worktreePath`. Does not support a matcher.
 * See https://code.claude.com/docs/en/hooks#worktreecreate.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import {
	rawStdout,
	type HookDefinition,
	type HookProcessOutput
} from '../Runner.ts';

export class Input extends Schema.Class<Input>('WorktreeCreateInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('WorktreeCreate'),
		name: Schema.String
	},
	{ description: 'Input for the WorktreeCreate hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'WorktreeCreateHookSpecificOutput'
)({
	hookEventName: Schema.Literal('WorktreeCreate'),
	worktreePath: Schema.String
}) {}

export class Output extends Schema.Class<Output>('WorktreeCreateOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	terminalSequence: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

/**
 * Indicate that the worktree was created at the given path.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const created = (worktreePath: string): HookProcessOutput =>
	rawStdout(`${worktreePath}\n`);

/**
 * Build the JSON form used by HTTP WorktreeCreate hooks.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const createdHttp = (worktreePath: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'WorktreeCreate',
			worktreePath
		})
	});

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output | HookProcessOutput, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({ 
	event: 'WorktreeCreate',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
