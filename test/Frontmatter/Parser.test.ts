/**
 * Tests for `Frontmatter.parse` and `Frontmatter.parseFile`.
 *
 * The parser tests use inline source strings with a sentinel path;
 * the file-reader tests use an in-memory `FileSystem.layerNoop`
 * keyed on absolute paths.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as PlatformError from 'effect/PlatformError';

import {
	FrontmatterParseError,
	FrontmatterReadError
} from '../../src/Errors.ts';
import * as Parser from '../../src/Frontmatter/Parser.ts';

// ---------------------------------------------------------------------------
// Test layer builder
// ---------------------------------------------------------------------------

const notFoundError = (path: string) =>
	PlatformError.systemError({
		_tag: 'NotFound',
		module: 'FileSystem',
		method: 'readFileString',
		description: 'No such file or directory',
		pathOrDescriptor: path
	});

const makeFileSystemLayer = (
	files: ReadonlyMap<string, string>
): Layer.Layer<FileSystem.FileSystem> =>
	FileSystem.layerNoop({
		readFileString: (path: string) => {
			const content = files.get(path);
			return content === undefined
				? Effect.fail(notFoundError(path))
				: Effect.succeed(content);
		}
	});

// ---------------------------------------------------------------------------
// parse — string input
// ---------------------------------------------------------------------------

describe('Frontmatter.parse', () => {
	it.effect('splits a typical skill markdown into frontmatter and body', () =>
		Effect.gen(function* () {
			const source = [
				'---',
				'name: greet',
				'description: Say hello',
				'---',
				'',
				'# Greet',
				'',
				'Say hello to the user.',
				''
			].join('\n');

			const result = yield* Parser.parse(source, '<inline>');
			expect(result.frontmatter).toEqual({
				name: 'greet',
				description: 'Say hello'
			});
			expect(result.body).toBe(
				'\n# Greet\n\nSay hello to the user.\n'
			);
		})
	);

	it.effect('decodes scalars, booleans, arrays, and nested objects', () =>
		Effect.gen(function* () {
			const source = [
				'---',
				'name: complex',
				'user-invocable: true',
				'effort: high',
				'maxTurns: 20',
				'allowed-tools:',
				'  - Read',
				'  - Write',
				'hooks:',
				'  PreToolUse:',
				'    - matcher: Bash',
				'      hooks:',
				'        - type: command',
				'          command: check.sh',
				'---',
				'',
				'body'
			].join('\n');

			const result = yield* Parser.parse(source, '<inline>');
			expect(result.frontmatter).toMatchObject({
				name: 'complex',
				'user-invocable': true,
				effort: 'high',
				maxTurns: 20,
				'allowed-tools': ['Read', 'Write'],
				hooks: {
					PreToolUse: [
						{
							matcher: 'Bash',
							hooks: [{ type: 'command', command: 'check.sh' }]
						}
					]
				}
			});
		})
	);

	it.effect(
		'returns frontmatter: undefined when no delimiters are present',
		() =>
			Effect.gen(function* () {
				const source = '# Just a heading\n\nNo frontmatter here.\n';
				const result = yield* Parser.parse(source, '<inline>');
				expect(result.frontmatter).toBeUndefined();
				expect(result.body).toBe(source);
			})
	);

	it.effect('returns frontmatter: undefined when the closing `---` is missing', () =>
		Effect.gen(function* () {
			const source = '---\nname: broken\n\nnever closed';
			const result = yield* Parser.parse(source, '<inline>');
			expect(result.frontmatter).toBeUndefined();
			expect(result.body).toBe(source);
		})
	);

	it.effect('raises FrontmatterParseError on malformed YAML', () =>
		Effect.gen(function* () {
			const source = '---\nname: [unclosed\n---\nbody\n';
			const raised = yield* Effect.flip(Parser.parse(source, '/file.md'));
			expect(raised).toBeInstanceOf(FrontmatterParseError);
			expect(raised).toMatchObject({
				_tag: 'FrontmatterParseError',
				path: '/file.md'
			});
		})
	);

	it.effect('handles an empty frontmatter block', () =>
		Effect.gen(function* () {
			const source = '---\n---\nbody\n';
			const result = yield* Parser.parse(source, '<inline>');
			// YAML parses an empty document as null
			expect(result.frontmatter).toBeNull();
			expect(result.body).toBe('body\n');
		})
	);
});

// ---------------------------------------------------------------------------
// parseFile — filesystem input
// ---------------------------------------------------------------------------

describe('Frontmatter.parseFile', () => {
	it.effect('reads a file from the FileSystem service and parses it', () =>
		Effect.gen(function* () {
			const path = '/skills/my-skill/SKILL.md';
			const result = yield* Parser.parseFile(path);
			expect(result.frontmatter).toEqual({
				name: 'my-skill',
				description: 'Does useful work'
			});
			expect(result.body.trim()).toBe('Hello from the body.');
		}).pipe(
			Effect.provide(
				makeFileSystemLayer(
					new Map([
						[
							'/skills/my-skill/SKILL.md',
							'---\nname: my-skill\ndescription: Does useful work\n---\n\nHello from the body.\n'
						]
					])
				)
			)
		)
	);

	it.effect('surfaces I/O failures as FrontmatterReadError', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(
				Parser.parseFile('/missing.md')
			);
			expect(raised).toBeInstanceOf(FrontmatterReadError);
			expect(raised).toMatchObject({
				_tag: 'FrontmatterReadError',
				path: '/missing.md'
			});
		}).pipe(Effect.provide(makeFileSystemLayer(new Map())))
	);

	it.effect('surfaces YAML failures as FrontmatterParseError with the file path', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(
				Parser.parseFile('/broken.md')
			);
			expect(raised).toBeInstanceOf(FrontmatterParseError);
			expect(raised).toMatchObject({
				_tag: 'FrontmatterParseError',
				path: '/broken.md'
			});
		}).pipe(
			Effect.provide(
				makeFileSystemLayer(
					new Map([['/broken.md', '---\nname: [bad\n---\nbody\n']])
				)
			)
		)
	);
});
