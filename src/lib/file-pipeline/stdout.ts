import type {VFile} from 'vfile'
import type {Callback} from 'trough'
import type {Context} from './index'

import createDebug from 'debug'
import {statistics} from 'vfile-statistics'

const debug = createDebug('unified-engine:file-pipeline:stdout')

/**
 * Write a virtual file to `streamOut`.
 * Ignored when `output` is given, more than one file was processed, or `out`
 * is false.
 *
 */
export function stdout(context: Context, file:VFile, next:Callback) {
  if (!file.data.unifiedEngineGiven) {
    debug('Ignoring programmatically added file')
    next()
  } else if (
    statistics(file).fatal ||
    context.settings.output ||
    !context.settings.out
  ) {
    debug('Ignoring writing to `streamOut`')
    next()
  } else {
    debug('Writing document to `streamOut`')
    context.settings.streamOut.write(file.toString(), next)
  }
}
