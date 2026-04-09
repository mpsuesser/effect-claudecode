/**
 * Tests for `Plugin.define` and `Plugin.write` — verifies the builder
 * normalizes config, and the writer materializes the canonical
 * directory layout via an in-memory `FileSystem.layerNoop` capture
 * harness.
 *
 * Because `writeFileString` and `makeDirectory` in the mock close
 * over plain JavaScript `Map`/`Set` instances, tests can assert on
 * the recorded writes without threading a Ref through the layer.
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

import { PluginWriteError } from '../../src/Errors.ts';
import * as Define from '../../src/Plugin/Define.ts';
import { McpJsonFile } from '../../src/Mcp/JsonFile.ts';
import { PluginManifest } from '../../src/Plugin/Manifest.ts';

// ---------------------------------------------------------------------------
// Capture harness
// ---------------------------------------------------------------------------

interface WriteCapture {
	readonly writes: Map<string, string>;
	readonly dirs: Set<string>;
	readonly layer: Layer.Layer<FileSystem.FileSystem | Path.Path>;
}

const permissionDeniedError = (path: string) =>
	PlatformError.systemError({
		_tag: 'PermissionDenied',
		module: 'FileSystem',
		method: 'writeFileString',
		description: 'Permission denied',
		pathOrDescriptor: path
	});

/**
 * Build a test layer whose `writeFileString` / `makeDirectory`
 * methods record into a shared `Map`/`Set`. When `failOn` is
 * provided, calls whose path matches are rejected with a fake
 * `PermissionDenied` error so error paths can be exercised.
 */
const makeCapture = (options?: {
	readonly failOn?: (path: string) => boolean;
}): WriteCapture => {
	const writes = new Map<string, string>();
	const dirs = new Set<string>();
	const shouldFail = options?.failOn ?? (() => false);

	const fsLayer = FileSystem.layerNoop({
		writeFileString: (path: string, content: string) =>
			shouldFail(path)
				? Effect.fail(permissionDeniedError(path))
				: Effect.sync(() => {
						writes.set(path, content);
					}),
		makeDirectory: (path: string) =>
			shouldFail(path)
				? Effect.fail(permissionDeniedError(path))
				: Effect.sync(() => {
						dirs.add(path);
					})
	});

	return {
		writes,
		dirs,
		layer: Layer.mergeAll(fsLayer, Path.layer)
	};
};

// ---------------------------------------------------------------------------
// Plugin.define — synchronous builder
// ---------------------------------------------------------------------------

describe('Plugin.define', () => {
	it('accepts a plain manifest object and validates it', () => {
		const def = Define.define({
			manifest: { name: 'my-plugin', version: '0.1.0' }
		});
		expect(def.manifest).toBeInstanceOf(PluginManifest);
		expect(def.manifest.name).toBe('my-plugin');
		expect(def.manifest.version).toBe('0.1.0');
	});

	it('passes through an existing PluginManifest instance unchanged', () => {
		const manifest = new PluginManifest({ name: 'pre-built' });
		const def = Define.define({ manifest });
		expect(def.manifest).toBe(manifest);
	});

	it('defaults all component arrays to empty', () => {
		const def = Define.define({ manifest: { name: 'p' } });
		expect(def.commands).toEqual([]);
		expect(def.agents).toEqual([]);
		expect(def.skills).toEqual([]);
		expect(def.outputStyles).toEqual([]);
		expect(Option.isNone(def.hooksConfig)).toBe(true);
		expect(Option.isNone(def.mcpConfig)).toBe(true);
	});

	it('wraps hooksConfig and mcpConfig as Option.some when provided', () => {
		const def = Define.define({
			manifest: { name: 'p' },
			hooksConfig: { PostToolUse: [] },
			mcpConfig: {
				mcpServers: {
					fs: { type: 'stdio', command: 'mcp-fs' }
				}
			}
		});
		expect(Option.isSome(def.hooksConfig)).toBe(true);
		expect(Option.isSome(def.mcpConfig)).toBe(true);
		if (Option.isSome(def.mcpConfig)) {
			expect(def.mcpConfig.value).toBeInstanceOf(McpJsonFile);
		}
	});

	it('builds typed component entries with helper constructors', () => {
		const review = Define.command({
			name: 'review',
			description: 'Review staged changes',
			body: '# Review\n'
		});
		const reviewer = Define.agent({
			name: 'reviewer',
			description: 'Review code',
			body: '# Reviewer\n'
		});
		const greet = Define.skill({
			name: 'greet',
			description: 'Say hello',
			body: '# Greet\n'
		});
		const terse = Define.outputStyle({
			name: 'terse',
			description: 'Keep responses compact',
			body: '# Terse\n'
		});

		expect(review.frontmatter.description).toBe('Review staged changes');
		expect(reviewer.frontmatter.name).toBe('reviewer');
		expect(greet.frontmatter.name).toBe('greet');
		expect(terse.frontmatter.name).toBe('terse');
	});
});

