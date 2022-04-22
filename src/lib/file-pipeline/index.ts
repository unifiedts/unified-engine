import {Pipeline, trough} from 'trough';
import type {Processor} from 'unified';
import type {Node} from 'unist';
import {VFile} from 'vfile';
import {VFileMessage} from 'vfile-message';
import type {Configuration} from '../configuration.js';
import type {FileSet} from '../file-set.js';
import type {Settings} from '../index';
import {configure} from './configure.js';
import {copy} from './copy.js';
import {fileSystem} from './file-system.js';
import {parse} from './parse.js';
import {queue} from './queue.js';
import {read} from './read.js';
import {stdout} from './stdout.js';
import {stringify} from './stringify.js';
import {transform} from './transform.js';

export interface Context {
	processor: Processor;
	fileSet: FileSet;
	configuration: Configuration;
	settings: Settings;
	tree?: Node;
}

// This pipeline ensures each of the pipes always runs: even if the read pipe
// fails, queue and write run.
export const filePipeline: Pipeline = trough()
	.use(chunk(trough().use(read).use(configure).use(parse).use(transform)))
	.use(chunk(trough().use(queue)))
	.use(chunk(trough().use(stringify).use(copy).use(stdout).use(fileSystem)));

/**
 * Factory to run a pipe.
 * Wraps a pipe to trigger an error on the `file` in `context`, but still call
 * `next`.
 *
 * @param {Pipeline} pipe
 */
function chunk(pipe: Pipeline) {
	return run;

	/**
	 * Run the bound pipe and handle any errors.
	 *
	 * @param {Context} context
	 * @param {VFile} file
	 * @param {() => void} next
	 */
	function run(context: Context, file: VFile, next: () => void) {
		pipe.run(context, file, (error: VFileMessage | null) => {
			const messages = file.messages;

			if (error) {
				const index = messages.indexOf(error);

				if (index === -1) {
					Object.assign(file.message(error), {fatal: true});
				} else {
					messages[index].fatal = true;
				}
			}

			next();
		});
	}
}
