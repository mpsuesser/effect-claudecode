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

export { parse, parseFile } from './Frontmatter/Parser.ts';
export type { ParsedFrontmatter } from './Frontmatter/Parser.ts';

// ---------------------------------------------------------------------------
// Per-file-type schemas
// ---------------------------------------------------------------------------

export { SkillFrontmatter } from './Frontmatter/Skill.ts';
export { SubagentFrontmatter } from './Frontmatter/Subagent.ts';
export { CommandFrontmatter } from './Frontmatter/Command.ts';
export { OutputStyleFrontmatter } from './Frontmatter/OutputStyle.ts';
