import { Buffer } from 'node:buffer';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import createDebug from 'debug';
import { fault } from 'fault';
import isPlainObject from 'is-plain-obj';
import jsYaml from 'js-yaml';
import { resolvePlugin } from 'load-plugin';
import parseJson from 'parse-json';
import type { PluggableList, Plugin, PluginTuple } from 'unified';
import { FindUp } from './find-up.js';
/**
 * @typedef Options
 * @property {string} cwd
 * @property {string} [packageField]
 * @property {string} [pluginPrefix]
 * @property {string} [rcName]
 * @property {string} [rcPath]
 * @property {boolean} [detectConfig]
 * @property {ConfigTransform} [configTransform]
 * @property {Preset} [defaultConfig]
 * @property {Preset['settings']} [settings]
 * @property {Preset['plugins']} [plugins]
 */
import type { Options as MainOptions } from './index';

export type Settings = Record<string, unknown>;
export type PluginIdObject = Record<string, Settings | null | undefined>;
export type PluginIdList = Array<string | [string, ...unknown[]]>;

export interface Config {
	settings?: Settings;
	plugins?: Array<PluginTuple<unknown[]>>;
}
export interface Preset {
	settings?: Settings;
	plugins?: PluggableList | PluginIdObject | PluginIdList | undefined;
}

export function isPreset(value: unknown): value is Preset {
	if (isPlainObject(value)) {
		if (!(value.settings && isPlainObject(value.settings))) {
			return false;
		}

		if (!value.plugins) {
			return false;
		}

		return true;
	}

	return false;
}

export type ConfigTransform = (config: unknown, filePath: string) => Preset;
export type Loader = (
	buf: Buffer,
	filePath: string,
) => Promise<Preset | undefined>;
export type Callback = (error: Error | null, result?: Config) => void;

const debug = createDebug('unified-engine:configuration');

const own = {}.hasOwnProperty;

const loaders: Record<string, Loader> = {
	'.json': loadJson,
	'.cjs': loadScriptOrModule,
	'.mjs': loadScriptOrModule,
	'.js': loadScriptOrModule,
	'.yaml': loadYaml,
	'.yml': loadYaml,
};

const defaultLoader = loadJson;

export interface Options
	extends Pick<
		MainOptions,
		| 'packageField'
		| 'pluginPrefix'
		| 'rcName'
		| 'rcPath'
		| 'detectConfig'
		| 'configTransform'
		| 'defaultConfig'
		| 'settings'
		| 'plugins'
	> {
	cwd: string;
}

export class Configuration {
	cwd: string;
	packageField: string | undefined;
	pluginPrefix: string | undefined;
	configTransform: ConfigTransform | undefined;
	defaultConfig: Preset | undefined;
	given: Preset;
	findUp: FindUp<Config>;

	constructor(options: Options) {
		const names: string[] = [];
		this.cwd = options.cwd;
		this.packageField = options.packageField;
		this.pluginPrefix = options.pluginPrefix;
		this.configTransform = options.configTransform;
		this.defaultConfig = options.defaultConfig;

		if (options.rcName) {
			names.push(
				options.rcName,
				...Object.keys(loaders).map((d) =>
					options.rcName ? options.rcName + d : d,
				),
			);
			debug('Looking for `%s` configuration files', names);
		}

		if (options.packageField) {
			names.push('package.json');
			debug(
				'Looking for `%s` fields in `package.json` files',
				options.packageField,
			);
		}

		this.given = { settings: options.settings, plugins: options.plugins };

		this.findUp = new FindUp<Config>({
			cwd: options.cwd,
			filePath: options.rcPath,
			detect: options.detectConfig,
			names,
			create: this.create,
		});
	}

	load(filePath: string, callback: Callback): void {
		this.findUp.load(
			filePath || path.resolve(this.cwd, 'stdin.js'),
			(error, file) => {
				if (error || file) {
					callback(error, file);
					return;
				}

				this.create(undefined, undefined).then((result) => {
					callback(null, result);
				}, callback);
			},
		);
	}

