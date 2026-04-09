/**
 * Tests for `Plugin.scan`, `Plugin.load`, and `Plugin.sync`.
 *
 * Uses an in-memory `FileSystem.layerNoop` that derives directory listings from
 * the provided file map so plugin trees can be exercised without touching disk.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';

import { PluginLoadError } from '../../src/Errors.ts';
import * as Plugin from '../../src/Plugin.ts';
import * as Testing from '../../src/Testing.ts';

// ---------------------------------------------------------------------------
// Test tree builder
// ---------------------------------------------------------------------------

const fsWith = (
	entries: ReadonlyArray<readonly [string, string]>
): ReadonlyMap<string, string> => new Map(entries);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Plugin.scan', () => {
	it.effect('discovers canonical component files and infers a manifest', () =>
		Effect.gen(function* () {
			const scanned = yield* Plugin.scan('/plugin');

			expect(Option.isSome(scanned.sourceManifest)).toBe(true);
			expect(scanned.commandPaths).toEqual(['/plugin/commands/review.md']);
			expect(scanned.agentPaths).toEqual(['/plugin/agents/reviewer.md']);
			expect(scanned.skillPaths).toEqual(['/plugin/skills/greet/SKILL.md']);
			expect(scanned.outputStylePaths).toEqual([
				'/plugin/output-styles/terse.md'
			]);
			expect(scanned.inferredManifest).toMatchObject({
				name: 'guardrails',
				commands: 'commands',
				agents: 'agents',
				skills: 'skills',
				outputStyles: 'output-styles',
				hooks: 'hooks/hooks.json',
				mcpServers: '.mcp.json'
			});
		}).pipe(
			Effect.provide(
				Testing.makeMockFileSystem(
					fsWith([
						[
							'/plugin/.claude-plugin/plugin.json',
							JSON.stringify({
								name: 'guardrails',
								description: 'Guardrail hooks'
							})
						],
						[
							'/plugin/commands/review.md',
							'---\ndescription: Review\n---\n\n# /review\n'
						],
						[
							'/plugin/agents/reviewer.md',
							'---\nname: reviewer\ndescription: Review changes\n---\n\n# Reviewer\n'
						],
						[
							'/plugin/skills/greet/SKILL.md',
							'---\nname: greet\ndescription: Say hi\n---\n\n# Greet\n'
						],
						[
							'/plugin/output-styles/terse.md',
							'---\nname: terse\ndescription: Keep it compact\n---\n\n# Terse\n'
						],
						[
							'/plugin/hooks/hooks.json',
							JSON.stringify({ PostToolUse: [] })
						],
						[
							'/plugin/.mcp.json',
							JSON.stringify({
								mcpServers: {
									fs: { type: 'stdio', command: 'mcp-fs' }
								}
							})
						]
					])
				)
				.layer
			)
		)
	);
});

describe('Plugin.load', () => {
	it.effect('loads a plugin tree into a typed definition', () =>
		Effect.gen(function* () {
			const loaded = yield* Plugin.load('/plugin');

			expect(loaded.manifest.name).toBe('guardrails');
			expect(loaded.commands).toHaveLength(1);
			expect(loaded.commands[0]).toMatchObject({ name: 'review' });
			expect(loaded.agents[0]).toMatchObject({ name: 'reviewer' });
			expect(loaded.skills[0]).toMatchObject({ name: 'greet' });
			expect(loaded.outputStyles[0]).toMatchObject({ name: 'terse' });
			expect(Option.isSome(loaded.hooksConfig)).toBe(true);
			expect(Option.isSome(loaded.mcpConfig)).toBe(true);
		}).pipe(
			Effect.provide(
				Testing.makeMockFileSystem(
					fsWith([
						[
							'/plugin/.claude-plugin/plugin.json',
							JSON.stringify({ name: 'guardrails' })
						],
						[
							'/plugin/commands/review.md',
							'---\ndescription: Review\n---\n\n# /review\n'
						],
						[
							'/plugin/agents/reviewer.md',
							'---\nname: reviewer\ndescription: Review changes\n---\n\n# Reviewer\n'
						],
						[
							'/plugin/skills/greet/SKILL.md',
							'---\nname: greet\ndescription: Say hi\n---\n\n# Greet\n'
						],
						[
							'/plugin/output-styles/terse.md',
							'---\nname: terse\ndescription: Keep it compact\n---\n\n# Terse\n'
						],
						[
							'/plugin/hooks/hooks.json',
							JSON.stringify({ PostToolUse: [] })
						],
						[
							'/plugin/.mcp.json',
							JSON.stringify({
								mcpServers: {
									fs: { type: 'stdio', command: 'mcp-fs' }
								}
							})
						]
					])
				)
				.layer
			)
		)
	);

	it.effect('wraps component decode failures in PluginLoadError', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(Plugin.load('/plugin'));
			expect(raised).toBeInstanceOf(PluginLoadError);
			expect(raised).toMatchObject({
				_tag: 'PluginLoadError',
				path: '/plugin/skills/greet/SKILL.md'
			});
		}).pipe(
			Effect.provide(
				Testing.makeMockFileSystem(
					fsWith([
						[
							'/plugin/skills/greet/SKILL.md',
							'---\ndescription: Missing required name\n---\n\n# Broken\n'
						]
					])
				)
				.layer
			)
		)
	);
});

describe('Plugin.sync', () => {
	it('rewrites manifest paths to the canonical Plugin.write layout', () => {
		const synced = Plugin.sync(
			Plugin.define({
				manifest: {
					name: 'guardrails',
					description: 'Guardrail hooks',
					commands: 'old-commands',
					hooks: 'old-hooks.json'
				},
				commands: [
					Plugin.command({
						name: 'review',
						description: 'Review',
						body: '# /review\n'
					})
				],
				skills: [
					Plugin.skill({
						name: 'greet',
						description: 'Say hi',
						body: '# Greet\n'
					})
				],
				hooksConfig: { PostToolUse: [] }
			})
		);

		expect(synced.manifest).toMatchObject({
			name: 'guardrails',
			description: 'Guardrail hooks',
			commands: 'commands',
			skills: 'skills',
			hooks: 'hooks/hooks.json'
		});
		expect(synced.manifest.agents).toBeUndefined();
		expect(synced.manifest.outputStyles).toBeUndefined();
	});
});
