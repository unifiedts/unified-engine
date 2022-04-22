import {loadPlugin} from 'load-plugin';
import type {VFile, VFileReporter} from 'vfile';
import {reporter} from 'vfile-reporter';
import type {Configuration, Settings} from './index';

export interface Context {
	files: VFile[];
	configuration?: Configuration;
}

export async function log(
	context: Context,
	settings: Settings,
): Promise<unknown> {
	let func: VFileReporter = reporter;

	if (typeof settings.reporter === 'string') {
		try {
			// @ts-expect-error: Assume loaded value is a vfile reporter.
			func = await loadPlugin(settings.reporter, {
				cwd: settings.cwd,
				prefix: 'vfile-reporter',
			});
		} catch {
			throw new Error(
				'Could not find reporter `' + settings.reporter + '`',
			);
		}
	} else if (settings.reporter) {
		func = settings.reporter as VFileReporter;
	}

	let diagnostics = func(
		context.files.filter((file) => file.data.unifiedEngineGiven),
		Object.assign({}, settings.reporterOptions, {
			quiet: settings.quiet,
			silent: settings.silent,
			color: settings.color,
		}),
	);

	if (diagnostics) {
		if (!diagnostics.endsWith('\n')) {
			diagnostics += '\n';
		}

		return new Promise((resolve) => {
			settings.streamError.write(diagnostics, resolve);
		});
	}
}
