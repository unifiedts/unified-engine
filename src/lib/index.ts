import {VFile} from 'vfile'
import {Processor} from 'unified'
import {FileSet, Completer} from './file-set.js'
import {ResolveFrom} from './ignore.js'
import {ConfigTransform, Preset} from './configuration'
import process from 'node:process'
import {PassThrough} from 'node:stream'
import {statistics} from 'vfile-statistics'
import {fileSetPipeline} from './file-set-pipeline/index.js'

export type VFileReporterOptions = {
  [key: string]: unknown
} & VFileReporterFields
export interface VFileReporterFields {
  color?: boolean
  quiet?: boolean
  silent?: boolean
}
export type VFileReporter = (
  files: VFile[],
  options: VFileReporterOptions
) => string

export interface Settings {
  processor: Options['processor']
  cwd: Exclude<Options['cwd'], undefined>
  files: Exclude<Options['files'], undefined>
  extensions: Exclude<Options['extensions'], undefined>
  streamIn: Exclude<Options['streamIn'], undefined>
  filePath: Options['filePath']
  streamOut: Exclude<Options['streamOut'], undefined>
  streamError: Exclude<Options['streamError'], undefined>
  out: Options['out']
  output: Options['output']
  alwaysStringify: Options['alwaysStringify']
  tree: Options['tree']
  treeIn: Options['treeIn']
  treeOut: Options['treeOut']
  inspect: Options['inspect']
  rcName: Options['rcName']
  packageField: Options['packageField']
  detectConfig: Options['detectConfig']
  rcPath: Options['rcPath']
  settings: Exclude<Options['settings'], undefined>
  ignoreName: Options['ignoreName']
  detectIgnore: Options['detectIgnore']
  ignorePath: Options['ignorePath']
  ignorePathResolveFrom: Options['ignorePathResolveFrom']
  ignorePatterns: Exclude<Options['ignorePatterns'], undefined>
  silentlyIgnore: Options['silentlyIgnore']
  plugins: Options['plugins']
  pluginPrefix: Options['pluginPrefix']
  configTransform: Options['configTransform']
  defaultConfig: Options['defaultConfig']
  reporter: Options['reporter']
  reporterOptions: Options['reporterOptions']
  color: Options['color']
  silent: Options['silent']
  quiet: Options['quiet']
  frail: Options['frail']
}

export interface Options {
  //   Options for unified engine
  processor: () => Processor
  //   Unified processor to transform files
  cwd?: string
  //  Directory to search files in, load plugins from, and more.
  //   Defaults to `process.cwd()`.
  files?: Array<string | VFile>
  //   Paths or globs to files and directories, or virtual files, to process.
  extensions?: Array<string>
  //   If `files` matches directories, include `files` with `extensions`
  streamIn?: NodeJS.ReadableStream
  //   Stream to read from if no files are found or given.
  //   Defaults to `process.stdin`.
  filePath?: string
  //   File path to process the given file on `streamIn` as.
  streamOut?: NodeJS.WritableStream
  //   Stream to write processed files to.
  //   Defaults to `process.stdout`.
  streamError?: NodeJS.WritableStream
  //   Stream to write the report (if any) to.
  //   Defaults to `process.stderr`.
  out?: boolean
  //   Whether to write the processed file to `streamOut`
  output?: boolean | string
  //   Whether to write successfully processed files, and where to.
  //
  // When `true`, overwrites the given files
  // When `false`, does not write to the file system
  // When pointing to an existing directory, files are written to that
  //     directory and keep their original basenames
  // When the parent directory of the given path exists and one file is
  //     processed, the file is written to the given path
  alwaysStringify?: boolean
  //   Whether to always serialize successfully processed files.
  tree?: boolean
  //   Whether to treat both input and output as a syntax tree.
  treeIn?: boolean
  //   Whether to treat input as a syntax tree.
  //   Defaults to `options.tree`.
  treeOut?: boolean
  //   Whether to treat output as a syntax tree.
  //   Defaults to `options.tree`.
  inspect?: boolean
  //   Whether to output a formatted syntax tree.
  rcName?: string
  //   Name of configuration files to load.
  packageField?: string
  //   Property at which configuration can be found in `package.json` files
  detectConfig?: boolean
  //   Whether to search for configuration files.
  //   Defaults to `true` if `rcName` or `packageField` are given
  rcPath?: string
  //   Filepath to a configuration file to load.
  settings?: Preset['settings']
  //   Configuration for the parser and compiler of the processor.
  ignoreName?: string
  //   Name of ignore files to load.
  detectIgnore?: boolean
  //   Whether to search for ignore files.
  //   Defaults to `true` if `ignoreName` is given.
  ignorePath?: string
  //   Filepath to an ignore file to load.
  ignorePathResolveFrom?: ResolveFrom
  //   Resolve patterns in `ignorePath` from the current working
  //   directory (`'cwd'`) or the ignore file’s directory (`'dir'`, default).
  ignorePatterns?: Array<string>
  //   Patterns to ignore in addition to ignore files
  silentlyIgnore?: boolean
  //   Skip given files if they are ignored.
  plugins?: Preset['plugins']
  //   Plugins to use.
  pluginPrefix?: string
  //   Prefix to use when searching for plugins
  configTransform?: ConfigTransform
  //   Transform config files from a different schema.
  defaultConfig?: Preset
  //   Default configuration to use if no config file is given or found.
  reporter?: VFileReporter | string
  //   Reporter to use
  //   Defaults to `vfile-reporter`
  reporterOptions?: VFileReporterOptions
  //   Config to pass to the used reporter.
  color?: VFileReporterOptions['color']
  //   Whether to report with ANSI color sequences.
  silent?: VFileReporterOptions['silent']
  //   Report only fatal errors
  quiet?: VFileReporterOptions['quiet']
  //   Do not report successful files
  frail?: boolean
}

