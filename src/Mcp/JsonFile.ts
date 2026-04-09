/**
 * Schema for the `.mcp.json` file — Claude Code's canonical location
 * for declaring MCP servers.
 *
 * ```jsonc
 * {
 *   "mcpServers": {
 *     "filesystem": {
 *       "type": "stdio",
 *       "command": "mcp-fs",
 *       "args": ["--root", "/var/data"]
 *     },
 *     "remote-api": {
 *       "type": "http",
 *       "url": "https://api.example.com/mcp",
 *       "headers": { "X-API-Key": "..." }
 *     }
 *   }
 * }
 * ```
 *
 * Plus an `Mcp.loadJson` loader that reads the file through the
 * `FileSystem` service and decodes it against this schema.
 *
 * @since 0.1.0
 */
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Schema from 'effect/Schema';

import { McpConfigError } from '../Errors.ts';
import { McpServerConfig } from './Schema.ts';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * The full `.mcp.json` file shape — a record of named MCP server
 * entries under a `mcpServers` key.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class McpJsonFile extends Schema.Class<McpJsonFile>('McpJsonFile')({
	mcpServers: Schema.Record(Schema.String, McpServerConfig)
}) {}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Read a `.mcp.json` file from disk, parse it as JSON, and decode
 * against `McpJsonFile`.
 *
 * Any read, parse, or decode failure is wrapped in a single
 * `McpConfigError` carrying the offending path and the underlying
 * cause.
 *
 * @category Loader
 * @since 0.1.0
 * @example
 * ```ts
 * import * as Effect from 'effect/Effect'
 * import { NodeFileSystem } from '@effect/platform-node-shared/NodeFileSystem'
 * import { Mcp } from 'effect-claudecode'
 *
 * const program = Mcp.loadJson('./.mcp.json').pipe(
 *   Effect.provide(NodeFileSystem.layer)
 * )
 * ```
 */
export const loadJson = (
	path: string
): Effect.Effect<McpJsonFile, McpConfigError, FileSystem.FileSystem> =>
	Effect.fn('Mcp.loadJson')(function* (path: string) {
		yield* Effect.annotateCurrentSpan('mcp.path', path);
		yield* Effect.logDebug('loading MCP config').pipe(
			Effect.annotateLogs({ path })
		);
		const fs = yield* FileSystem.FileSystem;
		const raw = yield* fs
			.readFileString(path)
			.pipe(
				Effect.mapError(
					(cause) => new McpConfigError({ path, cause })
				)
			);
		const parsed = yield* Schema.decodeUnknownEffect(
			Schema.UnknownFromJsonString
		)(raw).pipe(
			Effect.mapError((cause) => new McpConfigError({ path, cause }))
		);
		return yield* Schema.decodeUnknownEffect(McpJsonFile)(parsed).pipe(
			Effect.mapError((cause) => new McpConfigError({ path, cause }))
		);
	})(path);
