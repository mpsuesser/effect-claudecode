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
 * Claude Code supports five hook types: `command`, `http`, `mcp_tool`,
 * `prompt`, and `agent`. This module schematizes all five.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------------
// Hook entry types
// ---------------------------------------------------------------------------

const commonHookFields = {
	if: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number),
	statusMessage: Schema.optional(Schema.String),
	once: Schema.optional(Schema.Boolean)
} as const;

export class CommandHookEntry extends Schema.Class<CommandHookEntry>(
	'CommandHookEntry'
)({
	...commonHookFields,
	type: Schema.Literal('command'),
	command: Schema.String,
	args: Schema.optional(Schema.Array(Schema.String)),
	async: Schema.optional(Schema.Boolean),
	asyncRewake: Schema.optional(Schema.Boolean),
	shell: Schema.optional(Schema.Literals(['bash', 'powershell'] as const))
}) {}

export class HttpHookEntry extends Schema.Class<HttpHookEntry>(
	'HttpHookEntry'
)({
	...commonHookFields,
	type: Schema.Literal('http'),
	url: Schema.String,
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	allowedEnvVars: Schema.optional(Schema.Array(Schema.String))
}) {}

export class McpToolHookEntry extends Schema.Class<McpToolHookEntry>(
	'McpToolHookEntry'
)({
	...commonHookFields,
	type: Schema.Literal('mcp_tool'),
	server: Schema.String,
	tool: Schema.String,
	input: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
}) {}

export class PromptHookEntry extends Schema.Class<PromptHookEntry>(
	'PromptHookEntry'
)({
	...commonHookFields,
	type: Schema.Literal('prompt'),
	prompt: Schema.String,
	model: Schema.optional(Schema.String),
	continueOnBlock: Schema.optional(Schema.Boolean)
}) {}

export class AgentHookEntry extends Schema.Class<AgentHookEntry>(
	'AgentHookEntry'
)({
	...commonHookFields,
	type: Schema.Literal('agent'),
	prompt: Schema.String,
	model: Schema.optional(Schema.String),
	continueOnBlock: Schema.optional(Schema.Boolean)
}) {}

/**
 * A single hook entry in settings.json — a discriminated union of the
 * five supported types keyed on `type`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const HookEntry = Schema.Union([
	CommandHookEntry,
	HttpHookEntry,
	McpToolHookEntry,
	PromptHookEntry,
	AgentHookEntry
]).annotate({ identifier: 'HookEntry' });

export type HookEntry = Schema.Schema.Type<typeof HookEntry>;

// ---------------------------------------------------------------------------
// Matcher group
// ---------------------------------------------------------------------------

/**
 * A group of hook entries sharing a common matcher.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class HookMatcherGroup extends Schema.Class<HookMatcherGroup>(
	'HookMatcherGroup'
)({
	matcher: Schema.optional(Schema.String),
	hooks: Schema.Array(HookEntry)
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
