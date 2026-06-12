/**
 * Schema for the YAML frontmatter of an output style markdown file.
 *
 * Output styles tweak how Claude phrases its responses. `name` is
 * optional; Claude Code falls back to the file name.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------------
// OutputStyleFrontmatter
// ---------------------------------------------------------------------------

/**
 * The frontmatter schema for an output style markdown file.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class OutputStyleFrontmatter extends Schema.Class<OutputStyleFrontmatter>(
	'OutputStyleFrontmatter'
)({
	name: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
	'keep-coding-instructions': Schema.optional(Schema.Boolean),
	'force-for-plugin': Schema.optional(Schema.Boolean)
}) {}

export type OutputStyleFrontmatterInput = typeof OutputStyleFrontmatter.Type;
