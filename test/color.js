import path from 'node:path';
import process from 'node:process';
import {engine} from '../index.js';
import {noop} from './util/noop-processor.js';
import {spy} from './util/spy.js';

const cross = process.platform === 'win32' ? '×' : '✖';

const fixtures = path.join('test', 'fixtures');

test('color', (t) => {
	const stderr = spy();

	t.plan(1);

	engine(
		{
			processor: noop,
			cwd: path.join(fixtures, 'empty'),
			streamError: stderr.stream,
			files: ['readme.md'],
			color: true,
		},
		(error, code) => {
			const expected = [
				'\u001B[4m\u001B[31mreadme.md\u001B[39m\u001B[24m',
				'  1:1  \u001B[31merror\u001B[39m  No such file or directory',
				'',
				'\u001B[31m' + cross + '\u001B[39m 1 error',
				'',
			].join('\n');

			t.deepEqual(
				[error, code, stderr()],
				[null, 1, expected],
				'should support color',
			);
		},
	);
});
