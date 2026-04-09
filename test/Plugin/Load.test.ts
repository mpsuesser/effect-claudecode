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
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';

import { PluginLoadError } from '../../src/Errors.ts';
import * as Plugin from '../../src/Plugin.ts';

// ---------------------------------------------------------------------------
// Test layer builder
// ---------------------------------------------------------------------------

const notFoundError = (path: string, method: string) =>
	PlatformError.systemError({
		_tag: 'NotFound',
		module: 'FileSystem',
		method,
		description: 'No such file or directory',
		pathOrDescriptor: path
	});

const hasEntry = (files: ReadonlyMap<string, string>, path: string): boolean =>
	files.has(path) || Array.from(files.keys()).some((key) => key.startsWith(`${path}/`));

const readDirectoryEntries = (
	files: ReadonlyMap<string, string>,
	dirPath: string
): ReadonlyArray<string> => {
	const prefix = `${dirPath}/`;
	const entries = new Set<string>();

	for (const filePath of files.keys()) {
		if (!filePath.startsWith(prefix)) continue;
		const remainder = filePath.slice(prefix.length);
		const slashIndex = remainder.indexOf('/');
		entries.add(slashIndex === -1 ? remainder : remainder.slice(0, slashIndex));
	}

	return Array.from(entries).sort();
};

const makeFileSystemLayer = (
	files: ReadonlyMap<string, string>
): Layer.Layer<FileSystem.FileSystem | Path.Path> =>
	Layer.mergeAll(
		FileSystem.layerNoop({
			exists: (path: string) => Effect.succeed(hasEntry(files, path)),
			readFileString: (path: string) => {
				const content = files.get(path);
				return content === undefined
					? Effect.fail(notFoundError(path, 'readFileString'))
					: Effect.succeed(content);
			},
			readDirectory: (path: string) =>
				hasEntry(files, path)
					? Effect.succeed([...readDirectoryEntries(files, path)])
					: Effect.fail(notFoundError(path, 'readDirectory'))
		}),
		Path.layer
	);

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
				makeFileSystemLayer(
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
				makeFileSystemLayer(
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
				makeFileSystemLayer(
					fsWith([
						[
							'/plugin/skills/greet/SKILL.md',
							'---\ndescription: Missing required name\n---\n\n# Broken\n'
						]
					])
				)
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
