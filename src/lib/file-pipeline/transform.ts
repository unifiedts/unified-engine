import createDebug from 'debug';
import type { Callback } from 'trough';
import type { VFile } from 'vfile';
import { statistics } from 'vfile-statistics';
import type { Context } from './index';

const debug = createDebug('unified-engine:file-pipeline:transform');

/**
 * Transform the tree associated with a file with configured plugins.
 *
 * @param {Context} context
 * @param {VFile} file
 * @param {Callback} next
 */
export function transform(context: Context, file: VFile, next: Callback): void {
	if (statistics(file).fatal) {
		next();
	} else {
		debug('Transforming document `%s`', file.path);
		if (!context.tree) {
			throw new Error(`transform called with a vaild tree on context`);
		}

		context.processor.run(context.tree, file, (error, node) => {
			debug('Transformed document (error: %s)', error);
			context.tree = node;
			next(error);
		});
	}
}