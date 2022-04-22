import fs from 'node:fs';
import path from 'node:path';
import createDebug from 'debug';
import type {Callback} from 'trough';
import type {VFile} from 'vfile';
import {statistics} from 'vfile-statistics';
import type {Context} from './index';

const debug = createDebug('unified-engine:file-pipeline:read');

/**
 * Fill a file with its value when not already filled.
 */
export function read(context: Context, file: VFile, next: Callback): void {
	let filePath = file.path;

	if (file.value || file.data.unifiedEngineStreamIn) {
		debug('Not reading file `%s` with `value`', filePath);
		next();
	} else if (statistics(file).fatal) {
		debug('Not reading failed file `%s`', filePath);
		next();
	} else {
		filePath = path.resolve(context.settings.cwd, filePath);

		debug('Reading `%s` in `%s`', filePath, 'utf8');
		fs.readFile(filePath, 'utf8', (error, value) => {
			debug('Read `%s` (error: %s)', filePath, error);

			file.value = value || '';

			next(error);
		});
	}
}
