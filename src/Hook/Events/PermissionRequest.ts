/**
 * PermissionRequest hook event.
 *
 * Fires when Claude Code is about to show a permission dialog for a tool.
 * A handler can `allow` or `deny` the tool call directly, optionally
 * rewriting the tool input and persisting new permission rules. Supports
 * a matcher on `tool_name`.
 * See https://code.claude.com/docs/en/hooks#permissionrequest.
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

/**
 * A pending permission-rule change Claude Code suggests alongside the
 * prompt. The hook handler can accept these in its `updatedPermissions`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class PermissionSuggestion extends Schema.Class<PermissionSuggestion>(
	'PermissionSuggestion'
)({
	type: Schema.String,
	rules: Schema.optional(Schema.Array(Schema.String)),
	behavior: Schema.optional(Schema.Literals(['allow', 'deny', 'ask'])),
	destination: Schema.optional(
		Schema.Literals([
			'session',
			'localSettings',
			'projectSettings',
			'userSettings'
		])
	)
}) {}

export class Input extends Schema.Class<Input>('PermissionRequestInput')(
	{
		...envelopeFields,
		hook_event_name: Schema.Literal('PermissionRequest'),
		tool_name: Schema.String,
		tool_input: Schema.Record(Schema.String, Schema.Unknown),
		permission_suggestions: Schema.optional(
			Schema.Array(PermissionSuggestion)
		)
	},
	{ description: 'Input for the PermissionRequest hook event.' }
) {}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * A permission rule update the hook may persist. Mirrors the shape of
 * `permission_suggestions` on the input side.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class PermissionUpdate extends Schema.Class<PermissionUpdate>(
	'PermissionUpdate'
)({
	type: Schema.Literals([
		'addRules',
		'replaceRules',
		'removeRules',
		'setMode',
		'addDirectories',
		'removeDirectories'
	]),
	behavior: Schema.optional(Schema.Literals(['allow', 'deny', 'ask'])),
	destination: Schema.Literals([
		'session',
		'localSettings',
		'projectSettings',
		'userSettings'
	])
}) {}

export class PermissionDecision extends Schema.Class<PermissionDecision>(
	'PermissionRequestDecision'
)({
	behavior: Schema.Literals(['allow', 'deny']),
	updatedInput: Schema.optional(
		Schema.Record(Schema.String, Schema.Unknown)
	),
	updatedPermissions: Schema.optional(Schema.Array(PermissionUpdate)),
	message: Schema.optional(Schema.String)
}) {}

export class HookSpecificOutput extends Schema.Class<HookSpecificOutput>(
	'PermissionRequestHookSpecificOutput'
)({
	hookEventName: Schema.Literal('PermissionRequest'),
	decision: PermissionDecision
}) {}

export class Output extends Schema.Class<Output>('PermissionRequestOutput')({
	continue: Schema.optional(Schema.Boolean),
	stopReason: Schema.optional(Schema.String),
	suppressOutput: Schema.optional(Schema.Boolean),
	systemMessage: Schema.optional(Schema.String),
	hookSpecificOutput: Schema.optional(HookSpecificOutput)
}) {}

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

export const allow = (options?: {
	readonly updatedInput?: Readonly<Record<string, unknown>>;
	readonly updatedPermissions?: ReadonlyArray<PermissionUpdate>;
}): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PermissionRequest',
			decision: new PermissionDecision({
				behavior: 'allow',
				updatedInput: options?.updatedInput,
				updatedPermissions: options?.updatedPermissions
			})
		})
	});

/**
 * No-op output — Claude Code proceeds with its normal permission request flow.
 *
 * @category Decisions
 * @since 0.1.0
 */
export const passthrough = (): Output =>
	new Output({ continue: undefined });

export const deny = (message: string): Output =>
	new Output({
		hookSpecificOutput: new HookSpecificOutput({
			hookEventName: 'PermissionRequest',
			decision: new PermissionDecision({
				behavior: 'deny',
				message
			})
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
	event: 'PermissionRequest',
	inputSchema: Input,
	outputSchema: Output,
	handler: config.handler
});

/**
 * Build a PermissionRequest hook that only handles matching `tool_name`
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
			select: (input) => input.tool_name,
			onMatch: config.handler,
			onMismatch:
				config.onMismatch ?? (() => Effect.succeed(passthrough()))
		})
	});
