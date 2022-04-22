
import type {VFile} from 'vfile'
import type {Callback} from 'trough'
import type {Context} from './index'
import fs from 'node:fs'
import path from 'node:path'
import createDebug from 'debug'

const debug = createDebug('unified-engine:file-pipeline:copy')

/**
 * Move a file.
 */
export function copy(context: Context, file: VFile, next: Callback): void {
  const output = context.settings.output
  const currentPath = file.path

  if (typeof output !== 'string') {
    debug('Not copying')
    next()
    return
  }

  const outpath = path.resolve(context.settings.cwd, output)

  debug('Copying `%s`', currentPath)

  fs.stat(outpath, (error, stats) => {
    if (error) {
      if (
        error.code !== 'ENOENT' ||
        output.charAt(output.length - 1) === path.sep
      ) {
        return next(
          new Error('Cannot read output directory. Error:\n' + error.message)
        )
      }

      // This is either given an error, or the parent exists which is a directory,
      // but we should keep the basename of the given file.
      fs.stat(path.dirname(outpath), (error) => {
        if (error) {
          next(
            new Error('Cannot read parent directory. Error:\n' + error.message)
          )
        } else {
          done(false)
        }
      })
    } else {
      done(stats.isDirectory())
    }
  })

  function done(directory: boolean): void {
    if (!directory && context.fileSet.expected > 1) {
      return next(
        new Error('Cannot write multiple files to single output: ' + outpath)
      )
    }

    file[directory ? 'dirname' : 'path'] = path.relative(file.cwd, outpath)

    debug('Copying document from %s to %s', currentPath, file.path)

    next()
  }
}
