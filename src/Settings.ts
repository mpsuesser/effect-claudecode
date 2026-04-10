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
	ApiKeyHelperConfig,
	DirectoryMarketplace,
	DirectorySourceSpec,
	GithubMarketplace,
	GithubSourceSpec,
	Marketplace,
	McpServerEntry,
	PermissionMode,
	PermissionsConfig,
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
