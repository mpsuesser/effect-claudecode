/**
 * UserPromptSubmit hook event.
 *
 * Fires when the user submits a prompt, before Claude processes it. A
 * handler can block the prompt entirely (erasing it from context),
 * inject additional context, or rename the session. Does not support
 * a matcher. See https://code.claude.com/docs/en/hooks#userpromptsubmit.
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

export class Input extends Schema.Class<Input>('UserPromptSubmitInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('UserPromptSubmit'),
		prompt: Schema.String
	},
	{ description: 'Input for the UserPromptSubmit hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'UserPromptSubmitHookSpecificOutput'
)({
	hookEventName: Schema.Literal('UserPromptSubmit'),
	additionalContext: Schema.optional(Schema.String),
	sessionTitle: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('UserPromptSubmitOutput')({
	decision: Schema.optional(Schema.Literal('block')),
	reason: Schema.optional(Schema.String),
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

/**
 * Allow the prompt to proceed without modification.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const allow = (): Output => new Output({ continue: undefined });

/**
 * Block the prompt. It is erased from context and the reason is shown
 * to the user.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const block = (reason: string): Output =>
	new Output({ decision: 'block', reason });

/**
 * Allow the prompt and inject additional context Claude will see.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const addContext = (additionalContext: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'UserPromptSubmit',
			additionalContext
		})
	});

/**
 * Rename the session title. Often paired with `addContext`.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const renameSession = (
	sessionTitle: string,
	additionalContext?: string
): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'UserPromptSubmit',
			additionalContext,
			sessionTitle
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
	event: 'UserPromptSubmit',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
