/**
 * Plugin module hub — schemas and materializer for Claude Code plugin
 * manifests, marketplaces, and directory layouts.
 *
 * Users import this as a namespace:
 * `import { Plugin } from 'effect-claudecode'`
 * and access members as `Plugin.define`, `Plugin.write`,
 * `Plugin.PluginManifest`, etc.
 *
 * @since 0.1.0
 */

// ---------------------------------------------------------------------------
// Manifest schemas
// ---------------------------------------------------------------------------

export {
	AuthorInfo,
	ChannelSpec,
	ComponentPathSpec,
	HooksSpec,
	PluginManifest,
	ServerConfigSpec,
	UserConfigEntry,
	UserConfigRecord
} from './Plugin/Manifest.ts';

// ---------------------------------------------------------------------------
// Marketplace schemas
// ---------------------------------------------------------------------------

export {
	DirectoryPluginSource,
	GithubPluginSource,
	MarketplaceFile,
	MarketplacePluginEntry,
	MarketplacePluginSourceSpec
} from './Plugin/Marketplace.ts';

// ---------------------------------------------------------------------------
// Builder + writer
// ---------------------------------------------------------------------------

export {
	agent,
	command,
	define,
	outputStyle,
	skill,
	write
} from './Plugin/Define.ts';
export type {
	PluginAgentConfig,
	PluginAgentEntry,
	PluginConfig,
	PluginCommandConfig,
	PluginCommandEntry,
	PluginDefinition,
	PluginManifestInput,
	PluginOutputStyleConfig,
	PluginOutputStyleEntry,
	PluginSkillConfig,
	PluginSkillEntry
} from './Plugin/Define.ts';
