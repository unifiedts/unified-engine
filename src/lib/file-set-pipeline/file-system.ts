import type {VFile} from 'vfile'
import type {Callback} from 'trough'
import type {Settings, Configuration} from './index'
import {Ignore} from '../ignore.js'
import {finder} from '../finder.js'

export interface Context {
  files: Array<string | VFile>
  configuration?: Configuration
}

export function fileSystem(
  context: Context,
  settings: Settings,
  next: Callback
): void {
  if (context.files.length === 0) {
    next()
  } else {
    finder(
      context.files,
      {
        cwd: settings.cwd,
        extensions: settings.extensions,
        silentlyIgnore: settings.silentlyIgnore,
        ignorePatterns: settings.ignorePatterns,
        ignore: new Ignore({
          cwd: settings.cwd,
          detectIgnore: settings.detectIgnore,
          ignoreName: settings.ignoreName,
          ignorePath: settings.ignorePath,
          ignorePathResolveFrom: settings.ignorePathResolveFrom
        })
      },
      (error, result) => {
        // Glob errors typically don’t occur.
        /* c8 ignore next 4 */
        if (!result) {
          next(error)
          return
        }

        const output = result.files

        // Sort alphabetically.
        // Everything is unique so we do not care about cases where left and right
        // are equal.
        output.sort(sortAlphabetically)

        // Mark as given.
        // This allows outputting files, which can be pretty dangerous, so it’s
        // “hidden”.
        let index = -1
        while (++index < output.length) {
          output[index].data.unifiedEngineGiven = true
        }

        context.files = output

        // If `out` was not set, detect it based on whether one file was given.
        if (settings.out === null || settings.out === undefined) {
          settings.out = result.oneFileMode
        }

        next(error)
      }
    )
  }

  function sortAlphabetically(left: VFile, right:VFile): 1| -1 {
    return left.path < right.path ? -1 : 1
  }
}
