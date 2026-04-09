/**
 * PermissionDenied hook event.
 *
 * Fires when Claude Code's auto-mode classifier denies a tool call. The
 * denial has already happened; a handler can set `retry: true` to tell
 * the model it may try again (possibly with different input). Supports
 * a matcher on `tool_name`.
 * See https://code.claude.com/docs/en/hooks#permissiondenied.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { HookContext } from '../Context.ts';
import { envelopeFields } from '../Envelope.ts';
import type { HookDefinition } from '../Runner.ts';

export class Input extends Schema.Class<Input>('PermissionDeniedInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('PermissionDenied'),
		tool_name: Schema.String,
		tool_input: Schema.Record(Schema.String, Schema.Unknown),
		tool_use_id: Schema.optional(Schema.String),
		reason: Schema.String
	},
	{ description: 'Input for the PermissionDenied hook event.' }
) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'PermissionDeniedHookSpecificOutput'
)({
	hookEventName: Schema.Literal('PermissionDenied'),
	retry: Schema.optional(Schema.Boolean)
}) {}

export class Output extends Schema.Class<Output>('PermissionDeniedOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

/**
 * Acknowledge the denial without allowing a retry.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const accept = (): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PermissionDenied',
			retry: false
		})
	});

/**
 * Tell the model it may retry the denied call, typically with adjusted
 * input.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const retry = (): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PermissionDenied',
			retry: true
		})
	});

export const define = (config: {
	readonly handler: (
		input: Input
	) => Effect.Effect<Output, unknown, HookContext.Service>;
}): HookDefinition<Input, Output> => ({
	event: 'PermissionDenied',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});
