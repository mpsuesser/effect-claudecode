/**
 * Internal helpers for plugin layout and manifest path normalization.
 *
 * @since 0.1.0
 */
import type { PluginDefinition } from './Define.ts';
import {
	type ComponentPathSpec,
	type HooksSpec,
	PluginManifest,
	type ServerConfigSpec
} from './Manifest.ts';

const canonicalComponentPaths = {
	commands: 'commands',
	agents: 'agents',
	skills: 'skills',
	outputStyles: 'output-styles'
} as const;

type ComponentKey = keyof typeof canonicalComponentPaths;

const keepOrDefaultComponentSpec = (
	spec: ComponentPathSpec | undefined,
	hasEntries: boolean,
	key: ComponentKey
): ComponentPathSpec | undefined => {
	if (!hasEntries) {
		return undefined;
	}
	return spec ?? canonicalComponentPaths[key];
};

const keepOrDefaultHooksSpec = (
	spec: HooksSpec | undefined,
	hasConfig: boolean
): HooksSpec | undefined => {
	if (!hasConfig) {
		return undefined;
	}
	if (Array.isArray(spec) && spec.length > 1) {
		return 'hooks/hooks.json';
	}
	return spec ?? 'hooks/hooks.json';
};

const keepOrDefaultServerSpec = (
	spec: ServerConfigSpec | undefined,
	hasConfig: boolean,
	fallback: string
): ServerConfigSpec | undefined => {
	if (!hasConfig) {
		return undefined;
	}
	if (Array.isArray(spec) && spec.length > 1) {
		return fallback;
	}
	return spec ?? fallback;
};

/** @internal */
export const pathSpecs = (
	spec: string | ReadonlyArray<string> | undefined
): ReadonlyArray<string> =>
	spec === undefined ? [] : typeof spec === 'string' ? [spec] : spec;

/** @internal */
export const isMarkdownFilePath = (path: string): boolean =>
	path.endsWith('.md');

/** @internal */
export const isJsonFilePath = (path: string): boolean =>
	path.endsWith('.json');

/** @internal */
export const isSkillFilePath = (path: string): boolean =>
	/(^|\/)SKILL\.md$/.test(path);

/** @internal */
export const syncManifest = (definition: PluginDefinition): PluginManifest =>
	new PluginManifest({
		name: definition.manifest.name,
		version: definition.manifest.version,
		description: definition.manifest.description,
		author: definition.manifest.author,
		homepage: definition.manifest.homepage,
		repository: definition.manifest.repository,
		license: definition.manifest.license,
		keywords: definition.manifest.keywords,
		userConfig: definition.manifest.userConfig,
		channels: definition.manifest.channels,
		commands: keepOrDefaultComponentSpec(
			definition.manifest.commands,
			definition.commands.length > 0,
			'commands'
		),
		agents: keepOrDefaultComponentSpec(
			definition.manifest.agents,
			definition.agents.length > 0,
			'agents'
		),
		skills: keepOrDefaultComponentSpec(
			definition.manifest.skills,
			definition.skills.length > 0,
			'skills'
		),
		outputStyles: keepOrDefaultComponentSpec(
			definition.manifest.outputStyles,
			definition.outputStyles.length > 0,
			'outputStyles'
		),
		hooks: keepOrDefaultHooksSpec(
			definition.manifest.hooks,
			definition.hooksConfig._tag === 'Some'
		),
		mcpServers: keepOrDefaultServerSpec(
			definition.manifest.mcpServers,
			definition.mcpConfig._tag === 'Some',
			'.mcp.json'
		),
		lspServers: definition.manifest.lspServers
	});
