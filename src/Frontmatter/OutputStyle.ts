/**
 * Schema for the YAML frontmatter of an output style markdown file.
 *
 * Output styles tweak how Claude phrases its responses (terseness,
 * formality, format). Their frontmatter carries only a name and
 * description.
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
	name: Schema.String,
	description: Schema.optional(Schema.String)
}) {}

export type OutputStyleFrontmatterInput = ConstructorParameters<
	typeof OutputStyleFrontmatter
>[0];
