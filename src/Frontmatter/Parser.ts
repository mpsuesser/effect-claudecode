/**
 * Generic markdown + YAML frontmatter splitter.
 *
 * Claude Code skill, subagent, command, and output-style files all
 * follow the same layout:
 *
 * ```markdown
 * ---
 * name: my-thing
 * description: Does something useful
 * ---
 *
 * The rest of the file is the body…
 * ```
 *
 * This module exposes `parse(source)` for raw strings and
 * `parseFile(path)` for reading from disk. Both return the raw
 * `frontmatter` (as `unknown` — YAML-decoded but not schema-checked)
 * plus the markdown `body`. Schema validation happens in the
 * per-file-type modules (`Skill.ts`, `Subagent.ts`, etc.).
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import { parse as parseYaml } from 'yaml';

import {
	FrontmatterParseError,
	FrontmatterReadError
} from '../Errors.ts';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * The result of splitting a markdown file into its YAML frontmatter
 * and its body. The `frontmatter` is the YAML-decoded value — a plain
 * JavaScript object, typed as `unknown` so callers must validate it
 * against a schema before using its fields.
 *
 * @category Models
 * @since 0.1.0
 */
export interface ParsedFrontmatter {
	readonly frontmatter: unknown;
	readonly body: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split a source string into its YAML frontmatter block and body.
 * Returns `undefined` when no frontmatter delimiters are present.
 *
 * The frontmatter must start on the first line with `---` followed
 * by either a newline or EOF. The closing delimiter is another `---`
 * on its own line. Everything between is the YAML block; everything
 * after is the body.
 *
 * @internal
 */
const splitFrontmatter = (
	source: string
): { readonly yaml: string; readonly body: string } | undefined => {
	if (!source.startsWith('---')) return undefined;

	// The opening delimiter must be followed by a newline or EOF.
	const afterOpen = source.slice(3);
	if (afterOpen.length > 0 && afterOpen[0] !== '\n' && afterOpen[0] !== '\r') {
		return undefined;
	}

	// Find the closing delimiter on its own line.
	const closePattern = /\n---(?:\r?\n|$)/;
	const match = closePattern.exec(afterOpen);
	if (match === null) return undefined;

	const yaml = afterOpen.slice(0, match.index);
	const body = afterOpen.slice(match.index + match[0].length);
	return { yaml, body };
};

/**
 * YAML-decode a block of text. Wraps the synchronous `yaml.parse`
 * call in an `Effect.try` so any throw becomes a tagged error.
 *
 * @internal
 */
const decodeYaml = (
	path: string,
	yaml: string
): Effect.Effect<unknown, FrontmatterParseError> =>
	Effect.try({
		try: () => parseYaml(yaml),
		catch: (cause) => new FrontmatterParseError({ path, cause })
	});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw markdown string into its frontmatter and body.
 *
 * If the source has no `---` delimiters, `frontmatter` is
 * `undefined` and `body` is the whole source verbatim. If the
 * delimiters are present but the YAML fails to parse, a
 * `FrontmatterParseError` is raised.
 *
 * The `path` argument is used only for error reporting — pass a
 * sentinel like `"<inline>"` if the source didn't come from a file.
 *
 * @category Parser
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import { Frontmatter } from 'effect-claudecode'
 *
 * const program = Effect.gen(function* () {
 *   const { frontmatter, body } = yield* Frontmatter.parse(
 *     '---\nname: greet\n---\n\nSay hello.\n',
 *     '<inline>'
 *   )
 *   // frontmatter: { name: 'greet' }
 *   // body: '\nSay hello.\n'
 * })
 * ```
 */
export const parse = (
	source: string,
	path: string
): Effect.Effect<ParsedFrontmatter, FrontmatterParseError> =>
	Effect.gen(function* () {
		const split = splitFrontmatter(source);
		if (split === undefined) {
			return { frontmatter: undefined, body: source };
		}
		const frontmatter = yield* decodeYaml(path, split.yaml);
		return { frontmatter, body: split.body };
	});

/**
 * Read a markdown file from disk and parse its frontmatter. Requires
 * a `FileSystem` service.
 *
 * Produces `FrontmatterReadError` if the file cannot be read and
 * `FrontmatterParseError` if the YAML block is malformed.
 *
 * @category Parser
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import { NodeFileSystem } from '@effect/platform-node-shared/NodeFileSystem'
 * import { Frontmatter } from 'effect-claudecode'
 *
 * const program = Frontmatter.parseFile('./skills/my-skill/SKILL.md').pipe(
 *   Effect.provide(NodeFileSystem.layer)
 * )
 * ```
 */
export const parseFile = (
	path: string
): Effect.Effect<
	ParsedFrontmatter,
	FrontmatterReadError | FrontmatterParseError,
	FileSystem.FileSystem
> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const source = yield* fs
			.readFileString(path)
			.pipe(
				Effect.mapError(
					(cause) => new FrontmatterReadError({ path, cause })
				)
			);
		return yield* parse(source, path);
	});
