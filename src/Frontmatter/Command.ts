/**
 * Schema for the YAML frontmatter of a legacy slash-command markdown file.
 *
 * Claude Code merged custom commands into skills; files in commands/
 * still work and support the same frontmatter-style fields.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import { HooksSection } from '../Settings/HooksSection.ts';
import { EffortLevel, StringOrStringArray } from './Skill.ts';

// ---------------------------------------------------------------------------
// CommandFrontmatter
// ---------------------------------------------------------------------------

/**
 * The frontmatter schema for a slash-command markdown file.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class CommandFrontmatter extends Schema.Class<CommandFrontmatter>(
	'CommandFrontmatter'
)({
	name: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
	when_to_use: Schema.optional(Schema.String),
	arguments: Schema.optional(StringOrStringArray),
	'argument-hint': Schema.optional(Schema.String),
	'allowed-tools': Schema.optional(StringOrStringArray),
	'disallowed-tools': Schema.optional(StringOrStringArray),
	'disable-model-invocation': Schema.optional(Schema.Boolean),
	'user-invocable': Schema.optional(Schema.Boolean),
	context: Schema.optional(Schema.String),
	agent: Schema.optional(Schema.String),
	hooks: Schema.optional(HooksSection),
	effort: Schema.optional(EffortLevel),
	paths: Schema.optional(StringOrStringArray),
	shell: Schema.optional(
		Schema.Literals(['bash', 'powershell'] as const)
	),
	model: Schema.optional(Schema.String)
}) {}

export type CommandFrontmatterInput = typeof CommandFrontmatter.Type;
