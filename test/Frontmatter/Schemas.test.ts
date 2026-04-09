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
				effort: 'high',
				shell: 'bash'
			});
			expect(skill.effort).toBe('high');
			expect(skill.shell).toBe('bash');
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

	it.effect('rejects a skill missing the required description field', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(decodeSkill({ name: 's' }));
			expect(error).toBeInstanceOf(Schema.SchemaError);
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

	it.effect('decodes a full command frontmatter with kebab-case keys', () =>
		Effect.gen(function* () {
			const cmd = yield* decodeCommand({
				description: 'Commit staged changes',
				'argument-hint': '<message>',
				'allowed-tools': ['Bash'],
				'disable-model-invocation': false,
				model: 'haiku'
			});
			expect(cmd).toMatchObject({
				description: 'Commit staged changes',
				'argument-hint': '<message>',
				'allowed-tools': ['Bash'],
				'disable-model-invocation': false,
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

	it.effect('rejects a style missing the required name field', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(decodeOutputStyle({}));
			expect(error).toBeInstanceOf(Schema.SchemaError);
		})
	);
});
