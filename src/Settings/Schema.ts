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
// Status line
// ---------------------------------------------------------------------------

export class StatusLineConfig extends Schema.Class<StatusLineConfig>(
	'StatusLineConfig'
)({
	type: Schema.Literals(['command', 'disabled'] as const),
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
// Top-level settings
// ---------------------------------------------------------------------------

/**
 * A Claude Code settings.json file. All fields are optional; individual
 * events' `mcpServers` are kept loose (`Schema.Unknown`) here — the
 * stricter schema lives in `src/Mcp/` so Settings doesn't have to take
 * an MCP dependency.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class SettingsFile extends Schema.Class<SettingsFile>('SettingsFile')({
	hooks: Schema.optional(HooksSection),
	disableAllHooks: Schema.optional(Schema.Boolean),

	permissions: Schema.optional(PermissionsConfig),

	model: Schema.optional(Schema.String),
	effortLevel: Schema.optional(
		Schema.Literals(['low', 'medium', 'high', 'xhigh'] as const)
	),
	/** @deprecated Use `effortLevel`. */
	effort: Schema.optional(
		Schema.Literals(['low', 'medium', 'high', 'max'] as const)
	),
	fastMode: Schema.optional(Schema.Boolean),
	fastModePerSessionOptIn: Schema.optional(Schema.Boolean),

	outputStyle: Schema.optional(Schema.String),
	theme: Schema.optional(Schema.String),
	statusLine: Schema.optional(StatusLineConfig),

	mcpServers: Schema.optional(
		Schema.Record(Schema.String, McpServerEntry)
	),

	env: Schema.optional(Schema.Record(Schema.String, Schema.String)),

	disableSkillShellExecution: Schema.optional(Schema.Boolean),

	enabledPlugins: Schema.optional(
		Schema.Record(Schema.String, Schema.Boolean)
	),
	extraKnownMarketplaces: Schema.optional(
		Schema.Record(Schema.String, Marketplace)
	),

	attribution: Schema.optional(AttributionConfig),
	/** @deprecated Use `attribution`. */
	includeCoAuthoredBy: Schema.optional(Schema.Boolean),
	cleanupPeriodDays: Schema.optional(Schema.Number),

	apiKeyHelper: Schema.optional(ApiKeyHelper),
	allowedHttpHookUrls: Schema.optional(Schema.Array(Schema.String)),
	httpHookAllowedEnvVars: Schema.optional(Schema.Array(Schema.String)),

	agent: Schema.optional(Schema.String)
}) {}
