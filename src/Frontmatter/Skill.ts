/**
 * Schema for the YAML frontmatter of a `SKILL.md` file.
 *
 * Claude Code skills are markdown files whose frontmatter declares
 * metadata that governs discovery, invocation, and tool access. Only
 * `name` and `description` are required; every other field tunes
 * behavior.
 *
 * Note: Claude Code uses kebab-cased keys in some frontmatter fields
 * (`disable-model-invocation`, `user-invocable`, `allowed-tools`,
 * `argument-hint`). `Schema.Class` preserves the exact key, so the
 * TypeScript properties use the same kebab-case identifier via
 * bracket access.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import { HooksSection } from '../Settings/HooksSection.ts';

// ---------------------------------------------------------------------------
// Helper — `allowed-tools` accepts either a comma-separated string or
// an array of strings.
// ---------------------------------------------------------------------------

const StringOrStringArray = Schema.Union([
	Schema.String,
	Schema.Array(Schema.String)
]);

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
	// Required
	name: Schema.String,
	description: Schema.String,

	// Discovery / invocation toggles
	'disable-model-invocation': Schema.optional(Schema.Boolean),
	'user-invocable': Schema.optional(Schema.Boolean),

	// Context / agent coupling
	context: Schema.optional(Schema.String),
	agent: Schema.optional(Schema.String),

	// Model / effort hints
	model: Schema.optional(Schema.String),
	effort: Schema.optional(
		Schema.Literals(['low', 'medium', 'high', 'max'] as const)
	),

	// Tooling
	'allowed-tools': Schema.optional(StringOrStringArray),
	'argument-hint': Schema.optional(Schema.String),

	// Supporting files
	paths: Schema.optional(Schema.Array(Schema.String)),

	// Shell config (rarely used; declares the shell binary to run
	// any command invocations from this skill under)
	shell: Schema.optional(
		Schema.Literals(['bash', 'powershell'] as const)
	),

	// Inline hooks (same shape as settings.json hooks)
	hooks: Schema.optional(HooksSection)
}) {}
