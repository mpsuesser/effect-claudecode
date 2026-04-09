/**
 * Schema for the YAML frontmatter of a subagent markdown file.
 *
 * Subagents are spawned by Claude Code when work benefits from an
 * isolated context window with its own tool policy. Plugin-shipped
 * subagents use a restricted subset (no `hooks`, `mcpServers`, or
 * `permissionMode` — enforced at runtime by Claude Code); this
 * schema accepts the full set so it can validate user-defined
 * agents as well.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import {
	PermissionMode,
	PermissionsConfig
} from '../Settings/Schema.ts';
import { HooksSection } from '../Settings/HooksSection.ts';

// ---------------------------------------------------------------------------
// Helper — `tools` / `disallowedTools` accept a comma-separated
// string or an array of strings.
// ---------------------------------------------------------------------------

const ToolList = Schema.Union([
	Schema.String,
	Schema.Array(Schema.String)
]);

// ---------------------------------------------------------------------------
// SubagentFrontmatter
// ---------------------------------------------------------------------------

/**
 * The full frontmatter schema for a subagent markdown file.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class SubagentFrontmatter extends Schema.Class<SubagentFrontmatter>(
	'SubagentFrontmatter'
)({
	// Required
	name: Schema.String,
	description: Schema.String,

	// Model / budget tuning
	model: Schema.optional(Schema.String),
	effort: Schema.optional(
		Schema.Literals(['low', 'medium', 'high', 'max'] as const)
	),
	maxTurns: Schema.optional(Schema.Number),

	// Tool policy
	tools: Schema.optional(ToolList),
	disallowedTools: Schema.optional(ToolList),

	// Isolation — the only valid value per Claude Code docs is
	// `"worktree"`, but we accept any string so future isolation
	// modes don't break the schema.
	isolation: Schema.optional(Schema.String),

	// Bundled skills (by name or path)
	skills: Schema.optional(Schema.Array(Schema.String)),

	// Memory + background mode
	memory: Schema.optional(Schema.String),
	background: Schema.optional(Schema.Boolean),

	// User-level fields (NOT supported for plugin-shipped agents;
	// Claude Code rejects these at load time for plugin agents, but
	// they are valid for user-authored agents stored under
	// `~/.claude/agents/`).
	permissionMode: Schema.optional(PermissionMode),
	permissions: Schema.optional(PermissionsConfig),
	hooks: Schema.optional(HooksSection)
}) {}