/**
 * Processing context.
 *
 */
export interface Context {
  files?: VFile[]
  fileSet?: FileSet
}

/**
 *  Callback called when processing according to options is complete.
 *   Invoked with either a fatal error if processing went horribly wrong
 *   (probably due to incorrect configuration), or a status code and the
 *   processing context.
 *
 **/
export type Callback = (
  error: Error | null,
  status?: 0 | 1,
  context?: Context
) => void

/**
 * Run the file set pipeline once.
 * `callback` is called with a fatal error, or with a status code (`0` on
 * success, `1` on failure).
 *
 * @param {Options} options
 * @param {Callback} callback
 */
export function engine(options: Options, callback: Callback) {
  const settings: Partial<Settings> = {}
  let stdin: NodeJS.ReadStream =
    new PassThrough() as unknown as NodeJS.ReadStream

  try {
    stdin = process.stdin
    // Obscure bug in Node (seen on Windows).
    // See: <https://github.com/nodejs/node/blob/f856234/lib/internal/process/stdio.js#L82>,
    // <https://github.com/AtomLinter/linter-markdown/pull/85>.
    /* c8 ignore next 1 */
  } catch {}

  if (!callback) {
    throw new Error('Missing `callback`')
  }

  // Needed `any`s
  // type-coverage:ignore-next-line
  if (!options || !options.processor) {
    return next(new Error('Missing `processor`'))
  }

  // Processor.
  // Needed `any`s
  // type-coverage:ignore-next-line
  settings.processor = options.processor

  // Path to run as.
  settings.cwd = options.cwd || process.cwd()

  // Input.
  settings.files = options.files || []
  settings.extensions = (options.extensions || []).map((ext) =>
    ext.charAt(0) === '.' ? ext : '.' + ext
  )

  settings.filePath = options.filePath
  settings.streamIn = options.streamIn || stdin

  // Output.
  settings.streamOut = options.streamOut || process.stdout
  settings.streamError = options.streamError || process.stderr
  settings.alwaysStringify = options.alwaysStringify
  settings.output = options.output
  settings.out = options.out

  // Null overwrites config settings, `undefined` does not.
  if (settings.output === null || settings.output === undefined) {
    settings.output = undefined
  }

  if (settings.output && settings.out) {
    return next(new Error('Cannot accept both `output` and `out`'))
  }

  // Process phase management.
  const tree = options.tree || false

  settings.treeIn = options.treeIn
  settings.treeOut = options.treeOut
  settings.inspect = options.inspect

  if (settings.treeIn === null || settings.treeIn === undefined) {
    settings.treeIn = tree
  }

  if (settings.treeOut === null || settings.treeOut === undefined) {
    settings.treeOut = tree
  }

  // Configuration.
  const detectConfig = options.detectConfig
  const hasConfig = Boolean(options.rcName || options.packageField)

  if (detectConfig && !hasConfig) {
    return next(
      new Error('Missing `rcName` or `packageField` with `detectConfig`')
    )
  }

  settings.detectConfig =
    detectConfig === null || detectConfig === undefined
      ? hasConfig
      : detectConfig
  settings.rcName = options.rcName
  settings.rcPath = options.rcPath
  settings.packageField = options.packageField
  settings.settings = options.settings || {}
  settings.configTransform = options.configTransform
  settings.defaultConfig = options.defaultConfig

  // Ignore.
  const detectIgnore = options.detectIgnore
  const hasIgnore = Boolean(options.ignoreName)

  settings.detectIgnore =
    detectIgnore === null || detectIgnore === undefined
      ? hasIgnore
      : detectIgnore
  settings.ignoreName = options.ignoreName
  settings.ignorePath = options.ignorePath
  settings.ignorePathResolveFrom = options.ignorePathResolveFrom || 'dir'
  settings.ignorePatterns = options.ignorePatterns || []
  settings.silentlyIgnore = Boolean(options.silentlyIgnore)

  if (detectIgnore && !hasIgnore) {
    return next(new Error('Missing `ignoreName` with `detectIgnore`'))
  }

  // Plugins.
  settings.pluginPrefix = options.pluginPrefix
  settings.plugins = options.plugins || []

  // Reporting.
  settings.reporter = options.reporter
  settings.reporterOptions = options.reporterOptions
  settings.color = options.color || false
  settings.silent = options.silent
  settings.quiet = options.quiet
  settings.frail = options.frail

  // Process.
  fileSetPipeline.run({files: options.files || []}, settings, next)

  /**
   * @param {Error|null} error
   * @param {Context} [context]
   */
  function next(error: Error | null, context?: Context) {
    const stats = statistics((context || {}).files)
    const failed = Boolean(
      settings.frail ? stats.fatal || stats.warn : stats.fatal
    )

    if (error) {
      callback(error)
    } else {
      callback(null, failed ? 1 : 0, context)
    }
  }
}
