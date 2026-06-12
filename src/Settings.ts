/**
 * Settings module hub — schemas and loader for Claude Code's
 * settings.json files.
 *
 * @since 0.1.0
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export {
	ApiKeyHelper,
	ApiKeyHelperConfig,
	AttributionConfig,
	DirectoryMarketplace,
	DirectorySourceSpec,
	GenericMarketplace,
	GitSourceSpec,
	GithubMarketplace,
	GithubSourceSpec,
	HostPatternSourceSpec,
	Marketplace,
	MarketplaceSourceSpec,
	McpServerEntry,
	PermissionMode,
	PermissionsConfig,
	SandboxConfig,
	SandboxFilesystemConfig,
	SandboxNetworkConfig,
	SettingsSourceSpec,
	SettingsFile,
	StatusLineConfig,
	WorkingDirectoriesConfig
} from './Settings/Schema.ts';

// ---------------------------------------------------------------------------
// Hooks section
// ---------------------------------------------------------------------------

export {
	AgentHookEntry,
	CommandHookEntry,
	HookEntry,
	HookMatcherGroup,
	HooksSection,
	HttpHookEntry,
	McpToolHookEntry,
	PromptHookEntry
} from './Settings/HooksSection.ts';

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export {
	load,
	localSettingsPath,
	projectSettingsPath,
	userSettingsPath
} from './Settings/Loader.ts';
