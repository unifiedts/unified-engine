import fs, {Stats} from 'node:fs';
import path from 'node:path';
import glob from 'glob';
import ignore, {Ignore as GitIgnore} from 'ignore';
import {toVFile} from 'to-vfile';
import {VFile} from 'vfile';
import {Ignore} from './ignore';

export interface Options {
	cwd: string;
	extensions: string[];
	silentlyIgnore: boolean | undefined;
	ignorePatterns: string[];
	ignore: Ignore;
}
export interface SearchResults {
	stats: fs.Stats | undefined;
	ignored: boolean | undefined;
}
export interface Result {
	input: Array<string | VFile>;
	output: VFile[];
}
export interface CleanResult {
	oneFileMode: boolean;
	files: VFile[];
}
export type Callback = (error: Error | null, result?: CleanResult) => void;

/**
 * Search `patterns`, a mix of globs, paths, and files.
 *
 */
export function finder(
	input: Array<string | VFile>,
	options: Options,
	callback: Callback,
): void {
	expand(input, options, (error, result) => {
		// Glob errors are unusual.
		// other errors are on the vfile results.
		/* c8 ignore next 2 */
		if (error || !result) {
			callback(error);
		} else {
			callback(null, {
				oneFileMode: oneFileMode(result),
				files: result.output,
			});
		}
	});
}

/**
 * Expand the given glob patterns, search given and found directories, and map
 * to vfiles.
 */
function expand(
	input: Array<string | VFile>,
	options: Options,
	next: (error: Error | null, result?: Result) => void,
) {
	let paths: Array<string | VFile> = [];
	let actual = 0;
	let expected = 0;
	let index = -1;
	let failed: boolean | undefined;

	const callback = (error: Error | null, files: string[]) => {
		// Glob errors are unusual.
		/* c8 ignore next 3 */
		if (failed) {
			return;
		}

		// Glob errors are unusual.
		/* c8 ignore next 4 */
		if (error) {
			failed = true;
			done1(error);
		} else {
			actual++;
			paths = paths.concat(files);

			if (actual === expected) {
				search(paths, options, done1);
			}
		}
	};

	while (++index < input.length) {
		let file = input[index];
		if (typeof file === 'string') {
			if (glob.hasMagic(file)) {
				expected++;
				glob(file, {cwd: options.cwd}, callback);
			} else {
				// `relative` to make the paths canonical.
				file =
					path.relative(
						options.cwd,
						path.resolve(options.cwd, file),
					) || '.';
				paths.push(file);
			}
		} else {
			const fp = file.path
				? path.relative(options.cwd, file.path)
				: options.cwd;
			file.cwd = options.cwd;
			file.path = fp;
			file.history = [fp];
			paths.push(file);
		}
	}

	if (!expected) {
		search(paths, options, done1);
	}

	function done1(error: Error | null, files?: VFile[]) {
		// `search` currently does not give errors.
		/* c8 ignore next 2 */
		if (error || !files) {
			next(error);
		} else {
			next(null, {input: paths, output: files});
		}
	}
}

/**
 * Search `paths`.
 */
function search(
	input: Array<string | VFile>,
	options: Options & {nested?: boolean},
	next: (error: Error | null, files: VFile[]) => void,
) {
	const extraIgnore = ignore().add(options.ignorePatterns);
	let expected = 0;
	let actual = 0;
	let index = -1;
	let files: VFile[] = [];

	while (++index < input.length) {
		each(input[index]);
	}

	if (!expected) {
		next(null, files);
	}

	function each(file: string | VFile): void {
		const ext =
			typeof file === 'string' ? path.extname(file) : file.extname;

		// Normalise globs.
		if (typeof file === 'string') {
			file = file.split('/').join(path.sep);
		}

		const part = base(file);

		if (
			options.nested &&
			part &&
			(part.startsWith('.') || part === 'node_modules')
		) {
			return;
		}

		expected++;

		statAndIgnore(
			file,
			Object.assign({}, options, {extraIgnore}),
			(error, result) => {
				const ignored = result?.ignored;
				const dir = result?.stats?.isDirectory();

				if (ignored && (options.nested || options.silentlyIgnore)) {
					one(null, []);
					return;
				}

				if (!ignored && dir) {
					fs.readdir(
						path.resolve(options.cwd, filePath(file)),
						(error, basenames) => {
							// Should not happen often: the directory is `stat`ed first, which was ok,
							// but reading it is not.
							/* c8 ignore next 9 */
							if (error) {
								const otherFile = toVFile(filePath(file));
								otherFile.cwd = options.cwd;

								try {
									otherFile.fail('Cannot read directory');
								} catch {}

								one(null, [otherFile]);
							} else {
								search(
									basenames.map((name) =>
										path.join(filePath(file), name),
									),
									Object.assign({}, options, {
										nested: true,
									}),
									one,
								);
							}
						},
					);
					return;
				}

				if (
					!dir &&
					options.nested &&
					options.extensions.length > 0 &&
					(!ext || !options.extensions.includes(ext))
				) {
					one(null, []);
					return;
				}

				file = toVFile(file);
				file.cwd = options.cwd;

				if (ignored) {
					try {
						file.fail(
							'Cannot process specified file: it’s ignored',
						);
						// C8 bug on Node@12
						/* c8 ignore next 1 */
					} catch {}
				}

				if (error && error.code === 'ENOENT') {
					try {
						file.fail(
							error.syscall === 'stat'
								? 'No such file or directory'
								: error,
						);
						// C8 bug on Node@12
						/* c8 ignore next 1 */
					} catch {}
				}

				one(null, [file]);
			},
		);

		/**
		 * Error is never given. Always given `results`.
		 *
		 */
		function one(_: Error | null, results: VFile[]) {
			/* istanbul ignore else - Always given. */
			if (results) {
				files = files.concat(results);
			}

			actual++;

			if (actual === expected) {
				next(null, files);
			}
		}
	}
}

function statAndIgnore(
	file: VFile | string,
	options: Options & {extraIgnore: GitIgnore},
	callback: (
		error: NodeJS.ErrnoException | null,
		result?: SearchResults,
	) => void,
) {
	const fp = path.resolve(options.cwd, filePath(file));
	const normal = path.relative(options.cwd, fp);
	let expected = 1;
	let actual = 0;
	let stats: Stats | undefined;
	let ignored: boolean | undefined;

	if (typeof file === 'string' || !file.value) {
		expected++;
		fs.stat(fp, (error, value) => {
			stats = value;
			onStatOrCheck(error);
		});
	}

	options.ignore.check(fp, (error, value) => {
		ignored = value;

		// `ignore.check` is sometimes sync, we need to force async behavior.
		setImmediate(onStatOrCheck, error);
	});

	function onStatOrCheck(error: Error | null) {
		actual++;

		if (error) {
			callback(error);
			actual = -1;
		} else if (actual === expected) {
			callback(null, {
				stats,
				ignored:
					ignored ??
					(normal === '' ||
					normal === '..' ||
					normal.startsWith(path.sep) ||
					normal.startsWith(`..${path.sep}`)
						? false
						: options.extraIgnore.ignores(normal)),
			});
		}
	}
}

function base(file: string | VFile): string | undefined {
	return typeof file === 'string' ? path.basename(file) : file.basename;
}

function filePath(file: string | VFile): string {
	return typeof file === 'string' ? file : file.path;
}

function oneFileMode(result: Result): boolean {
	return (
		result.output.length === 1 &&
		result.input.length === 1 &&
		result.output[0].path === result.input[0]
	);
}
