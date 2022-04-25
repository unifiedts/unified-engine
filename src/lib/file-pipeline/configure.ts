import createDebug, {Debugger} from 'debug';
import isEmpty from 'is-empty';
import {Callback} from 'trough';
import {VFile} from 'vfile';
import {statistics} from 'vfile-statistics';
import type {Context} from './index';

const debug: Debugger = createDebug('unified-engine:file-pipeline:configure');

/**
 * Collect configuration for a file based on the context.
 *
 * @param {Context} context
 * @param {VFile} file
 * @param {Callback} next
 */
export function configure(context: Context, file: VFile, next: Callback) {
	if (statistics(file).fatal) {
		next();
		return;
	}

	context.configuration.load(file.path, (error, configuration) => {
		let index = -1;

		if (!configuration) {
			next(error);
			return;
		}

		// Could be missing if a `configTransform` returns weird things.
		/* c8 ignore next 1 */
		const plugins = configuration.plugins ?? [];

		// Store configuration on the context object.
		debug('Using settings `%j`', configuration.settings);
		context.processor.data('settings', configuration.settings);

		debug('Using `%d` plugins', plugins.length);

		while (++index < plugins.length) {
			const plugin = plugins[index][0];
			let options = plugins[index][1];

			if (options === false) {
				continue;
			}

			// Allow for default arguments in es2020.
			/* c8 ignore next 6 */
			if (
				options === null ||
				(typeof options === 'object' && isEmpty(options))
			) {
				options = undefined;
			}

			debug(
				'Using plugin `%s`, with options `%j`',
				// @ts-expect-error: `displayName` sure can exist on functions.
				plugin.displayName || plugin.name || 'function',
				options,
			);

			try {
				context.processor.use(plugin, options, context.fileSet);
				/* Should not happen anymore! */
				/* c8 ignore next 4 */
			} catch (error_: unknown) {
				const exception: Error = error_ as Error;
				next(exception);
				return;
			}
		}

		next();
	});
}
