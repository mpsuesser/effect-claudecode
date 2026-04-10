/**
 * StopFailure hook event.
 *
 * Fires when a turn ends due to an API error (rate limit, auth, billing,
 * etc.) rather than a normal stop. Observability-only — the hook's
 * output and exit code are both ignored by Claude Code. Supports a
 * matcher on `error_type`.
 * See https://code.claude.com/docs/en/hooks#stopfailure.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import * as Matcher from '../Matcher.ts';
import type { HookDefinition } from '../Runner.ts';

export const ErrorType = Schema.Literals([
	'rate_limit',
	'authentication_failed',
	'billing_error',
	'invalid_request',
	'server_error',
	'max_output_tokens',
	'unknown'
] as const);

export class Input extends Schema.Class<Input>('StopFailureInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('StopFailure'),
		error_type: ErrorType,
		error_message: Schema.optional(Schema.String)
	},
	{ description: 'Input for the StopFailure hook event.' }
) {}

export class Output extends Schema.Class<Output>('StopFailureOutput')({
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
	event: 'StopFailure',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build a StopFailure hook that only handles matching `error_type` values.
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
			select: (input) => input.error_type,
			onMatch: config.handler,
			onMismatch:
				config.onMismatch ?? (() => Effect.succeed(passthrough()))
		})
	});
