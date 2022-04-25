import createDebug from 'debug';
import type { Callback } from 'trough';
import type { VFile } from 'vfile';
import { statistics } from 'vfile-statistics';
import type { Context } from './index';

const debug = createDebug('unified-engine:file-pipeline:queue');

const own = {}.hasOwnProperty;

/**
 * Queue all files which came this far.
 * When the last file gets here, run the file-set pipeline and flush the queue.
 *
 */
export function queue(context: Context, file: VFile, next: Callback) {
	let origin = file.history[0];
	let map = context.fileSet.complete;
	let complete = true;

	if (!map) {
		map = {};
		context.fileSet.complete = map;
	}

	debug('Queueing `%s`', origin);

	map[origin] = next;

	const files = context.fileSet.valueOf();
	let index = -1;
	while (++index < files.length) {
		each(files[index]);
	}

	if (!complete) {
		debug('Not flushing: some files cannot be flushed');
		return;
	}

	context.fileSet.complete = {};
	context.fileSet.pipeline.run(context.fileSet, done);

	function each(file: VFile) {
		const key = file.history[0];

		if (statistics(file).fatal) {
			return;
		}

		if (typeof map[key] === 'function') {
			debug('`%s` can be flushed', key);
		} else {
			debug('Interupting flush: `%s` is not finished', key);
			complete = false;
		}
	}

	function done(error: Error | null) {
		debug('Flushing: all files can be flushed');

		// Flush.
		if (map) {
			for (origin in map) {
				if (own.call(map, origin)) {
					map[origin](error);
				}
			}
		}
	}
}