	async create(
		buf?: Buffer | undefined,
		filePath?: string | undefined,
	): Promise<Config | undefined> {
		const options = { prefix: this.pluginPrefix, cwd: this.cwd };
		const result: Required<Config> = { settings: {}, plugins: [] };
		const extname = filePath ? path.extname(filePath) : undefined;
		const loader =
			extname && extname in loaders ? loaders[extname] : defaultLoader;
		let value: Preset | undefined;

		if (filePath && buf) {
			value = await loader.call(this, buf, filePath);

			if (this.configTransform && value !== undefined) {
				value = this.configTransform(value, filePath);
			}
		}

		// Exit if we did find a `package.json`, but it does not have configuration.
		if (
			filePath &&
			value === undefined &&
			path.basename(filePath) === 'package.json'
		) {
			return;
		}

		if (!filePath) {
			return;
		}

		if (value === undefined) {
			if (this.defaultConfig) {
				await merge(
					result,
					this.defaultConfig,
					Object.assign({}, options, { root: this.cwd }),
				);
			}
		} else {
			await merge(
				result,
				value,
				Object.assign({}, options, { root: path.dirname(filePath) }),
			);
		}

		await merge(
			result,
			this.given,
			Object.assign({}, options, { root: this.cwd }),
		);

		// C8 bug on Node@12
		/* c8 ignore next 2 */
		return result;
	}
}

async function loadScriptOrModule(
	_: Buffer,
	filePath: string,
): Promise<Preset | undefined> {
	// C8 bug on Node@12
	/* c8 ignore next 4 */
	// @ts-expect-error: Assume it matches config.
	// type-coverage:ignore-next-line
	return loadFromAbsolutePath(filePath, this.cwd);
}

async function loadYaml(
	buf: Buffer,
	filePath: string,
): Promise<Preset | undefined> {
	// C8 bug on Node@12
	/* c8 ignore next 4 */
	const yaml = jsYaml.load(String(buf), {
		filename: path.basename(filePath),
	});
	if (yaml && isPreset(yaml)) {
		return yaml;
	}
}

/** @type {Loader} */
async function loadJson(
	this: { packageField: string },
	buf: Buffer,
	filePath: string,
): Promise<Preset | undefined> {
	const data = parseJson(String(buf), filePath) as unknown;

	if (!isPlainObject(data)) {
		throw new Error('loadJson expected to load a plain object.');
	}

	const result: Record<string, unknown> = data;

	// C8 bug on Node@12
	/* c8 ignore next 8 */
	const json: unknown =
		path.basename(filePath) === 'package.json'
			? result[this.packageField]
			: result;

	if (json && isPreset(json)) {
		return json;
	}
}

