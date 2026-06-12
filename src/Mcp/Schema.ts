/**
 * Schema for a single MCP (Model Context Protocol) server entry.
 *
 * Claude Code understands stdio, HTTP (including the `streamable-http`
 * alias), WebSocket (`ws`), and deprecated SSE transports. String
 * fields are passed through opaquely; Claude Code performs its own
 * `${VAR}` / `${VAR:-default}` environment expansion in command,
 * args, env, url, and headers.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------------
// Legacy authorization (kept for source compatibility)
// ---------------------------------------------------------------------------

/** @deprecated Claude Code uses `oauth` for remote MCP OAuth config. */
export class OAuth2Authorization extends Schema.Class<OAuth2Authorization>(
	'OAuth2Authorization'
)({
	type: Schema.Literal('oauth2'),
	clientId: Schema.optional(Schema.String),
	clientSecret: Schema.optional(Schema.String),
	tokenUrl: Schema.optional(Schema.String),
	scopes: Schema.optional(Schema.Array(Schema.String))
}) {}

/** @deprecated Express API-key auth with plain `headers`. */
export class ApiKeyAuthorization extends Schema.Class<ApiKeyAuthorization>(
	'ApiKeyAuthorization'
)({
	type: Schema.Literal('apiKey'),
	key: Schema.String,
	header: Schema.optional(Schema.String)
}) {}

/** @deprecated Express bearer auth with plain `headers`. */
export class BearerAuthorization extends Schema.Class<BearerAuthorization>(
	'BearerAuthorization'
)({
	type: Schema.Literal('bearer'),
	token: Schema.String
}) {}

/** @deprecated Claude Code does not read an `authorization` block. */
export const McpAuthorization = Schema.Union([
	OAuth2Authorization,
	ApiKeyAuthorization,
	BearerAuthorization
]).annotate({ identifier: 'McpAuthorization' });

export type McpAuthorization = Schema.Schema.Type<typeof McpAuthorization>;

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export class McpOAuth extends Schema.Class<McpOAuth>('McpOAuth')({
	clientId: Schema.optional(Schema.String),
	callbackPort: Schema.optional(Schema.Number),
	authServerMetadataUrl: Schema.optional(Schema.String),
	scopes: Schema.optional(Schema.String)
}) {}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

/**
 * Stdio MCP server — a local child process. Claude Code permits omitting
 * `type` when `command` is present.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class StdioMcpServer extends Schema.Class<StdioMcpServer>(
	'StdioMcpServer'
)({
	type: Schema.optional(Schema.Literal('stdio')),
	command: Schema.String,
	args: Schema.optional(Schema.Array(Schema.String)),
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	/** @deprecated Not documented in current Claude Code MCP config. */
	cwd: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number),
	alwaysLoad: Schema.optional(Schema.Boolean)
}) {}

/**
 * HTTP MCP server — a remote endpoint that speaks streamable HTTP.
 * The JSON `type` field also accepts `streamable-http` as an alias.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class HttpMcpServer extends Schema.Class<HttpMcpServer>(
	'HttpMcpServer'
)({
	type: Schema.Literals(['http', 'streamable-http'] as const),
	url: Schema.String,
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	headersHelper: Schema.optional(Schema.String),
	/** @deprecated Not documented in current Claude Code MCP config. */
	allowedEnvVars: Schema.optional(Schema.Array(Schema.String)),
	timeout: Schema.optional(Schema.Number),
	alwaysLoad: Schema.optional(Schema.Boolean),
	oauth: Schema.optional(McpOAuth),
	/** @deprecated Claude Code does not read an `authorization` block. */
	authorization: Schema.optional(McpAuthorization)
}) {}

/**
 * WebSocket MCP server — a remote endpoint that speaks MCP over `ws`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class WsMcpServer extends Schema.Class<WsMcpServer>('WsMcpServer')({
	type: Schema.Literal('ws'),
	url: Schema.String,
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	headersHelper: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number),
	alwaysLoad: Schema.optional(Schema.Boolean)
}) {}

/**
 * SSE MCP server — a deprecated remote transport. Prefer `http` for
 * new configurations.
 *
 * @category Schemas
 * @since 0.1.0
 * @deprecated SSE transport is deprecated by Claude Code; use HTTP.
 */
export class SseMcpServer extends Schema.Class<SseMcpServer>('SseMcpServer')({
	type: Schema.Literal('sse'),
	url: Schema.String,
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	headersHelper: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number),
	alwaysLoad: Schema.optional(Schema.Boolean),
	oauth: Schema.optional(McpOAuth),
	/** @deprecated Claude Code does not read an `authorization` block. */
	authorization: Schema.optional(McpAuthorization)
}) {}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

/**
 * A single MCP server entry.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const McpServerConfig = Schema.Union([
	StdioMcpServer,
	HttpMcpServer,
	WsMcpServer,
	SseMcpServer
]).annotate({ identifier: 'McpServerConfig' });

export type McpServerConfig = Schema.Schema.Type<typeof McpServerConfig>;