// ---------------------------------------------------------------------------
// Plugin.write — filesystem materialization
// ---------------------------------------------------------------------------

describe('Plugin.write — directory layout', () => {
	it.effect('writes .claude-plugin/plugin.json as pretty JSON', () =>
		Effect.gen(function* () {
			const capture = makeCapture();
			const def = Define.define({
				manifest: {
					name: 'my-plugin',
					version: '0.1.0',
					description: 'A test plugin'
				}
			});
			yield* Define.write(def, '/dest').pipe(Effect.provide(capture.layer));

			expect(capture.dirs.has('/dest/.claude-plugin')).toBe(true);
			const manifestContent = capture.writes.get(
				'/dest/.claude-plugin/plugin.json'
			);
			expect(manifestContent).toBeDefined();
			expect(manifestContent).toContain('"name": "my-plugin"');
			expect(manifestContent).toContain('"version": "0.1.0"');
			expect(manifestContent?.endsWith('\n')).toBe(true);
		})
	);

	it.effect('writes commands/<name>.md entries under the commands dir', () =>
		Effect.gen(function* () {
			const capture = makeCapture();
			const def = Define.define({
				manifest: { name: 'p' },
				commands: [
					Define.command({
						name: 'greet',
						description: 'Say hi',
						body: '# /greet\n\nSay hi.\n'
					}),
					Define.command({
						name: 'ship',
						description: 'Ship it',
						body: '# /ship\n\nShip it.\n'
					})
				]
			});
			yield* Define.write(def, '/dest').pipe(Effect.provide(capture.layer));

			expect(capture.dirs.has('/dest/commands')).toBe(true);
			expect(capture.writes.get('/dest/commands/greet.md')).toContain(
				'description: Say hi'
			);
			expect(capture.writes.get('/dest/commands/greet.md')).toContain(
				'# /greet'
			);
			expect(capture.writes.get('/dest/commands/ship.md')).toContain(
				'description: Ship it'
			);
		})
	);

	it.effect('writes agents/<name>.md entries under the agents dir', () =>
		Effect.gen(function* () {
			const capture = makeCapture();
			const def = Define.define({
				manifest: { name: 'p' },
				agents: [
					Define.agent({
						name: 'reviewer',
						description: 'Review code',
						body: '# reviewer\n'
					})
				]
			});
			yield* Define.write(def, '/dest').pipe(Effect.provide(capture.layer));

			expect(capture.dirs.has('/dest/agents')).toBe(true);
			expect(capture.writes.get('/dest/agents/reviewer.md')).toContain(
				'name: reviewer'
			);
			expect(capture.writes.get('/dest/agents/reviewer.md')).toContain(
				'# reviewer'
			);
		})
	);

	it.effect('writes skills as skills/<name>/SKILL.md with nested dirs', () =>
		Effect.gen(function* () {
			const capture = makeCapture();
			const def = Define.define({
				manifest: { name: 'p' },
				skills: [
					Define.skill({
						name: 'pdf-processor',
						description: 'Process PDFs',
						body: '# pdf-processor\n'
					}),
					Define.skill({
						name: 'code-reviewer',
						description: 'Review code',
						body: '# code-reviewer\n'
					})
				]
			});
			yield* Define.write(def, '/dest').pipe(Effect.provide(capture.layer));

			expect(capture.dirs.has('/dest/skills')).toBe(true);
			expect(capture.dirs.has('/dest/skills/pdf-processor')).toBe(true);
			expect(capture.dirs.has('/dest/skills/code-reviewer')).toBe(true);
			expect(
				capture.writes.get('/dest/skills/pdf-processor/SKILL.md')
			).toContain('name: pdf-processor');
			expect(
				capture.writes.get('/dest/skills/code-reviewer/SKILL.md')
			).toContain('name: code-reviewer');
		})
	);

	it.effect('writes output-styles/<name>.md entries', () =>
		Effect.gen(function* () {
			const capture = makeCapture();
			const def = Define.define({
				manifest: { name: 'p' },
				outputStyles: [
					Define.outputStyle({
						name: 'terse',
						description: 'Keep it brief',
						body: '# terse\n'
					})
				]
			});
			yield* Define.write(def, '/dest').pipe(Effect.provide(capture.layer));

			expect(capture.dirs.has('/dest/output-styles')).toBe(true);
			expect(capture.writes.get('/dest/output-styles/terse.md')).toContain(
				'name: terse'
			);
		})
	);

	it.effect('writes hooks/hooks.json only when hooksConfig is provided', () =>
		Effect.gen(function* () {
			const capture = makeCapture();
			const def = Define.define({
				manifest: { name: 'p' },
				hooksConfig: {
					PostToolUse: [
						{
							matcher: 'Write',
							hooks: [{ type: 'command', command: './fmt.sh' }]
						}
					]
				}
			});
			yield* Define.write(def, '/dest').pipe(Effect.provide(capture.layer));

			expect(capture.dirs.has('/dest/hooks')).toBe(true);
			const hooksContent = capture.writes.get('/dest/hooks/hooks.json');
			expect(hooksContent).toBeDefined();
			expect(hooksContent).toContain('"PostToolUse"');
			expect(hooksContent).toContain('"command": "./fmt.sh"');
		})
	);

	it.effect('writes .mcp.json only when mcpConfig is provided', () =>
		Effect.gen(function* () {
			const capture = makeCapture();
			const def = Define.define({
				manifest: { name: 'p' },
				mcpConfig: {
					mcpServers: {
						filesystem: { type: 'stdio', command: 'mcp-fs' }
					}
				}
			});
			yield* Define.write(def, '/dest').pipe(Effect.provide(capture.layer));

			const mcpContent = capture.writes.get('/dest/.mcp.json');
			expect(mcpContent).toBeDefined();
			expect(mcpContent).toContain('"mcpServers"');
			expect(mcpContent).toContain('"mcp-fs"');
		})
	);

	it.effect('skips empty component directories entirely', () =>
		Effect.gen(function* () {
			const capture = makeCapture();
			const def = Define.define({ manifest: { name: 'p' } });
			yield* Define.write(def, '/dest').pipe(Effect.provide(capture.layer));

			// Only the manifest dir is created; no commands/agents/skills/etc.
			expect(capture.dirs.has('/dest/commands')).toBe(false);
			expect(capture.dirs.has('/dest/agents')).toBe(false);
			expect(capture.dirs.has('/dest/skills')).toBe(false);
			expect(capture.dirs.has('/dest/output-styles')).toBe(false);
			expect(capture.dirs.has('/dest/hooks')).toBe(false);
			expect(capture.writes.has('/dest/.mcp.json')).toBe(false);
		})
	);
});

