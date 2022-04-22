import createDebug from 'debug';
import parseJson from 'parse-json';
import type {VFile} from 'vfile';
import {statistics} from 'vfile-statistics';
import type {Context} from './index';

const debug = createDebug('unified-engine:file-pipeline:parse');

/**
 * Fill a file with a tree.
 *
 * @param {Context} context
 * @param {VFile} file
 */
export function parse(context: Context, file: VFile): void {
	if (statistics(file).fatal) {
		return;
	}

	if (context.settings.treeIn) {
		debug('Not parsing already parsed document');

		try {
			context.tree = parseJson(file.toString());
		} catch (error) {
			const exception = error as Error;
			const message = file.message(
				new Error('Cannot read file as JSON\n' + exception.message),
			);
			message.fatal = true;
		}

		// Add the preferred extension to ensure the file, when serialized, is
		// correctly recognised.
		// Only add it if there is a path — not if the file is for example stdin.
		if (file.path) {
			file.extname = context.settings.extensions[0];
		}

		file.value = '';

		return;
	}

	debug('Parsing `%s`', file.path);

	context.tree = context.processor.parse(file);

	debug('Parsed document');
}
