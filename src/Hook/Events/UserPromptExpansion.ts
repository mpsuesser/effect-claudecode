/**
 * UserPromptExpansion hook event.
 *
 * Fires when a user-typed slash command expands into a prompt before it
 * reaches Claude. Supports a matcher on `command_name`.
 * See https://code.claude.com/docs/en/hooks#userpromptexpansion.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import * as Matcher from '../Matcher.ts';
import type { HookDefinition } from '../Runner.ts';

export const ExpansionType = Schema.Literals([
	'slash_command',
	'mcp_prompt'
] as const);

export class Input extends Schema.Class<Input>('UserPromptExpansionInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('UserPromptExpansion'),
		expansion_type: ExpansionType,
		command_name: Schema.String,
		command_args: Schema.String,
		command_source: Schema.String,
		prompt: Schema.String
	},
	{ description: 'Input for the UserPromptExpansion hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'UserPromptExpansionHookSpecificOutput'
)({
	hookEventName: Schema.Literal('UserPromptExpansion'),
	additionalContext: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('UserPromptExpansionOutput')({
	decision: Schema.optional(Schema.Literal('block')),
	reason: Schema.optional(Schema.String),
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	terminalSequence: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

export const allow = (): Output => new Output({ continue: undefined });

export const block = (reason: string): Output =>
	new Output({ decision: 'block', reason });

export const addContext = (additionalContext: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'UserPromptExpansion',
			additionalContext
		})
	});

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'UserPromptExpansion',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

export const onMatcher = (config: {
	readonly matcher: string | RegExp;
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
	readonly onMismatch?: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> =>
	define({
		handler: Matcher.handleMatcher({
			matcher: config.matcher,
			select: (input) => input.command_name,
			onMatch: config.handler,
			onMismatch: config.onMismatch ?? (() => Effect.succeed(allow()))
		})
	});
