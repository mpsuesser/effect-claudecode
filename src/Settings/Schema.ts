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
	mode: Schema.optional(PermissionMode),
	allow: Schema.optional(Schema.Array(Schema.String)),
	ask: Schema.optional(Schema.Array(Schema.String)),
	deny: Schema.optional(Schema.Array(Schema.String)),
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
	padding: Schema.optional(Schema.Number)
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
	ref: Schema.optional(Schema.String)
}) {}

export class DirectoryMarketplace extends Schema.Class<DirectoryMarketplace>(
	'DirectoryMarketplace'
)({
	source: DirectorySourceSpec
}) {}

export class GithubMarketplace extends Schema.Class<GithubMarketplace>(
	'GithubMarketplace'
)({
	source: GithubSourceSpec
}) {}

export const Marketplace = Schema.Union([
	DirectoryMarketplace,
	GithubMarketplace
]).annotate({ identifier: 'Marketplace' });

// ---------------------------------------------------------------------------
// API key helper
// ---------------------------------------------------------------------------

export class ApiKeyHelperConfig extends Schema.Class<ApiKeyHelperConfig>(
	'ApiKeyHelperConfig'
)({
	executable: Schema.optional(Schema.String),
	timeout: Schema.optional(Schema.Number)
}) {}

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
	effort: Schema.optional(
		Schema.Literals(['low', 'medium', 'high', 'max'] as const)
	),
	fastMode: Schema.optional(Schema.Boolean),

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

	includeCoAuthoredBy: Schema.optional(Schema.Boolean),
	cleanupPeriodDays: Schema.optional(Schema.Number),

	apiKeyHelper: Schema.optional(ApiKeyHelperConfig),

	agent: Schema.optional(Schema.String)
}) {}
