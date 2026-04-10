/**
 * ElicitationResult hook event.
 *
 * Fires after the user responds to an MCP elicitation dialog, before the
 * response is sent back to the MCP server. A handler can accept, decline,
 * or cancel the response — and may override the content. Supports a
 * matcher on `mcp_server_name`.
 * See https://code.claude.com/docs/en/hooks#elicitationresult.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import * as Matcher from '../Matcher.ts';
import type { HookDefinition } from '../Runner.ts';

export const Action = Schema.Literals(['accept', 'decline', 'cancel'] as const);

export class Input extends Schema.Class<Input>('ElicitationResultInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('ElicitationResult'),
		mcp_server_name: Schema.String,
		user_response: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
	},
	{ description: 'Input for the ElicitationResult hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'ElicitationResultHookSpecificOutput'
)({
	hookEventName: Schema.Literal('ElicitationResult'),
	action: Action,
	content: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
}) {}

export class Output extends Schema.Class<Output>('ElicitationResultOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

export const accept = (
	content?: Readonly<Record<string, unknown>>
): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'ElicitationResult',
			action: 'accept',
			content
		})
	});

export const decline = (): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'ElicitationResult',
			action: 'decline'
		})
	});

export const cancel = (): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'ElicitationResult',
			action: 'cancel'
		})
	});

/**
 * No-op output — Claude Code continues the normal elicitation-result flow.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const passthrough = (): Output =>
	new Output({ continue: undefined });

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'ElicitationResult',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build an ElicitationResult hook that only handles matching
 * `mcp_server_name` values.
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
			select: (input) => input.mcp_server_name,
			onMatch: config.handler,
			onMismatch:
				config.onMismatch ?? (() => Effect.succeed(passthrough()))
		})
	});
