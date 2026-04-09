/**
 * Schema for a single MCP (Model Context Protocol) server entry.
 *
 * Claude Code understands three transports:
 *
 * - **stdio**: a local child process that speaks MCP over stdin/stdout.
 *   Carries `command`, `args`, `env`, and `cwd`.
 * - **http**: a remote HTTP endpoint. Carries `url`, `headers`, and
 *   `allowedEnvVars` for env substitution.
 * - **sse**: a remote Server-Sent Events endpoint. Carries `url` and
 *   `headers`.
 *
 * The discriminator is the `type` field. Every variant may also
 * include a `timeout` and an `authorization` block (OAuth2, API key,
 * or bearer token).
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * OAuth2 authorization block for an MCP server.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class OAuth2Authorization extends Schema.Class<OAuth2Authorization>(
	'OAuth2Authorization'
)({
	type: Schema.Literal('oauth2'),
	clientId: Schema.optional(Schema.String),
	clientSecret: Schema.optional(Schema.String),
	tokenUrl: Schema.optional(Schema.String),
	scopes: Schema.optional(Schema.Array(Schema.String))
}) {}

/**
 * API-key authorization block — typically sent as a header.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ApiKeyAuthorization extends Schema.Class<ApiKeyAuthorization>(
	'ApiKeyAuthorization'
)({
	type: Schema.Literal('apiKey'),
	key: Schema.String,
	header: Schema.optional(Schema.String)
}) {}

/**
 * Static bearer token authorization.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class BearerAuthorization extends Schema.Class<BearerAuthorization>(
	'BearerAuthorization'
)({
	type: Schema.Literal('bearer'),
	token: Schema.String
}) {}

/**
 * The `authorization` field on HTTP / SSE MCP servers — a
 * discriminated union of the three supported auth mechanisms.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const McpAuthorization = Schema.Union([
	OAuth2Authorization,
	ApiKeyAuthorization,
	BearerAuthorization
]).annotate({ identifier: 'McpAuthorization' });

export type McpAuthorization = Schema.Schema.Type<typeof McpAuthorization>;

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

/**
 * Stdio MCP server — a local child process.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class StdioMcpServer extends Schema.Class<StdioMcpServer>(
	'StdioMcpServer'
)({
	type: Schema.Literal('stdio'),
	command: Schema.String,
	args: Schema.optional(Schema.Array(Schema.String)),
	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	cwd: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number)
}) {}

/**
 * HTTP MCP server — a remote endpoint that speaks MCP over plain
 * HTTP requests.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class HttpMcpServer extends Schema.Class<HttpMcpServer>(
	'HttpMcpServer'
)({
	type: Schema.Literal('http'),
	url: Schema.String,
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	allowedEnvVars: Schema.optional(Schema.Array(Schema.String)),
	timeout: Schema.optional(Schema.Number),
	authorization: Schema.optional(McpAuthorization)
}) {}

/**
 * SSE MCP server — a remote endpoint that streams MCP messages over
 * Server-Sent Events.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class SseMcpServer extends Schema.Class<SseMcpServer>('SseMcpServer')({
	type: Schema.Literal('sse'),
	url: Schema.String,
	headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	timeout: Schema.optional(Schema.Number),
	authorization: Schema.optional(McpAuthorization)
}) {}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

/**
 * A single MCP server entry. Discriminated on the `type` field,
 * which must be one of `stdio`, `http`, or `sse`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const McpServerConfig = Schema.Union([
	StdioMcpServer,
	HttpMcpServer,
	SseMcpServer
]).annotate({ identifier: 'McpServerConfig' });

export type McpServerConfig = Schema.Schema.Type<typeof McpServerConfig>;
