/**
 * ConfigChange hook event.
 *
 * Fires when a Claude Code configuration file changes during a session
 * (user/project/local settings, policy settings, or skills). A handler
 * can return `decision: "block"` to prevent the config change from taking
 * effect — except `policy_settings` changes, which cannot be blocked.
 * Supports a matcher on `config_source`.
 * See https://code.claude.com/docs/en/hooks#configchange.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import * as Matcher from '../Matcher.ts';
import type { HookDefinition } from '../Runner.ts';

export const ConfigSource = Schema.Literals([
	'user_settings',
	'project_settings',
	'local_settings',
	'policy_settings',
	'skills'
] as const);

export class Input extends Schema.Class<Input>('ConfigChangeInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('ConfigChange'),
		config_source: ConfigSource
	},
	{ description: 'Input for the ConfigChange hook event.' }
) {}

export class Output extends Schema.Class<Output>('ConfigChangeOutput')({
	decision: Schema.optional(Schema.Literal('block')),
	reason: Schema.optional(Schema.String),
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String)
}) {}

export const allow = (): Output => new Output({ continue: undefined });

export const block = (reason: string): Output =>
	new Output({ decision: 'block', reason });

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'ConfigChange',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build a ConfigChange hook that only handles matching `config_source`
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
			select: (input) => input.config_source,
			onMatch: config.handler,
			onMismatch:
				config.onMismatch ?? (() => Effect.succeed(allow()))
		})
	});
