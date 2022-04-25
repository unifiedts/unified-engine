import type {Buffer} from 'node:buffer';
import createDebug from 'debug';
import isBuffer from 'is-buffer';
import {inspectColor, inspectNoColor} from 'unist-util-inspect';
import type {VFile} from 'vfile';
import {statistics} from 'vfile-statistics';
import type {Context} from './index';

const debug = createDebug('unified-engine:file-pipeline:stringify');

function isBufferType(value: unknown): value is Buffer {
	return isBuffer(value);
}

/**
 * Stringify a tree.
 */
export function stringify(context: Context, file: VFile) {
	let value: unknown;

	if (statistics(file).fatal) {
		debug('Not compiling failed document');
		return;
	}

	if (
		!context.settings.output &&
		!context.settings.out &&
		!context.settings.alwaysStringify
	) {
		debug('Not compiling document without output settings');
		return;
	}

	debug('Compiling `%s`', file.path);

	if (context.settings.inspect) {
		// Add a `txt` extension if there is a path.
		if (file.path) {
			file.extname = '.txt';
		}

		value =
			(context.settings.color ? inspectColor : inspectNoColor)(
				context.tree,
			) + '\n';
	} else if (context.settings.treeOut) {
		// Add a `json` extension to ensure the file is correctly seen as JSON.
		// Only add it if there is a path — not if the file is for example stdin.
		if (file.path) {
			file.extname = '.json';
		}

		// Add the line feed to create a valid UNIX file.
		value = JSON.stringify(context.tree, null, 2) + '\n';
	} else {
		if (!context.tree) {
			throw new Error(
				'Stringify expected context.tree to be defined, it was not.',
			);
		}

		value = context.processor.stringify(context.tree, file);
	}

	if (value === undefined || value === null) {
		// Empty.
	} else if (typeof value === 'string' || isBufferType(value)) {
		file.value = value;
	} else {
		file.result = value;
	}

	debug('Serialized document');
}
