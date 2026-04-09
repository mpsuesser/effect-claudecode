/**
 * Tests for the `Mcp.McpServerConfig` discriminated union and the
 * `Mcp.McpJsonFile` + `Mcp.loadJson` pair.
 *
 * Decode tests cover each transport (`stdio`, `http`, `sse`) with
 * representative shapes; authorization variants are smoke-tested
 * through the HTTP transport. The loader is exercised against an
 * in-memory `FileSystem.layerNoop` to confirm the happy path plus
 * I/O, parse, and decode error wrapping.
 *
 * @since 0.1.0
 */
import { describe, expect, it } from '@effect/vitest';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Layer from 'effect/Layer';
import * as PlatformError from 'effect/PlatformError';
import * as Schema from 'effect/Schema';

import { McpConfigError } from '../../src/Errors.ts';
import {
	ApiKeyAuthorization,
	BearerAuthorization,
	HttpMcpServer,
	McpServerConfig,
	OAuth2Authorization,
	SseMcpServer,
	StdioMcpServer
} from '../../src/Mcp/Schema.ts';
import { McpJsonFile, loadJson } from '../../src/Mcp/JsonFile.ts';

const decodeServer = Schema.decodeUnknownEffect(McpServerConfig);
const decodeHttp = Schema.decodeUnknownEffect(HttpMcpServer);
const decodeFile = Schema.decodeUnknownEffect(McpJsonFile);

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
// McpServerConfig — transport variants
// ---------------------------------------------------------------------------

describe('McpServerConfig — stdio', () => {
	it.effect('decodes a minimal stdio server with just command', () =>
		Effect.gen(function* () {
			const server = yield* decodeServer({
				type: 'stdio',
				command: 'mcp-fs'
			});
			expect(server).toBeInstanceOf(StdioMcpServer);
			expect(server).toMatchObject({ type: 'stdio', command: 'mcp-fs' });
		})
	);

	it.effect('decodes a full stdio server with args, env, cwd, timeout', () =>
		Effect.gen(function* () {
			const server = yield* decodeServer({
				type: 'stdio',
				command: 'node',
				args: ['./server.js', '--port', '3000'],
				env: {
					NODE_ENV: 'production',
					API_KEY: 'secret'
				},
				cwd: '/app',
				timeout: 30
			});
			expect(server).toMatchObject({
				type: 'stdio',
				command: 'node',
				args: ['./server.js', '--port', '3000'],
				env: { NODE_ENV: 'production', API_KEY: 'secret' },
				cwd: '/app',
				timeout: 30
			});
		})
	);
});

describe('McpServerConfig — http', () => {
	it.effect('decodes an http server with url and headers', () =>
		Effect.gen(function* () {
			const server = yield* decodeServer({
				type: 'http',
				url: 'https://api.example.com/mcp',
				headers: { 'X-Custom': 'value' },
				allowedEnvVars: ['API_KEY']
			});
			expect(server).toBeInstanceOf(HttpMcpServer);
			expect(server).toMatchObject({
				type: 'http',
				url: 'https://api.example.com/mcp',
				headers: { 'X-Custom': 'value' },
				allowedEnvVars: ['API_KEY']
			});
		})
	);

	it.effect('decodes OAuth2, apiKey, and bearer authorization variants', () =>
		Effect.gen(function* () {
			// Decode directly as HttpMcpServer so `authorization` is
			// typed on the result without needing a cast.
			const oauth = yield* decodeHttp({
				type: 'http',
				url: 'https://oauth.example.com',
				authorization: {
					type: 'oauth2',
					clientId: 'client-123',
					tokenUrl: 'https://oauth.example.com/token',
					scopes: ['read', 'write']
				}
			});
			expect(oauth.authorization).toBeInstanceOf(OAuth2Authorization);

			const apiKey = yield* decodeHttp({
				type: 'http',
				url: 'https://api.example.com',
				authorization: {
					type: 'apiKey',
					key: 'secret-key',
					header: 'X-API-Key'
				}
			});
			expect(apiKey.authorization).toBeInstanceOf(ApiKeyAuthorization);

			const bearer = yield* decodeHttp({
				type: 'http',
				url: 'https://api.example.com',
				authorization: {
					type: 'bearer',
					token: 'bearer-token'
				}
			});
			expect(bearer.authorization).toBeInstanceOf(BearerAuthorization);
		})
	);
});