async function merge(
	target: Required<Config>,
	raw: Preset,
	options: { root: string; prefix: string | undefined },
): Promise<Config> {
	if (typeof raw === 'object' && raw !== null) {
		await addPreset(raw);
	} else {
		throw new Error(`Expected preset,got something else (unexpected)`);
	}

	// C8 bug on Node@12
	/* c8 ignore next 6 */
	return target;

	/**
	 * @param {Preset} result
	 */
	async function addPreset(result: Preset): Promise<void> {
		const plugins:
			| PluggableList
			| PluginIdObject
			| PluginIdList
			| undefined = result.plugins;

		if (plugins === null || plugins === undefined) {
			// Empty.
		} else if (typeof plugins === 'object' && plugins !== null) {
			await (Array.isArray(plugins) ? addEach(plugins) : addIn(plugins));
		} else {
			throw new Error(
				`Expected a list or object of plugins, got something else (unexpected)`,
			);
		}

		target.settings = Object.assign({}, target.settings, result.settings);
		// C8 bug on Node@12
		/* c8 ignore next 6 */
	}

	/**
	 * @param {PluginIdList|PluggableList} result
	 */
	async function addEach(result: PluginIdList | PluggableList) {
		let index = -1;

		while (++index < result.length) {
			const value = result[index];

			// Keep order sequential instead of parallel.
			/* eslint-disable no-await-in-loop */
			// type-coverage:ignore-next-line
			await (Array.isArray(value)
				? // @ts-expect-error: Spreading is fine.
				  use(...value)
				: use(value, undefined));
			/* eslint-enable no-await-in-loop */
		}
		// C8 bug on Node@12
		/* c8 ignore next 6 */
	}

	/**
	 * @param {PluginIdObject} result
	 */
	async function addIn(result: PluginIdObject) {
		let key: string;

		for (key in result) {
			if (own.call(result, key)) {
				// Keep order sequential instead of parallel.
				// eslint-disable-next-line no-await-in-loop
				await use(key, result[key]);
			}
		}
		// C8 bug on Node@12
		/* c8 ignore next 7 */
	}

	/**
	 * @param {string|Plugin|Preset} usable
	 * @param {Settings|null|undefined} value
	 */
	async function use(
		usable: string | Plugin | Preset,
		value: Settings | null | undefined,
	) {
		if (typeof usable === 'string') {
			await addModule(usable, value);
		} else if (typeof usable === 'function') {
			addPlugin(usable, value);
		} else {
			await merge(target, usable, options);
		}
		// C8 bug on Node@12
		/* c8 ignore next 7 */
	}

	/**
	 * @param {string} id
	 * @param {Settings|null|undefined} value
	 */
	async function addModule(id: string, value: Settings | null | undefined) {
		let fp: string;

		try {
			fp = await resolvePlugin(id, {
				cwd: options.root,
				prefix: options.prefix,
			});
		} catch (error: unknown) {
			const exception: Error = error as Error;
			addPlugin(() => {
				throw fault(
					'Could not find module `%s`\n%s',
					id,
					exception.stack,
				);
			}, value);
			return;
		}

		const result = await loadFromAbsolutePath(fp, options.root);

		try {
			if (typeof result === 'function') {
				addPlugin(result, value);
			} else {
				await merge(
					target,
					result,
					Object.assign({}, options, { root: path.dirname(fp) }),
				);
			}
		} catch {
			throw fault(
				'Error: Expected preset or plugin, not %s, at `%s`',
				result,
				path.relative(options.root, fp),
			);
		}
		// C8 bug on Node@12
		/* c8 ignore next 8 */
	}

	/**
	 * @param {Plugin} plugin
	 * @param {Settings|null|undefined} value
	 * @returns {void}
	 */
	function addPlugin(
		plugin: Plugin,
		value: Settings | null | undefined,
	): void {
		const entry: PluginTuple | undefined = find(target.plugins, plugin);

		if (value === null) {
			value = undefined;
		}

		if (entry) {
			reconfigure(entry, value);
		} else {
			target.plugins.push([plugin, value]);
		}
	}
}

/**
 * @param {PluginTuple} entry
 * @param {Settings|undefined} value
 * @returns {void}
 */
function reconfigure(
	entry: PluginTuple<unknown[]>,
	value: Settings | undefined,
): void {
	if (isPlainObject(entry[1]) && isPlainObject(value)) {
		value = Object.assign({}, entry[1], value);
	}

	entry[1] = value;
}

function find(
	entries: Array<PluginTuple<unknown[]>>,
	plugin: Plugin,
): PluginTuple<unknown[]> | undefined {
	let index = -1;

	while (++index < entries.length) {
		const entry = entries[index];
		if (entry[0] === plugin) {
			return entry;
		}
	}
}

async function loadFromAbsolutePath(
	fp: string,
	base: string,
): Promise<Plugin | Preset> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const result: { default?: Plugin | Preset } = await import(
			pathToFileURL(fp).href
		);

		if (!result.default) {
			throw new Error(
				'Expected a plugin or preset exported as the default export',
			);
		}

		return result.default;
		// C8 bug on Node@12
		/* c8 ignore next 9 */
	} catch (error: unknown) {
		const exception: Error = error as Error;
		throw fault(
			'Cannot import `%s`\n%s',
			path.relative(base, fp),
			exception.stack,
		);
	}
}
