import fs from 'node:fs';
import path from 'node:path';
import createDebug from 'debug';
import type {Callback} from 'trough';
import type {VFile} from 'vfile';
import {statistics} from 'vfile-statistics';
import type {Context} from './index';

const debug = createDebug('unified-engine:file-pipeline:file-system');

/**
 * Write a virtual file to the file-system.
 * Ignored when `output` is not given.
 */
export function fileSystem(
	context: Context,
	file: VFile,
	next: Callback,
): void {
	if (!context.settings.output) {
		debug('Ignoring writing to file-system');
		next();
		return;
	}

	if (!file.data.unifiedEngineGiven) {
		debug('Ignoring programmatically added file');
		next();
		return;
	}

	let destinationPath = file.path;

	if (!destinationPath) {
		debug('Cannot write file without a `destinationPath`');
		next(new Error('Cannot write file without an output path'));
		return;
	}

	if (statistics(file).fatal) {
		debug('Cannot write file with a fatal error');
		next();
		return;
	}

	destinationPath = path.resolve(context.settings.cwd, destinationPath);
	debug('Writing document to `%s`', destinationPath);

	file.stored = true;
	fs.writeFile(destinationPath, file.toString(), next);
}
