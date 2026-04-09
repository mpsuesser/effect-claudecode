/**
 * Schema for the YAML frontmatter of a slash-command markdown file.
 *
 * Commands are user-invocable skills that appear in the `/` menu.
 * Their frontmatter is lighter than `SKILL.md` — only the
 * description and a small set of tool/model hints.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------------
// Helper — tool list accepts either a comma-separated string or
// an array of strings.
// ---------------------------------------------------------------------------

const ToolList = Schema.Union([
	Schema.String,
	Schema.Array(Schema.String)
]);

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
	description: Schema.optional(Schema.String),
	'argument-hint': Schema.optional(Schema.String),
	'allowed-tools': Schema.optional(ToolList),
	'disable-model-invocation': Schema.optional(Schema.Boolean),
	model: Schema.optional(Schema.String)
}) {}

export type CommandFrontmatterInput = ConstructorParameters<
	typeof CommandFrontmatter
>[0];
