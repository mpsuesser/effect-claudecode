/**
 * Frontmatter render helpers for authoring markdown component files.
 *
 * These helpers are the inverse of `Frontmatter.parse*`: they take a
 * typed frontmatter value plus a markdown body and produce the final
 * file content with YAML frontmatter delimiters.
 *
 * @since 0.1.0
 */
import { stringify as stringifyYaml } from 'yaml';

import {
	type CommandFrontmatterInput,
	CommandFrontmatter
} from './Command.ts';
import {
	type OutputStyleFrontmatterInput,
	OutputStyleFrontmatter
} from './OutputStyle.ts';
import {
	type SkillFrontmatterInput,
	SkillFrontmatter
} from './Skill.ts';
import {
	type SubagentFrontmatterInput,
	SubagentFrontmatter
} from './Subagent.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A markdown body paired with optional typed frontmatter.
 *
 * @category Models
 * @since 0.1.0
 */
export interface FrontmatterDocument {
	readonly frontmatter: object | undefined;
	readonly body: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const compactFrontmatter = (
	frontmatter: object
): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(frontmatter).filter(([, value]) => value !== undefined)
	);

const normalizeBody = (body: string): string =>
	body.length === 0 ? '' : `\n\n${body}`;

const renderDocument = (document: FrontmatterDocument): string => {
	if (document.frontmatter === undefined) {
		return document.body;
	}

	const frontmatter = compactFrontmatter(document.frontmatter);
	if (Object.keys(frontmatter).length === 0) {
		return document.body;
	}

	return `---\n${stringifyYaml(frontmatter)}---${normalizeBody(document.body)}`;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a markdown document with optional frontmatter.
 *
 * @category Renderers
 * @since 0.1.0
 */
export const render = (document: FrontmatterDocument): string =>
	renderDocument(document);

/**
 * Render a slash-command markdown file from typed frontmatter.
 *
 * @category Renderers
 * @since 0.1.0
 */
export const renderCommand = (
	frontmatter: CommandFrontmatter | CommandFrontmatterInput,
	body: string
): string =>
	renderDocument({
		frontmatter:
			frontmatter instanceof CommandFrontmatter
				? frontmatter
				: new CommandFrontmatter(frontmatter),
		body
	});

/**
 * Render a `SKILL.md` file from typed frontmatter.
 *
 * @category Renderers
 * @since 0.1.0
 */
export const renderSkill = (
	frontmatter: SkillFrontmatter | SkillFrontmatterInput,
	body: string
): string =>
	renderDocument({
		frontmatter:
			frontmatter instanceof SkillFrontmatter
				? frontmatter
				: new SkillFrontmatter(frontmatter),
		body
	});

/**
 * Render a subagent markdown file from typed frontmatter.
 *
 * @category Renderers
 * @since 0.1.0
 */
export const renderSubagent = (
	frontmatter: SubagentFrontmatter | SubagentFrontmatterInput,
	body: string
): string =>
	renderDocument({
		frontmatter:
			frontmatter instanceof SubagentFrontmatter
				? frontmatter
				: new SubagentFrontmatter(frontmatter),
		body
	});

/**
 * Render an output-style markdown file from typed frontmatter.
 *
 * @category Renderers
 * @since 0.1.0
 */
export const renderOutputStyle = (
	frontmatter: OutputStyleFrontmatter | OutputStyleFrontmatterInput,
	body: string
): string =>
	renderDocument({
		frontmatter:
			frontmatter instanceof OutputStyleFrontmatter
				? frontmatter
				: new OutputStyleFrontmatter(frontmatter),
		body
	});
