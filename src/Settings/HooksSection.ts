/**
 * Schema for the `hooks` subtree of a Claude Code settings.json file.
 *
 * Claude Code's hooks wire-up format looks like:
 *
 * ```jsonc
 * {
 *   "hooks": {
 *     "PreToolUse": [
 *       {
 *         "matcher": "Bash|Edit",
 *         "hooks": [
 *           { "type": "command", "command": "bun hook.ts", "timeout": 30 }
 *         ]
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * Claude Code supports four hook types: `command`, `http`, `prompt`, and
 * `agent`. This module schematizes all four.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------------
// Hook entry types
// ---------------------------------------------------------------------------

export class CommandHookEntry extends Schema.Class<CommandHookEntry>(
	'CommandHookEntry'
)({
	type: Schema.Literal('command'),
	command: Schema.String,
	timeout: Schema.optional(Schema.Number),
	async: Schema.optional(Schema.Boolean),
	shell: Schema.optional(Schema.Literals(['bash', 'powershell'] as const)),
	statusMessage: Schema.optional(Schema.String),
	once: Schema.optional(Schema.Boolean)
}) {}

export class HttpHookEntry extends Schema.Class<HttpHookEntry>(
	'HttpHookEntry'
)({
	type: Schema.Literal('http'),
	url: Schema.String,
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	allowedEnvVars: Schema.optional(Schema.Array(Schema.String)),
	timeout: Schema.optional(Schema.Number)
}) {}

export class PromptHookEntry extends Schema.Class<PromptHookEntry>(
	'PromptHookEntry'
)({
	type: Schema.Literal('prompt'),
	prompt: Schema.String,
	model: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number)
}) {}

export class AgentHookEntry extends Schema.Class<AgentHookEntry>(
	'AgentHookEntry'
)({
	type: Schema.Literal('agent'),
	prompt: Schema.String,
	model: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number)
}) {}

/**
 * A single hook entry in settings.json — a discriminated union of the
 * four supported types keyed on `type`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const HookEntry = Schema.Union([
	CommandHookEntry,
	HttpHookEntry,
	PromptHookEntry,
	AgentHookEntry
]).annotate({ identifier: 'HookEntry' });

export type HookEntry = Schema.Schema.Type<typeof HookEntry>;

// ---------------------------------------------------------------------------
// Matcher group
// ---------------------------------------------------------------------------

/**
 * A group of hook entries sharing a common matcher (and optional
 * permission filter).
 *
 * @category Schemas
 * @since 0.1.0
 */
export class HookMatcherGroup extends Schema.Class<HookMatcherGroup>(
	'HookMatcherGroup'
)({
	matcher: Schema.optional(Schema.String),
	hooks: Schema.Array(HookEntry),
	if: Schema.optional(Schema.String)
}) {}

// ---------------------------------------------------------------------------
// Hooks section (top-level)
// ---------------------------------------------------------------------------

/**
 * The full `hooks` subtree of settings.json — a record keyed by event
 * name, each holding an array of matcher groups.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const HooksSection = Schema.Record(
	Schema.String,
	Schema.Array(HookMatcherGroup)
).annotate({
	identifier: 'HooksSection',
	description: 'The "hooks" subtree of a Claude Code settings.json file'
});

export type HooksSection = Schema.Schema.Type<typeof HooksSection>;
