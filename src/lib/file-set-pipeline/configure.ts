import {Configuration} from '../configuration.js';
import {Settings} from './index.js';

export interface Context {
	configuration: Configuration;
}

/**
 * @param {Context} context
 * @param {Settings} settings
 */
export function configure(context: Context, settings: Settings): void {
	context.configuration = new Configuration(settings);
}
