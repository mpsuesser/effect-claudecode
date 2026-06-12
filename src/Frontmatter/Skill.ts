/**
 * Schema for the YAML frontmatter of a `SKILL.md` file.
 *
 * Claude Code skills are markdown files whose frontmatter declares
 * metadata that governs discovery, invocation, and tool access. All
 * frontmatter fields are optional in Claude Code; `name` falls back to
 * the directory name and `description` can fall back to the body.
 *
 * This schema intentionally stays permissive for Claude Code runtime
 * compatibility. The stricter Agent Skills open-standard constraints
 * (for example lowercase hyphenated names, length limits, and
 * name-matches-directory checks) are better enforced by plugin linting
 * where the file path is available.
 *
 * Note: Claude Code uses kebab-cased keys in some frontmatter fields
 * (`disable-model-invocation`, `user-invocable`, `allowed-tools`,
 * `disallowed-tools`, `argument-hint`). `Schema.Class` preserves the
 * exact key, so the TypeScript properties use the same kebab-case
 * identifier via bracket access.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import { HooksSection } from '../Settings/HooksSection.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const StringOrStringArray = Schema.Union([
	Schema.String,
	Schema.Array(Schema.String)
]).annotate({ identifier: 'StringOrStringArray' });

export const EffortLevel = Schema.Literals([
	'low',
	'medium',
	'high',
	'xhigh',
	'max'
] as const);

// ---------------------------------------------------------------------------
// SkillFrontmatter
// ---------------------------------------------------------------------------

/**
 * The full frontmatter schema for a `SKILL.md` file.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class SkillFrontmatter extends Schema.Class<SkillFrontmatter>(
	'SkillFrontmatter'
)({
	// Metadata
	name: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
	when_to_use: Schema.optional(Schema.String),
	license: Schema.optional(Schema.String),
	metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	compatibility: Schema.optional(Schema.String),

	// Discovery / invocation toggles
	'disable-model-invocation': Schema.optional(Schema.Boolean),
	'user-invocable': Schema.optional(Schema.Boolean),

	// Context / agent coupling
	context: Schema.optional(Schema.String),
	agent: Schema.optional(Schema.String),

	// Model / effort hints
	model: Schema.optional(Schema.String),
	effort: Schema.optional(EffortLevel),

	// Arguments / tooling
	arguments: Schema.optional(StringOrStringArray),
	'allowed-tools': Schema.optional(StringOrStringArray),
	'disallowed-tools': Schema.optional(StringOrStringArray),
	'argument-hint': Schema.optional(Schema.String),

	// Supporting files
	paths: Schema.optional(StringOrStringArray),

	// Shell config (rarely used; declares the shell binary to run
	// any command invocations from this skill under)
	shell: Schema.optional(
		Schema.Literals(['bash', 'powershell'] as const)
	),

	// Inline hooks (same shape as settings.json hooks)
	hooks: Schema.optional(HooksSection)
}) {}

export type SkillFrontmatterInput = typeof SkillFrontmatter.Type;
