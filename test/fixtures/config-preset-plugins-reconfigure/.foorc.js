import preset from './preset/index.js';
import plugin from './preset/plugin.js';

/** @type {import('../../../../index.js').Preset} */
const config = {
	plugins: [preset, [plugin, { two: false, three: true }]],
};

export default config;
