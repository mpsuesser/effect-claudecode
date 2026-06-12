/**
 * Schema for `.claude-plugin/marketplace.json` — the plugin catalog
 * file that lists one or more plugins alongside their source specs.
 *
 * A marketplace is identified by name, has an owner, and declares an
 * array of plugin entries. Each entry declares how to locate the
 * plugin's source (a relative path string, GitHub, URL, git subdir,
 * npm, or legacy directory object).
 *
 * @since 0.1.0
 */
import * as Schema from 'effect/Schema';

import {
	AuthorInfo,
	ComponentPathSpec,
	HooksSpec,
	ServerConfigSpec
} from './Manifest.ts';

// ---------------------------------------------------------------------------
// Plugin source spec
// ---------------------------------------------------------------------------

/**
 * Legacy directory-based plugin source. Prefer relative path strings.
 *
 * @category Schemas
 * @since 0.1.0
 * @deprecated Current marketplace entries use relative path strings.
 */
export class DirectoryPluginSource extends Schema.Class<DirectoryPluginSource>(
	'DirectoryPluginSource'
)({
	source: Schema.Literal('directory'),
	path: Schema.String
}) {}

/**
 * A GitHub-based plugin source. The `repo` is the `owner/name` pair.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class GithubPluginSource extends Schema.Class<GithubPluginSource>(
	'GithubPluginSource'
)({
	source: Schema.Literal('github'),
	repo: Schema.String,
	ref: Schema.optional(Schema.String),
	sha: Schema.optional(Schema.String),
	skipLfs: Schema.optional(Schema.Boolean)
}) {}

export class UrlPluginSource extends Schema.Class<UrlPluginSource>(
	'UrlPluginSource'
)({
	source: Schema.Literal('url'),
	url: Schema.String,
	ref: Schema.optional(Schema.String),
	sha: Schema.optional(Schema.String),
	skipLfs: Schema.optional(Schema.Boolean)
}) {}

export class GitSubdirPluginSource extends Schema.Class<GitSubdirPluginSource>(
	'GitSubdirPluginSource'
)({
	source: Schema.Literal('git-subdir'),
	url: Schema.String,
	path: Schema.String,
	ref: Schema.optional(Schema.String),
	sha: Schema.optional(Schema.String),
	skipLfs: Schema.optional(Schema.Boolean)
}) {}

export class NpmPluginSource extends Schema.Class<NpmPluginSource>(
	'NpmPluginSource'
)({
	source: Schema.Literal('npm'),
	package: Schema.String,
	version: Schema.optional(Schema.String),
	registry: Schema.optional(Schema.String)
}) {}

/**
 * The `source` field on a marketplace entry. Accepts either a raw
 * relative path string or a structured source object.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const MarketplacePluginSourceSpec = Schema.Union([
	Schema.String,
	DirectoryPluginSource,
	GithubPluginSource,
	UrlPluginSource,
	GitSubdirPluginSource,
	NpmPluginSource
]).annotate({ identifier: 'MarketplacePluginSourceSpec' });

export type MarketplacePluginSourceSpec = Schema.Schema.Type<
	typeof MarketplacePluginSourceSpec
>;

// ---------------------------------------------------------------------------
// Marketplace plugin entry
// ---------------------------------------------------------------------------

/**
 * A single plugin entry inside a marketplace.json file. `name` and
 * `source` are required; every other field is informational and may
 * override or supplement what the plugin's own `plugin.json` declares.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class MarketplacePluginEntry extends Schema.Class<MarketplacePluginEntry>(
	'MarketplacePluginEntry'
)({
	name: Schema.String,
	source: MarketplacePluginSourceSpec,
	description: Schema.optional(Schema.String),
	displayName: Schema.optional(Schema.String),
	category: Schema.optional(Schema.String),
	tags: Schema.optional(Schema.Array(Schema.String)),
	defaultEnabled: Schema.optional(Schema.Boolean),
	version: Schema.optional(Schema.String),
	author: Schema.optional(AuthorInfo),
	homepage: Schema.optional(Schema.String),
	repository: Schema.optional(Schema.String),
	license: Schema.optional(Schema.String),
	keywords: Schema.optional(Schema.Array(Schema.String)),
	commands: Schema.optional(ComponentPathSpec),
	agents: Schema.optional(ComponentPathSpec),
	skills: Schema.optional(ComponentPathSpec),
	outputStyles: Schema.optional(ComponentPathSpec),
	hooks: Schema.optional(HooksSpec),
	mcpServers: Schema.optional(ServerConfigSpec),
	lspServers: Schema.optional(ServerConfigSpec),
	strict: Schema.optional(Schema.Boolean)
}) {}

// ---------------------------------------------------------------------------
// Marketplace file
// ---------------------------------------------------------------------------

export class MarketplaceMetadata extends Schema.Class<MarketplaceMetadata>(
	'MarketplaceMetadata'
)({
	pluginRoot: Schema.optional(Schema.String)
}) {}

/**
 * The full `.claude-plugin/marketplace.json` file. Lists a bundle of
 * plugins under a shared name and owner.
 *
 * @category Schemas
 * @since 0.1.0
 */
export class MarketplaceFile extends Schema.Class<MarketplaceFile>(
	'MarketplaceFile'
)({
	$schema: Schema.optional(Schema.String),
	name: Schema.String,
	version: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
	owner: AuthorInfo,
	metadata: Schema.optional(MarketplaceMetadata),
	allowCrossMarketplaceDependenciesOn: Schema.optional(
		Schema.Array(Schema.String)
	),
	plugins: Schema.Array(MarketplacePluginEntry)
}) {}