describe('McpServerConfig — sse', () => {
	it.effect('decodes an sse server with url', () =>
		Effect.gen(function* () {
			const server = yield* decodeServer({
				type: 'sse',
				url: 'https://events.example.com/mcp',
				headers: { 'Cache-Control': 'no-cache' }
			});
			expect(server).toBeInstanceOf(SseMcpServer);
			expect(server).toMatchObject({
				type: 'sse',
				url: 'https://events.example.com/mcp'
			});
		})
	);
});

describe('McpServerConfig — errors', () => {
	it.effect('rejects a server with an unknown transport type', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeServer({ type: 'websocket', url: 'ws://x' })
			);
			expect(error).toBeInstanceOf(Schema.SchemaError);
		})
	);

	it.effect('rejects a stdio server missing the required command field', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeServer({ type: 'stdio', args: [] })
			);
			expect(error).toBeInstanceOf(Schema.SchemaError);
		})
	);
});

// ---------------------------------------------------------------------------
// McpJsonFile — top-level wrapper
// ---------------------------------------------------------------------------

describe('McpJsonFile', () => {
	it.effect('decodes a file with multiple named servers across transports', () =>
		Effect.gen(function* () {
			const file = yield* decodeFile({
				mcpServers: {
					filesystem: { type: 'stdio', command: 'mcp-fs' },
					api: {
						type: 'http',
						url: 'https://api.example.com/mcp'
					},
					events: {
						type: 'sse',
						url: 'https://events.example.com'
					}
				}
			});
			expect(file).toBeInstanceOf(McpJsonFile);
			expect(Object.keys(file.mcpServers)).toEqual([
				'filesystem',
				'api',
				'events'
			]);
			expect(file.mcpServers['filesystem']).toBeInstanceOf(StdioMcpServer);
			expect(file.mcpServers['api']).toBeInstanceOf(HttpMcpServer);
			expect(file.mcpServers['events']).toBeInstanceOf(SseMcpServer);
		})
	);

	it.effect('rejects a file missing the mcpServers field', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeFile({ otherField: 'unrelated' })
			);
			expect(error).toBeInstanceOf(Schema.SchemaError);
		})
	);

	it.effect('rejects a file where mcpServers is the wrong type', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				decodeFile({ mcpServers: 'not an object' })
			);
			expect(error).toBeInstanceOf(Schema.SchemaError);
		})
	);
});

// ---------------------------------------------------------------------------
// loadJson — filesystem loader
// ---------------------------------------------------------------------------

describe('Mcp.loadJson', () => {
	it.effect('reads, parses, and decodes a valid .mcp.json', () =>
		Effect.gen(function* () {
			const file = yield* loadJson('/.mcp.json');
			expect(file.mcpServers['fs']).toBeInstanceOf(StdioMcpServer);
			expect(file.mcpServers['fs']).toMatchObject({
				type: 'stdio',
				command: 'mcp-fs'
			});
		}).pipe(
			Effect.provide(
				makeFileSystemLayer(
					new Map([
						[
							'/.mcp.json',
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

	it.effect('wraps I/O failures in McpConfigError', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(loadJson('/missing.json'));
			expect(raised).toBeInstanceOf(McpConfigError);
			expect(raised).toMatchObject({
				_tag: 'McpConfigError',
				path: '/missing.json'
			});
		}).pipe(Effect.provide(makeFileSystemLayer(new Map())))
	);

	it.effect('wraps JSON parse failures in McpConfigError', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(loadJson('/broken.json'));
			expect(raised).toBeInstanceOf(McpConfigError);
		}).pipe(
			Effect.provide(
				makeFileSystemLayer(
					new Map([['/broken.json', 'not valid json']])
				)
			)
		)
	);

	it.effect('wraps schema decode failures in McpConfigError', () =>
		Effect.gen(function* () {
			const raised = yield* Effect.flip(loadJson('/invalid.json'));
			expect(raised).toBeInstanceOf(McpConfigError);
		}).pipe(
			Effect.provide(
				makeFileSystemLayer(
					new Map([
						[
							'/invalid.json',
							JSON.stringify({
								mcpServers: {
									// Unknown transport type
									bad: { type: 'websocket', url: 'ws://x' }
								}
							})
						]
					])
				)
			)
		)
	);
});
