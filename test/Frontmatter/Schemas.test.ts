/**
 * Tests for the per-file-type frontmatter schemas.
 *
 * Each test decodes a representative YAML fixture (as a plain JS
 * object) through the target schema and asserts the result's
 * shape. Kebab-case keys (`allowed-tools`, `disable-model-invocation`)
 * are preserved verbatim.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { CommandFrontmatter } from '../../src/Frontmatter/Command.ts';
import { OutputStyleFrontmatter } from '../../src/Frontmatter/OutputStyle.ts';
import { SkillFrontmatter } from '../../src/Frontmatter/Skill.ts';
import { SubagentFrontmatter } from '../../src/Frontmatter/Subagent.ts';

const decodeSkill = Schema.decodeUnknownEffect(SkillFrontmatter);
const decodeSubagent = Schema.decodeUnknownEffect(SubagentFrontmatter);
const decodeCommand = Schema.decodeUnknownEffect(CommandFrontmatter);
const decodeOutputStyle = Schema.decodeUnknownEffect(OutputStyleFrontmatter);

// ---------------------------------------------------------------------------
// SkillFrontmatter
// ---------------------------------------------------------------------------

describe('SkillFrontmatter', () => {
	it.effect('decodes a minimal skill with only name + description', () =>
		Effect.gen(function* () {
			const skill = yield* decodeSkill({
				name: 'greet',
				description: 'Say hello to the user'
			});
			expect(skill).toMatchObject({
				name: 'greet',
				description: 'Say hello to the user'
			});
		})
	);

	it.effect('decodes kebab-case keys as-is', () =>
		Effect.gen(function* () {
			const skill = yield* decodeSkill({
				name: 'tools-check',
				description: 'Verify tool access',
				'disable-model-invocation': true,
				'user-invocable': false,
				'allowed-tools': ['Read', 'Write'],
				'argument-hint': '<file>'
			});
			expect(skill).toMatchObject({
				'disable-model-invocation': true,
				'user-invocable': false,
				'allowed-tools': ['Read', 'Write'],
				'argument-hint': '<file>'
			});
		})
	);

	it.effect('accepts `allowed-tools` as a comma-separated string', () =>
		Effect.gen(function* () {
			const skill = yield* decodeSkill({
				name: 's',
				description: 'd',
				'allowed-tools': 'Read, Write, Edit'
			});
			expect(skill['allowed-tools']).toBe('Read, Write, Edit');
		})
	);

	it.effect('decodes effort and shell enums', () =>
		Effect.gen(function* () {
			const skill = yield* decodeSkill({
				name: 's',
				description: 'd',
				effort: 'xhigh',
				shell: 'bash'
			});
			expect(skill.effort).toBe('xhigh');
			expect(skill.shell).toBe('bash');
		})
	);

	it.effect('decodes current invocation and metadata fields', () =>
		Effect.gen(function* () {
			const skill = yield* decodeSkill({
				name: 'effect-helper',
				description: 'Help with Effect code',
				when_to_use: 'Use for Effect v4 APIs',
				arguments: ['file', 'topic'],
				paths: 'src/**, test/**',
				'disallowed-tools': 'WebFetch, WebSearch',
				license: 'MIT',
				metadata: { owner: 'platform' },
				compatibility: 'Claude Code'
			});
			expect(skill).toMatchObject({
				when_to_use: 'Use for Effect v4 APIs',
				arguments: ['file', 'topic'],
				paths: 'src/**, test/**',
				'disallowed-tools': 'WebFetch, WebSearch',
				license: 'MIT',
				metadata: { owner: 'platform' },
				compatibility: 'Claude Code'
			});
		})
	);

	it.effect('rejects an invalid effort value', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeSkill({
					name: 's',
					description: 'd',
					effort: 'ludicrous'
				})
			);
			expect(error).toBeInstanceOf(Schema.SchemaError);
		})
	);

	it.effect('decodes a skill without description', () =>
		Effect.gen(function* () {
			const skill = yield* decodeSkill({ name: 's' });
			expect(skill.name).toBe('s');
			expect(skill.description).toBeUndefined();
		})
	);
});

// ---------------------------------------------------------------------------
// SubagentFrontmatter
// ---------------------------------------------------------------------------

describe('SubagentFrontmatter', () => {
	it.effect('decodes a plugin-shipped subagent (no hooks/permissions)', () =>
		Effect.gen(function* () {
			const agent = yield* decodeSubagent({
				name: 'reviewer',
				description: 'Reviews code',
				model: 'sonnet',
				effort: 'medium',
				maxTurns: 20,
				disallowedTools: 'Write, Edit',
				isolation: 'worktree'
			});
			expect(agent).toMatchObject({
				name: 'reviewer',
				model: 'sonnet',
				effort: 'medium',
				maxTurns: 20,
				disallowedTools: 'Write, Edit',
				isolation: 'worktree'
			});
		})
	);

	it.effect('decodes a user subagent with full permissions + hooks', () =>
		Effect.gen(function* () {
			const agent = yield* decodeSubagent({
				name: 'watcher',
				description: 'Watches files',
				permissionMode: 'acceptEdits',
				permissions: {
					mode: 'acceptEdits',
					allow: ['Read(**)']
				},
				hooks: {
					PostToolUse: [
						{
							matcher: 'Write',
							hooks: [{ type: 'command', command: './log.sh' }]
						}
					]
				}
			});
			expect(agent.permissionMode).toBe('acceptEdits');
			expect(agent.hooks).toMatchObject({
				PostToolUse: [{ matcher: 'Write' }]
			});
		})
	);

	it.effect('decodes current subagent fields', () =>
		Effect.gen(function* () {
			const agent = yield* decodeSubagent({
				name: 'researcher',
				description: 'Researches a topic',
				effort: 'xhigh',
				color: 'cyan',
				initialPrompt: 'Start by reading the README.',
				memory: 'project',
				mcpServers: [
					'filesystem',
					{ browser: { type: 'http', url: 'https://mcp.example.com' } }
				]
			});
			expect(agent).toMatchObject({
				effort: 'xhigh',
				color: 'cyan',
				initialPrompt: 'Start by reading the README.',
				memory: 'project',
				mcpServers: [
					'filesystem',
					{ browser: { type: 'http', url: 'https://mcp.example.com' } }
				]
			});
		})
	);

	it.effect('rejects a subagent missing the required name field', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeSubagent({ description: 'd' })
			);
			expect(error).toBeInstanceOf(Schema.SchemaError);
		})
	);
});

// ---------------------------------------------------------------------------
// CommandFrontmatter
// ---------------------------------------------------------------------------

describe('CommandFrontmatter', () => {
	it.effect('decodes an empty command frontmatter', () =>
		Effect.gen(function* () {
			const cmd = yield* decodeCommand({});
			expect(cmd.description).toBeUndefined();
			expect(cmd['allowed-tools']).toBeUndefined();
		})
	);

	it.effect('decodes a full command frontmatter with skill-style fields', () =>
		Effect.gen(function* () {
			const cmd = yield* decodeCommand({
				name: 'commit',
				description: 'Commit staged changes',
				when_to_use: 'Use for git commits',
				arguments: 'message scope',
				'argument-hint': '<message>',
				'allowed-tools': ['Bash'],
				'disallowed-tools': 'WebFetch',
				'disable-model-invocation': false,
				'user-invocable': true,
				context: 'fork',
				agent: 'reviewer',
				effort: 'xhigh',
				paths: ['src/**'],
				shell: 'bash',
				model: 'haiku',
				hooks: {
					PreToolUse: [
						{
							matcher: 'Bash',
							hooks: [{ type: 'mcp_tool', server: 'policy', tool: 'check' }]
						}
					]
				}
			});
			expect(cmd).toMatchObject({
				name: 'commit',
				description: 'Commit staged changes',
				when_to_use: 'Use for git commits',
				arguments: 'message scope',
				'argument-hint': '<message>',
				'allowed-tools': ['Bash'],
				'disallowed-tools': 'WebFetch',
				'disable-model-invocation': false,
				'user-invocable': true,
				context: 'fork',
				agent: 'reviewer',
				effort: 'xhigh',
				paths: ['src/**'],
				shell: 'bash',
				model: 'haiku'
			});
		})
	);
});

// ---------------------------------------------------------------------------
// OutputStyleFrontmatter
// ---------------------------------------------------------------------------

describe('OutputStyleFrontmatter', () => {
	it.effect('decodes the minimal name-only form', () =>
		Effect.gen(function* () {
			const style = yield* decodeOutputStyle({ name: 'terse' });
			expect(style.name).toBe('terse');
			expect(style.description).toBeUndefined();
		})
	);

	it.effect('decodes name + description', () =>
		Effect.gen(function* () {
			const style = yield* decodeOutputStyle({
				name: 'verbose',
				description: 'Long-form explanatory prose'
			});
			expect(style).toMatchObject({
				name: 'verbose',
				description: 'Long-form explanatory prose'
			});
		})
	);

	it.effect('decodes an empty style frontmatter', () =>
		Effect.gen(function* () {
			const style = yield* decodeOutputStyle({});
			expect(style.name).toBeUndefined();
			expect(style.description).toBeUndefined();
		})
	);

	it.effect('decodes plugin-only output style flags', () =>
		Effect.gen(function* () {
			const style = yield* decodeOutputStyle({
				name: 'coding-style',
				'keep-coding-instructions': true,
				'force-for-plugin': true
			});
			expect(style).toMatchObject({
				name: 'coding-style',
				'keep-coding-instructions': true,
				'force-for-plugin': true
			});
		})
	);
});
