/**
 * Notification hook event.
 *
 * Fires when Claude Code sends a notification to the user — permission
 * prompts, idle prompts, auth success, elicitation dialog. Supports a
 * matcher on `notification_type`. The hook cannot block the notification
 * but may annotate it via `additionalContext`.
 * See https://code.claude.com/docs/en/hooks#notification.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import * as Matcher from '../Matcher.ts';
import type { HookDefinition } from '../Runner.ts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const NotificationType = Schema.Literals([
	'permission_prompt',
	'idle_prompt',
	'auth_success',
	'elicitation_dialog'
] as const);

export class Input extends Schema.Class<Input>('NotificationInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('Notification'),
		message: Schema.String,
		title: Schema.optional(Schema.String),
		notification_type: NotificationType
	},
	{ description: 'Input for the Notification hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'NotificationHookSpecificOutput'
)({
	hookEventName: Schema.Literal('Notification'),
	additionalContext: Schema.optional(Schema.String)
}) {}

export class Output extends Schema.Class<Output>('NotificationOutput')({
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
 * No-op output — notification proceeds unchanged.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const passthrough = (): Output =>
	new Output({ continue: undefined });

/**
 * Attach additional context to the notification.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const addContext = (additionalContext: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'Notification',
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
	event: 'Notification',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build a Notification hook that only handles matching `notification_type`
 * values.
 *
 * @category Constructors
 * @since 0.1.0
 */
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
			select: (input) => input.notification_type,
			onMatch: config.handler,
			onMismatch:
				config.onMismatch ?? (() => Effect.succeed(passthrough()))
		})
	});
