/**
 * Internal helpers for plugin layout and manifest path normalization.
 *
 * @since 0.1.0
 */
import type { PluginDefinition } from './Define.ts';
import * as Option from 'effect/Option';

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
	spec: Option.Option<ComponentPathSpec>,
	hasEntries: boolean,
	key: ComponentKey
): Option.Option<ComponentPathSpec> => {
	if (!hasEntries) {
		return Option.none();
	}
	return Option.some(
		Option.getOrElse(spec, () => canonicalComponentPaths[key])
	);
};

const keepOrDefaultHooksSpec = (
	spec: Option.Option<HooksSpec>,
	hasConfig: boolean
): Option.Option<HooksSpec> =>
	Option.match(spec, {
		onNone: () =>
			hasConfig ? Option.some('hooks/hooks.json') : Option.none(),
		onSome: (specValue) => {
			if (typeof specValue !== 'string' && !Array.isArray(specValue)) {
				return Option.some(specValue);
			}
			if (!hasConfig) {
				return Option.none();
			}
			if (Array.isArray(specValue) && specValue.length > 1) {
				return Option.some('hooks/hooks.json');
			}
			return Option.some(specValue);
		}
	});

const keepOrDefaultServerSpec = (
	spec: Option.Option<ServerConfigSpec>,
	hasConfig: boolean,
	fallback: string
): Option.Option<ServerConfigSpec> =>
	Option.match(spec, {
		onNone: () =>
			hasConfig ? Option.some(fallback) : Option.none(),
		onSome: (specValue) => {
			if (typeof specValue !== 'string' && !Array.isArray(specValue)) {
				return Option.some(specValue);
			}
			if (!hasConfig) {
				return Option.none();
			}
			if (Array.isArray(specValue) && specValue.length > 1) {
				return Option.some(fallback);
			}
			return Option.some(specValue);
		}
	});

/** @internal */
export const pathSpecs = (
	spec: Option.Option<string | ReadonlyArray<string>>
): ReadonlyArray<string> =>
	Option.match(spec, {
		onNone: () => [],
		onSome: (specValue) =>
			typeof specValue === 'string' ? [specValue] : specValue
	});

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
		$schema: definition.manifest.$schema,
		version: definition.manifest.version,
		description: definition.manifest.description,
		displayName: definition.manifest.displayName,
		defaultEnabled: definition.manifest.defaultEnabled,
		author: definition.manifest.author,
		homepage: definition.manifest.homepage,
		repository: definition.manifest.repository,
		license: definition.manifest.license,
		keywords: definition.manifest.keywords,
		dependencies: definition.manifest.dependencies,
		experimental: definition.manifest.experimental,
		userConfig: definition.manifest.userConfig,
		channels: definition.manifest.channels,
		commands: Option.getOrUndefined(
			keepOrDefaultComponentSpec(
				Option.fromNullishOr(definition.manifest.commands),
				definition.commands.length > 0,
				'commands'
			)
		),
		agents: Option.getOrUndefined(
			keepOrDefaultComponentSpec(
				Option.fromNullishOr(definition.manifest.agents),
				definition.agents.length > 0,
				'agents'
			)
		),
		skills: Option.getOrUndefined(
			keepOrDefaultComponentSpec(
				Option.fromNullishOr(definition.manifest.skills),
				definition.skills.length > 0,
				'skills'
			)
		),
		outputStyles: Option.getOrUndefined(
			keepOrDefaultComponentSpec(
				Option.fromNullishOr(definition.manifest.outputStyles),
				definition.outputStyles.length > 0,
				'outputStyles'
			)
		),
		hooks: Option.getOrUndefined(
			keepOrDefaultHooksSpec(
				Option.fromNullishOr(definition.manifest.hooks),
				Option.isSome(definition.hooksConfig)
			)
		),
		mcpServers: Option.getOrUndefined(
			keepOrDefaultServerSpec(
				Option.fromNullishOr(definition.manifest.mcpServers),
				Option.isSome(definition.mcpConfig),
				'.mcp.json'
			)
		),
		lspServers: definition.manifest.lspServers
	});
