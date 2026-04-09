/**
 * Frontmatter module hub — YAML frontmatter parsers and schemas for
 * Claude Code markdown files (skills, subagents, commands, output
 * styles).
 *
 * Users import this as a namespace:
 * `import { Frontmatter } from 'effect-claudecode'` and access
 * members as `Frontmatter.parse`, `Frontmatter.parseFile`,
 * `Frontmatter.SkillFrontmatter`, etc.
 *
 * @since 0.1.0
 */

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export {
	parse,
	parseCommandFile,
	parseFile,
	parseOutputStyleFile,
	parseSkillFile,
	parseSubagentFile
} from './Frontmatter/Parser.ts';
export type {
	DecodedFrontmatter,
	ParsedFrontmatter
} from './Frontmatter/Parser.ts';

export {
	render,
	renderCommand,
	renderOutputStyle,
	renderSkill,
	renderSubagent
} from './Frontmatter/Render.ts';
export type { FrontmatterDocument } from './Frontmatter/Render.ts';

// ---------------------------------------------------------------------------
// Per-file-type schemas
// ---------------------------------------------------------------------------

export { SkillFrontmatter } from './Frontmatter/Skill.ts';
export { SubagentFrontmatter } from './Frontmatter/Subagent.ts';
export { CommandFrontmatter } from './Frontmatter/Command.ts';
export { OutputStyleFrontmatter } from './Frontmatter/OutputStyle.ts';
export type { SkillFrontmatterInput } from './Frontmatter/Skill.ts';
export type { SubagentFrontmatterInput } from './Frontmatter/Subagent.ts';
export type { CommandFrontmatterInput } from './Frontmatter/Command.ts';
export type { OutputStyleFrontmatterInput } from './Frontmatter/OutputStyle.ts';
