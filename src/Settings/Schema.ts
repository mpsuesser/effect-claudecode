/**
 * Schema for Claude Code's settings.json file.
 *
 * Covers the fields effect-claudecode understands strictly. Nested
 * sub-schemas are named `Schema.Class` instances so they produce clean
 * identifiers in error messages and TypeScript hover info.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import { HooksSection } from './HooksSection.ts';

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export const PermissionMode = Schema.Literals([
	'default',
	'plan',
	'acceptEdits',
	'auto',
	'dontAsk',
	'bypassPermissions'
] as const);

export class WorkingDirectoriesConfig extends Schema.Class<WorkingDirectoriesConfig>(
	'WorkingDirectoriesConfig'
)({
	allowed: Schema.optional(Schema.Array(Schema.String)),
	denied: Schema.optional(Schema.Array(Schema.String))
}) {}

export class PermissionsConfig extends Schema.Class<PermissionsConfig>(
	'PermissionsConfig'
)({
	defaultMode: Schema.optional(PermissionMode),
	allow: Schema.optional(Schema.Array(Schema.String)),
	ask: Schema.optional(Schema.Array(Schema.String)),
	deny: Schema.optional(Schema.Array(Schema.String)),
	additionalDirectories: Schema.optional(Schema.Array(Schema.String)),
	disableBypassPermissionsMode: Schema.optional(Schema.Literal('disable')),
	skipDangerousModePermissionPrompt: Schema.optional(Schema.Boolean),

	/** @deprecated Use `defaultMode`. */
	mode: Schema.optional(PermissionMode),
	/** @deprecated Use `additionalDirectories`. */
	workingDirectories: Schema.optional(WorkingDirectoriesConfig)
}) {}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export class SandboxFilesystemConfig extends Schema.Class<SandboxFilesystemConfig>(
	'SandboxFilesystemConfig'
)({
	allowWrite: Schema.optional(Schema.Array(Schema.String)),
	denyWrite: Schema.optional(Schema.Array(Schema.String)),
	denyRead: Schema.optional(Schema.Array(Schema.String)),
	allowRead: Schema.optional(Schema.Array(Schema.String)),
	allowManagedReadPathsOnly: Schema.optional(Schema.Boolean)
}) {}

export class SandboxNetworkConfig extends Schema.Class<SandboxNetworkConfig>(
	'SandboxNetworkConfig'
)({
	allowUnixSockets: Schema.optional(Schema.Array(Schema.String)),
	allowAllUnixSockets: Schema.optional(Schema.Boolean),
	allowLocalBinding: Schema.optional(Schema.Boolean),
	allowMachLookup: Schema.optional(Schema.Array(Schema.String)),
	allowedDomains: Schema.optional(Schema.Array(Schema.String)),
	deniedDomains: Schema.optional(Schema.Array(Schema.String)),
	allowManagedDomainsOnly: Schema.optional(Schema.Boolean),
	httpProxyPort: Schema.optional(Schema.Number),
	socksProxyPort: Schema.optional(Schema.Number)
}) {}

export class SandboxConfig extends Schema.Class<SandboxConfig>('SandboxConfig')({
	enabled: Schema.optional(Schema.Boolean),
	failIfUnavailable: Schema.optional(Schema.Boolean),
	autoAllowBashIfSandboxed: Schema.optional(Schema.Boolean),
	excludedCommands: Schema.optional(Schema.Array(Schema.String)),
	allowUnsandboxedCommands: Schema.optional(Schema.Boolean),
	filesystem: Schema.optional(SandboxFilesystemConfig),
	network: Schema.optional(SandboxNetworkConfig),
	enableWeakerNestedSandbox: Schema.optional(Schema.Boolean),
	enableWeakerNetworkIsolation: Schema.optional(Schema.Boolean),
	bwrapPath: Schema.optional(Schema.String),
	socatPath: Schema.optional(Schema.String)
}) {}

// ---------------------------------------------------------------------------
// Status line
// ---------------------------------------------------------------------------

