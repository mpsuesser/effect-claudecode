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
	McpOAuth,
	McpServerConfig,
	OAuth2Authorization,
	SseMcpServer,
	StdioMcpServer,
	WsMcpServer
} from './Mcp/Schema.ts';

// ---------------------------------------------------------------------------
// .mcp.json file schema + loader
// ---------------------------------------------------------------------------

export {
	ClaudeJsonFile,
	ClaudeJsonProject,
	McpJsonFile,
	loadClaudeJson,
	loadEffective,
	loadJson,
	loadManagedMcp,
	managedMcpJsonPaths,
	mergeMcpJsonFiles,
	projectMcpJsonPath,
	toClaudeCodeJson,
	userClaudeJsonPath
} from './Mcp/JsonFile.ts';
export type {
	EffectiveMcpLoadOptions,
	ManagedMcpLoadOptions,
	McpJsonFileInput
} from './Mcp/JsonFile.ts';
