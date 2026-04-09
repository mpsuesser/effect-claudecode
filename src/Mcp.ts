/**
 * MCP module hub — schemas and loader for `.mcp.json` files.
 *
 * Users import this as a namespace:
 * `import { Mcp } from 'effect-claudecode'` and access members as
 * `Mcp.McpServerConfig`, `Mcp.McpJsonFile`, `Mcp.loadJson`, etc.
 *
 * @since 0.1.0
 */

// ---------------------------------------------------------------------------
// Server schemas
// ---------------------------------------------------------------------------

export {
	ApiKeyAuthorization,
	BearerAuthorization,
	HttpMcpServer,
	McpAuthorization,
	McpServerConfig,
	OAuth2Authorization,
	SseMcpServer,
	StdioMcpServer
} from './Mcp/Schema.ts';

// ---------------------------------------------------------------------------
// .mcp.json file schema + loader
// ---------------------------------------------------------------------------

export { McpJsonFile, loadJson } from './Mcp/JsonFile.ts';
export type { McpJsonFileInput } from './Mcp/JsonFile.ts';