export class StatusLineConfig extends Schema.Class<StatusLineConfig>(
	'StatusLineConfig'
)({
	type: Schema.Literal('command'),
	command: Schema.optional(Schema.String),
	padding: Schema.optional(Schema.Number),
	refreshInterval: Schema.optional(Schema.Number)
}) {}

// ---------------------------------------------------------------------------
// MCP server entry schema
// ---------------------------------------------------------------------------

/**
 * A single MCP server entry inside settings.json.
 *
 * The stricter schema lives in `src/Mcp/`; settings keeps this loose so
 * the Settings namespace does not depend on the MCP module.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const McpServerEntry = Schema.Record(
	Schema.String,
	Schema.Unknown
).annotate({ identifier: 'McpServerEntry' });

export type McpServerEntry = Schema.Schema.Type<typeof McpServerEntry>;

// ---------------------------------------------------------------------------
// Marketplace source
// ---------------------------------------------------------------------------

export class DirectorySourceSpec extends Schema.Class<DirectorySourceSpec>(
	'DirectorySourceSpec'
)({
	source: Schema.Literal('directory'),
	path: Schema.String
}) {}

export class GithubSourceSpec extends Schema.Class<GithubSourceSpec>(
	'GithubSourceSpec'
)({
	source: Schema.Literal('github'),
	repo: Schema.String,
	ref: Schema.optional(Schema.String),
	path: Schema.optional(Schema.String),
	sha: Schema.optional(Schema.String),
	skipLfs: Schema.optional(Schema.Boolean)
}) {}

export class GitSourceSpec extends Schema.Class<GitSourceSpec>('GitSourceSpec')({
	source: Schema.Literal('git'),
	url: Schema.String,
	ref: Schema.optional(Schema.String),
	path: Schema.optional(Schema.String),
	sha: Schema.optional(Schema.String),
	skipLfs: Schema.optional(Schema.Boolean)
}) {}

export class HostPatternSourceSpec extends Schema.Class<HostPatternSourceSpec>(
	'HostPatternSourceSpec'
)({
	source: Schema.Literal('hostPattern'),
	pattern: Schema.String
}) {}

export class SettingsSourceSpec extends Schema.Class<SettingsSourceSpec>(
	'SettingsSourceSpec'
)({
	source: Schema.Literal('settings'),
	name: Schema.optional(Schema.String),
	plugins: Schema.optional(Schema.Array(Schema.Record(Schema.String, Schema.Unknown)))
}) {}

export const MarketplaceSourceSpec = Schema.Union([
	DirectorySourceSpec,
	GithubSourceSpec,
	GitSourceSpec,
	HostPatternSourceSpec,
	SettingsSourceSpec
]).annotate({ identifier: 'MarketplaceSourceSpec' });

export class DirectoryMarketplace extends Schema.Class<DirectoryMarketplace>(
	'DirectoryMarketplace'
)({
	source: DirectorySourceSpec,
	autoUpdate: Schema.optional(Schema.Boolean)
}) {}

export class GithubMarketplace extends Schema.Class<GithubMarketplace>(
	'GithubMarketplace'
)({
	source: GithubSourceSpec,
	autoUpdate: Schema.optional(Schema.Boolean)
}) {}

export class GenericMarketplace extends Schema.Class<GenericMarketplace>(
	'GenericMarketplace'
)({
	source: MarketplaceSourceSpec,
	autoUpdate: Schema.optional(Schema.Boolean)
}) {}

export const Marketplace = Schema.Union([
	DirectoryMarketplace,
	GithubMarketplace,
	GenericMarketplace
]).annotate({ identifier: 'Marketplace' });

// ---------------------------------------------------------------------------
// API key helper / attribution
// ---------------------------------------------------------------------------

/** @deprecated `apiKeyHelper` is a string script path in current Claude Code. */
export class ApiKeyHelperConfig extends Schema.Class<ApiKeyHelperConfig>(
	'ApiKeyHelperConfig'
)({
	executable: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number)
}) {}

export class AttributionConfig extends Schema.Class<AttributionConfig>(
	'AttributionConfig'
)({
	commit: Schema.optional(Schema.String),
	pr: Schema.optional(Schema.String)
}) {}

