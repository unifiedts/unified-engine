import concatStream from 'concat-stream';
import createDebug from 'debug';
import {toVFile} from 'to-vfile';
import type {Callback} from 'trough';
import type {VFile} from 'vfile';
import type {Settings} from './index';

export interface Context {
	files: Array<string | VFile>;
}

const debug = createDebug('unified-engine:file-set-pipeline:stdin');

export function stdin(context: Context, settings: Settings, next: Callback) {
	if (settings.files && settings.files.length > 0) {
		debug('Ignoring `streamIn`');

		let error: Error | undefined;

		if (settings.filePath) {
			error = new Error(
				'Do not pass both `--file-path` and real files.\nDid you mean to pass stdin instead of files?',
			);
		}

		next(error);

		return;
	}

	// @ts-expect-error: does exist on `stdin`.
	if (settings.streamIn.isTTY) {
		debug('Cannot read from `tty` stream');
		next(new Error('No input'));

		return;
	}

	debug('Reading from `streamIn`');

	settings.streamIn.pipe(
		concatStream({encoding: 'string'}, (value) => {
			const file = toVFile(settings.filePath);

			debug('Read from `streamIn`');

			file.cwd = settings.cwd;
			file.value = value;
			file.data.unifiedEngineGiven = true;
			file.data.unifiedEngineStreamIn = true;

			context.files = [file];

			// If `out` was not set, set `out`.
			settings.out =
				settings.out === null || settings.out === undefined
					? true
					: settings.out;

			next();
		}),
	);
}
