import type {VFile} from 'vfile'
import type {Callback} from 'trough'
import type {Context} from './index'

import createDebug from 'debug'
import {statistics} from 'vfile-statistics'

const debug = createDebug('unified-engine:file-pipeline:transform')

/**
 * Transform the tree associated with a file with configured plugins.
 *
 * @param {Context} context
 * @param {VFile} file
 * @param {Callback} next
 */
export function transform(context: Context, file: VFile, next: Callback): void {
  if (statistics(file).fatal) {
    next()
  } else {
    debug('Transforming document `%s`', file.path)
    // @ts-expect-error: `tree` is defined at this point.
    context.processor.run(context.tree, file, (error, node) => {
      debug('Transformed document (error: %s)', error)
      context.tree = node
      next(error)
    })
  }
}
