import path from 'node:path';
import ignore, {Ignore as GitIgnore} from 'ignore';
import {FindUp} from './find-up.js';

export type IgnoreConfig = GitIgnore & {filePath: string};
export type ResolveFrom = 'cwd' | 'dir';
export interface Options {
	cwd: string;
	detectIgnore: boolean | undefined;
	ignoreName: string | undefined;
	ignorePath: string | undefined;
	ignorePathResolveFrom: ResolveFrom | undefined;
}
export type Callback = (
	error: Error | null,
	result?: boolean | undefined,
) => void;

export class Ignore {
	cwd: string;
	ignorePathResolveFrom?: ResolveFrom | undefined;
	findUp: FindUp<IgnoreConfig>;
	constructor(options: Options) {
		this.cwd = options.cwd;
		this.ignorePathResolveFrom = options.ignorePathResolveFrom;

		this.findUp = new FindUp({
			cwd: options.cwd,
			filePath: options.ignorePath,
			detect: options.detectIgnore,
			names: options.ignoreName ? [options.ignoreName] : [],
			create,
		});
	}

	check(filePath: string, callback: Callback): void {
		this.findUp.load(filePath, (error, ignoreSet) => {
			if (error) {
				callback(error);
			} else if (ignoreSet) {
				const normal = path.relative(
					path.resolve(
						this.cwd,
						this.ignorePathResolveFrom === 'cwd'
							? '.'
							: ignoreSet.filePath,
					),
					path.resolve(this.cwd, filePath),
				);

				if (
					normal === '' ||
					normal === '..' ||
					normal.charAt(0) === path.sep ||
					normal.slice(0, 3) === '..' + path.sep
				) {
					callback(null, false);
				} else {
					callback(null, ignoreSet.ignores(normal));
				}
			} else {
				callback(null, false);
			}
		});
	}
}

function create(buf: Buffer, filePath: string): IgnoreConfig {
	return Object.assign(ignore().add(String(buf)), {
		filePath: path.dirname(filePath),
	});
}
