/**
 * @typedef {import('vfile').VFile} VFile
 * @typedef {import('trough').Pipeline} Pipeline
 */

import {EventEmitter} from 'node:events';
import {toVFile} from 'to-vfile';
import type {Callback} from 'trough';
import {Pipeline, trough} from 'trough';
import {VFile} from 'vfile';

export type CompleterCallback = (
	set: FileSet,
	callback: (error?: Error | null) => void,
) => void;
export type CompleterAsync = (set: FileSet) => Promise<void>;
export type CompleterSync = (set: FileSet) => void;
export type Completer = (CompleterCallback | CompleterAsync | CompleterSync) & {
	pluginId?: string;
};

export class FileSet extends EventEmitter {
	files: VFile[];
	origins: string[];
	plugins: Completer[];
	expected: number;
	actual: number;
	pipeline: Pipeline;
	complete?: Record<string, Callback> | undefined;
	/**
	 * FileSet constructor.
	 * A FileSet is created to process multiple files through unified processors.
	 * This set, containing all files, is exposed to plugins as an argument to the
	 * attacher.
	 */
	constructor() {
		super();

		this.files = [];
		this.origins = [];
		this.plugins = [];
		this.expected = 0;
		this.actual = 0;
		this.pipeline = trough();

		// Called when a single file has completed it’s pipeline, triggering `done`
		// when all files are complete.
		this.on('one', () => {
			this.actual++;

			if (this.actual >= this.expected) {
				this.emit('done');
			}
		});
	}

	/**
	 * Access the files in a set.
	 */
	valueOf() {
		return this.files;
	}

	/**
	 * Attach middleware to the pipeline on `fileSet`.
	 */
	use(plugin: Completer) {
		const pipeline = this.pipeline;
		let duplicate = false;

		if (plugin?.pluginId) {
			duplicate = this.plugins.some(
				(fn) => fn.pluginId === plugin.pluginId,
			);
		}

		if (!duplicate && this.plugins.includes(plugin)) {
			duplicate = true;
		}

		if (!duplicate) {
			this.plugins.push(plugin);
			pipeline.use(plugin);
		}

		return this;
	}

	/**
	 * Add a file to be processed.
	 * The given file is processed like other files with a few differences:
	 *
	 * *   Ignored when their file path is already added
	 * *   Never written to the file system or streamOut
	 * *   Not reported for
	 *
	 */
	add(file: string | VFile): this {
		if (typeof file === 'string') {
			file = toVFile(file);
		}

		// Prevent files from being added multiple times.
		if (this.origins.includes(file.history[0])) {
			return this;
		}

		this.origins.push(file.history[0]);

		// Add.
		this.valueOf().push(file);
		this.expected++;

		// Force an asynchronous operation.
		// This ensures that files which fall through the file pipeline immediately
		// (such as, when already fatally failed) still queue up correctly.
		setImmediate(() => {
			this.emit('add', file);
		});

		return this;
	}
}