export const ApiKeyHelper = Schema.Union([
	Schema.String,
	ApiKeyHelperConfig
]).annotate({ identifier: 'ApiKeyHelper' });

// ---------------------------------------------------------------------------
// Managed MCP / plugin config / worktrees
// ---------------------------------------------------------------------------

export class McpServerPolicyMatcher extends Schema.Class<McpServerPolicyMatcher>(
	'McpServerPolicyMatcher'
)({
	serverUrl: Schema.optional(Schema.String),
	serverCommand: Schema.optional(Schema.String),
	serverName: Schema.optional(Schema.String)
}) {}

export class PluginOptionsConfig extends Schema.Class<PluginOptionsConfig>(
	'PluginOptionsConfig'
)({
	options: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
}) {}

export class WorktreeConfig extends Schema.Class<WorktreeConfig>(
	'WorktreeConfig'
)({
	baseRef: Schema.optional(Schema.String),
	symlinkDirectories: Schema.optional(Schema.Array(Schema.String)),
	sparsePaths: Schema.optional(Schema.Array(Schema.String)),
	bgIsolation: Schema.optional(Schema.Boolean)
}) {}

export class PolicyHelperConfig extends Schema.Class<PolicyHelperConfig>(
	'PolicyHelperConfig'
)({
	path: Schema.String,
	timeoutMs: Schema.optional(Schema.Number),
	refreshIntervalMs: Schema.optional(Schema.Number)
}) {}

export const SettingsRaw = Schema.Record(
	Schema.String,
	Schema.Unknown
).annotate({ identifier: 'SettingsRaw' });

export type SettingsRaw = Schema.Schema.Type<typeof SettingsRaw>;

// ---------------------------------------------------------------------------
// Top-level settings
// ---------------------------------------------------------------------------