// ---------------------------------------------------------------------------
// Plugin.write — error path
// ---------------------------------------------------------------------------

describe('Plugin.write — errors', () => {
	it.effect('wraps FileSystem errors in PluginWriteError', () =>
		Effect.gen(function* () {
			const capture = makeCapture({
				failOn: (path) =>
					path === '/dest/.claude-plugin/plugin.json'
			});
			const def = Define.define({ manifest: { name: 'p' } });

			const raised = yield* Effect.flip(
				Define.write(def, '/dest').pipe(Effect.provide(capture.layer))
			);
			expect(raised).toBeInstanceOf(PluginWriteError);
			expect(raised).toMatchObject({
				_tag: 'PluginWriteError',
				path: '/dest/.claude-plugin/plugin.json'
			});
		})
	);

	it.effect('reports the first failing path when an entry write fails', () =>
		Effect.gen(function* () {
			const capture = makeCapture({
				failOn: (path) => path === '/dest/commands/broken.md'
			});
			const def = Define.define({
				manifest: { name: 'p' },
				commands: [
					Define.command({
						name: 'broken',
						description: 'Broken command',
						body: 'body\n'
					})
				]
			});

			const raised = yield* Effect.flip(
				Define.write(def, '/dest').pipe(Effect.provide(capture.layer))
			);
			expect(raised).toMatchObject({
				_tag: 'PluginWriteError',
				path: '/dest/commands/broken.md'
			});
		})
	);
});
