/**
 * Schema for the YAML frontmatter of a subagent markdown file.
 *
 * Subagents are spawned by Claude Code when work benefits from an
 * isolated context window with its own tool policy. Plugin-shipped
 * subagents ignore `hooks`, `mcpServers`, and `permissionMode`, but
 * other fields such as `effort`, `maxTurns`, and `disallowedTools`
 * apply.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import {
	PermissionMode,
	PermissionsConfig
} from '../Settings/Schema.ts';
import { HooksSection } from '../Settings/HooksSection.ts';
import { EffortLevel } from './Skill.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ToolList = Schema.Union([
	Schema.String,
	Schema.Array(Schema.String)
]);

const InlineMcpServerReference = Schema.Union([
	Schema.String,
	Schema.Record(Schema.String, Schema.Unknown)
]);

export const SubagentColor = Schema.Literals([
	'red',
	'blue',
	'green',
	'yellow',
	'purple',
	'orange',
	'pink',
	'cyan'
] as const);

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
	effort: Schema.optional(EffortLevel),
	maxTurns: Schema.optional(Schema.Number),
	initialPrompt: Schema.optional(Schema.String),

	// Tool policy
	tools: Schema.optional(ToolList),
	disallowedTools: Schema.optional(ToolList),

	// Isolation — the only valid value per Claude Code docs is
	// `"worktree"`, but we accept any string so future isolation
	// modes don't break the schema.
	isolation: Schema.optional(Schema.String),
	color: Schema.optional(SubagentColor),

	// Bundled skills (by name or path)
	skills: Schema.optional(Schema.Array(Schema.String)),
	mcpServers: Schema.optional(Schema.Array(InlineMcpServerReference)),

	// Memory + background mode
	memory: Schema.optional(Schema.String),
	background: Schema.optional(Schema.Boolean),

	permissionMode: Schema.optional(PermissionMode),
	/** @deprecated Current Claude Code subagents use `permissionMode`, not `permissions`. */
	permissions: Schema.optional(PermissionsConfig),
	hooks: Schema.optional(HooksSection)
}) {}

export type SubagentFrontmatterInput = typeof SubagentFrontmatter.Type;
