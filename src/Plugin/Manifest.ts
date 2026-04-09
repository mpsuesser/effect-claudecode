/**
 * Schema for `.claude-plugin/plugin.json` — Claude Code plugin manifests.
 *
 * The manifest is technically optional (if omitted, Claude Code
 * auto-discovers components in default locations), but when present it
 * must at minimum carry a `name`. Component path fields like `commands`
 * and `agents` accept either a single path string or an array of path
 * strings. `hooks`, `mcpServers`, and `lspServers` additionally accept
 * inline record objects.
 *
 * See https://docs.claude.com/en/docs/claude-code/plugins-reference for
 * the authoritative spec.
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import { HooksSection } from '../Settings/HooksSection.ts';

// ---------------------------------------------------------------------------
// Author / owner
// ---------------------------------------------------------------------------

/**
 * Author or owner metadata. The `name` field is required; `email` and
 * `url` are optional. The same shape is reused for `owner` in
 * marketplace files.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class AuthorInfo extends Schema.Class<AuthorInfo>('AuthorInfo')({
	name: Schema.String,
	email: Schema.optional(Schema.String),
	url: Schema.optional(Schema.String)
}) {}

// ---------------------------------------------------------------------------
// Component path unions
// ---------------------------------------------------------------------------

/**
 * `commands`, `agents`, `skills`, and `outputStyles` accept either a
 * single path string or an array of path strings.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const ComponentPathSpec = Schema.Union([
	Schema.String,
	Schema.Array(Schema.String)
]).annotate({ identifier: 'ComponentPathSpec' });

export type ComponentPathSpec = Schema.Schema.Type<typeof ComponentPathSpec>;

/**
 * `hooks` accepts a path string, an array of path strings, or an
 * inline `HooksSection` object.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const HooksSpec = Schema.Union([
	Schema.String,
	Schema.Array(Schema.String),
	HooksSection
]).annotate({ identifier: 'HooksSpec' });

export type HooksSpec = Schema.Schema.Type<typeof HooksSpec>;

/**
 * `mcpServers` and `lspServers` accept a path string, an array of path
 * strings, or an inline record. The record values are intentionally
 * loose (`Schema.Unknown`) since the strict MCP schema lives in
 * `src/Mcp/` and we don't want Plugin to depend on it.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const ServerConfigSpec = Schema.Union([
	Schema.String,
	Schema.Array(Schema.String),
	Schema.Record(Schema.String, Schema.Unknown)
]).annotate({ identifier: 'ServerConfigSpec' });

export type ServerConfigSpec = Schema.Schema.Type<typeof ServerConfigSpec>;

// ---------------------------------------------------------------------------
// userConfig
// ---------------------------------------------------------------------------

/**
 * A single entry in the `userConfig` record. Claude Code prompts the
 * user for these values when the plugin is enabled. Sensitive values
 * go to the system keychain; non-sensitive values go to settings.json.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class UserConfigEntry extends Schema.Class<UserConfigEntry>(
	'UserConfigEntry'
)({
	description: Schema.optional(Schema.String),
	sensitive: Schema.optional(Schema.Boolean)
}) {}

/**
 * The `userConfig` field — a record from identifier keys to
 * `UserConfigEntry` values.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const UserConfigRecord = Schema.Record(
	Schema.String,
	UserConfigEntry
).annotate({ identifier: 'UserConfigRecord' });

export type UserConfigRecord = Schema.Schema.Type<typeof UserConfigRecord>;

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/**
 * A message channel spec. The `server` must match a key in
 * `mcpServers`. The optional per-channel `userConfig` uses the same
 * shape as the top-level `userConfig`.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class ChannelSpec extends Schema.Class<ChannelSpec>('ChannelSpec')({
	server: Schema.String,
	userConfig: Schema.optional(UserConfigRecord)
}) {}

// ---------------------------------------------------------------------------
// Plugin manifest
// ---------------------------------------------------------------------------

/**
 * A Claude Code plugin manifest. Only `name` is required; everything
 * else is optional. The `name` is used for namespacing components
 * (e.g. `plugin-name:agent-name`).
 *
 * @category Schemas
 * @since 0.1.0
 */
export class PluginManifest extends Schema.Class<PluginManifest>(
	'PluginManifest'
)({
	// Required
	name: Schema.String,

	// Metadata
	version: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
	author: Schema.optional(AuthorInfo),
	homepage: Schema.optional(Schema.String),
	repository: Schema.optional(Schema.String),
	license: Schema.optional(Schema.String),
	keywords: Schema.optional(Schema.Array(Schema.String)),

	// Component path fields
	commands: Schema.optional(ComponentPathSpec),
	agents: Schema.optional(ComponentPathSpec),
	skills: Schema.optional(ComponentPathSpec),
	outputStyles: Schema.optional(ComponentPathSpec),

	// Hook/MCP/LSP — paths or inline
	hooks: Schema.optional(HooksSpec),
	mcpServers: Schema.optional(ServerConfigSpec),
	lspServers: Schema.optional(ServerConfigSpec),

	// User-facing configuration
	userConfig: Schema.optional(UserConfigRecord),
	channels: Schema.optional(Schema.Array(ChannelSpec))
}) {}