/**
 * A Claude Code settings.json file. All fields are optional. Current
 * high-impact keys are modeled explicitly, while `raw` exposes the decoded
 * source object so newer keys are still available to callers before this
 * library grows first-class fields for them.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class SettingsFile extends Schema.Class<SettingsFile>('SettingsFile')({
	/** Raw decoded settings object populated by `Settings.load`. */
	raw: Schema.optional(SettingsRaw),

	$schema: Schema.optional(Schema.String),
	hooks: Schema.optional(HooksSection),
	disableAllHooks: Schema.optional(Schema.Boolean),
	allowManagedHooksOnly: Schema.optional(Schema.Boolean),

	permissions: Schema.optional(PermissionsConfig),
	sandbox: Schema.optional(SandboxConfig),

	model: Schema.optional(Schema.String),
	advisorModel: Schema.optional(Schema.String),
	availableModels: Schema.optional(Schema.Array(Schema.String)),
	enforceAvailableModels: Schema.optional(Schema.Boolean),
	fallbackModel: Schema.optional(Schema.Array(Schema.String)),
	effortLevel: Schema.optional(
		Schema.Literals(['low', 'medium', 'high', 'xhigh'] as const)
	),
	/** @deprecated Use `effortLevel`. */
	effort: Schema.optional(
		Schema.Literals(['low', 'medium', 'high', 'max'] as const)
	),
	alwaysThinkingEnabled: Schema.optional(Schema.Boolean),
	fastMode: Schema.optional(Schema.Boolean),
	fastModePerSessionOptIn: Schema.optional(Schema.Boolean),
	ultracode: Schema.optional(Schema.Boolean),

	outputStyle: Schema.optional(Schema.String),
	statusLine: Schema.optional(StatusLineConfig),
	language: Schema.optional(Schema.String),
	defaultShell: Schema.optional(Schema.String),
	editorMode: Schema.optional(Schema.String),
	viewMode: Schema.optional(Schema.String),

	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	apiKeyHelper: Schema.optional(ApiKeyHelper),
	otelHeadersHelper: Schema.optional(Schema.String),
	awsAuthRefresh: Schema.optional(Schema.String),
	awsCredentialExport: Schema.optional(Schema.String),
	gcpAuthRefresh: Schema.optional(Schema.String),
	forceLoginMethod: Schema.optional(Schema.String),
	forceLoginOrgUUID: Schema.optional(Schema.String),
	policyHelper: Schema.optional(PolicyHelperConfig),

	allowedHttpHookUrls: Schema.optional(Schema.Array(Schema.String)),
	httpHookAllowedEnvVars: Schema.optional(Schema.Array(Schema.String)),

	enabledPlugins: Schema.optional(
		Schema.Record(Schema.String, Schema.Boolean)
	),
	pluginConfigs: Schema.optional(
		Schema.Record(Schema.String, PluginOptionsConfig)
	),
	extraKnownMarketplaces: Schema.optional(
		Schema.Record(Schema.String, Marketplace)
	),
	blockedMarketplaces: Schema.optional(Schema.Array(Schema.String)),
	strictKnownMarketplaces: Schema.optional(Schema.Boolean),
	strictPluginOnlyCustomization: Schema.optional(Schema.Boolean),
	pluginSuggestionMarketplaces: Schema.optional(Schema.Array(Schema.String)),
	pluginTrustMessage: Schema.optional(Schema.String),

	allowedMcpServers: Schema.optional(
		Schema.Array(McpServerPolicyMatcher)
	),
	deniedMcpServers: Schema.optional(
		Schema.Array(McpServerPolicyMatcher)
	),
	allowManagedMcpServersOnly: Schema.optional(Schema.Boolean),
	allowAllClaudeAiMcps: Schema.optional(Schema.Boolean),
	enableAllProjectMcpServers: Schema.optional(Schema.Boolean),
	enabledMcpjsonServers: Schema.optional(Schema.Array(Schema.String)),
	disabledMcpjsonServers: Schema.optional(Schema.Array(Schema.String)),

	attribution: Schema.optional(AttributionConfig),
	/** @deprecated Use `attribution`. */
	includeCoAuthoredBy: Schema.optional(Schema.Boolean),
	cleanupPeriodDays: Schema.optional(Schema.Number),
	plansDirectory: Schema.optional(Schema.String),
	autoMemoryEnabled: Schema.optional(Schema.Boolean),
	autoMemoryDirectory: Schema.optional(Schema.String),
	skillOverrides: Schema.optional(
		Schema.Record(Schema.String, Schema.Unknown)
	),
	disableSkillShellExecution: Schema.optional(Schema.Boolean),
	disableBundledSkills: Schema.optional(Schema.Boolean),
	maxSkillDescriptionChars: Schema.optional(Schema.Number),
	skillListingBudgetFraction: Schema.optional(Schema.Number),

	agent: Schema.optional(Schema.String),
	worktree: Schema.optional(WorktreeConfig),
	voice: Schema.optional(Schema.String),
	voiceEnabled: Schema.optional(Schema.Boolean),
	spinnerTipsEnabled: Schema.optional(Schema.Boolean),
	spinnerTipsOverride: Schema.optional(Schema.Array(Schema.String)),
	spinnerVerbs: Schema.optional(Schema.Array(Schema.String)),
	wheelScrollAccelerationEnabled: Schema.optional(Schema.Boolean),
	awaySummaryEnabled: Schema.optional(Schema.Boolean),
	autoScrollEnabled: Schema.optional(Schema.Boolean),
	prefersReducedMotion: Schema.optional(Schema.Boolean),
	terminalProgressBarEnabled: Schema.optional(Schema.Boolean),
	syntaxHighlightingDisabled: Schema.optional(Schema.Boolean),
	showThinkingSummaries: Schema.optional(Schema.Boolean),
	showTurnDuration: Schema.optional(Schema.Boolean),
	companyAnnouncements: Schema.optional(Schema.Array(Schema.String)),

	/** @deprecated MCP servers live in `.mcp.json` and `~/.claude.json`. */
	mcpServers: Schema.optional(Schema.Record(Schema.String, McpServerEntry)),
	/** @deprecated Not a current settings.json key. */
	theme: Schema.optional(Schema.String)
}) {}
