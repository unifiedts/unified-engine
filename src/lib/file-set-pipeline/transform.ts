import type {VFile, VFileReporter} from 'vfile'
import type {Callback} from 'trough'
import type {Settings, Configuration} from './index'
import {FileSet} from '../file-set.js'
import {filePipeline} from '../file-pipeline/index.js'

export interface Context {
  files: Array<VFile>
  configuration: Configuration
  fileSet: FileSet
}

/**
 * Transform all files.
 */
export function transform(
  context: Context,
  settings: Settings,
  next: Callback
): void {
  const fileSet = new FileSet()

  context.fileSet = fileSet

  fileSet.on('add', (  file:VFile) => {
    filePipeline.run(
      {
        configuration: context.configuration,
        // Needed `any`s
        // type-coverage:ignore-next-line
        processor: settings.processor(),
        fileSet,
        settings
      },
      file,
      (error: Error | null) => {
        // Does not occur as all failures in `filePipeLine` are failed on each
        // file.
        // Still, just to ensure things work in the future, we add an extra check.
        /* c8 ignore next 4 */
        if (error) {
          Object.assign(file.message(error), {fatal: true})
        }

        fileSet.emit('one', file)
      }
    )
  })

  fileSet.on('done', next)

  if (context.files.length === 0) {
    next()
  } else {
    let index = -1
    while (++index < context.files.length) {
      fileSet.add(context.files[index])
    }
  }
}
