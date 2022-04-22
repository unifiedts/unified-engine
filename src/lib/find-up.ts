import fs, { PathLike } from 'node:fs'
import path from 'node:path'
import {fault} from 'fault'
import createDebug from 'debug'
import {wrap} from 'trough'
import { isFunction } from 'node:util'

const debug = createDebug('unified-engine:find-up')
export interface BaseValue {
  code: string;
  path : PathLike
  syscall: string;
}
export type Create<Value> = (buf:Buffer , filePath: string) => Promise<Value|undefined>|Value|undefined

export interface Options<Value> {
  cwd:string;
  filePath:string|undefined;
  detect?:boolean|undefined;
  names:string[];
  create:Create<Value>;
}

export type Callback<Value>  = (error:Error|null ,result?: Value) => void
function isCallback<Value>(value:unknown[]): value is Callback<Value>[]
function isCallback<Value>(value:unknown): value is Callback<Value>
function isCallback<Value>(value:unknown | unknown[]): value is Callback<Value> |Callback<Value>[] {
  return (typeof value === 'function' && value.arguments.length === 2)
}

export class FindUp<Value> {

   cache:Record<string, (Callback<Value>)[]|undefined|Error|Value>;
   cwd: string;
   detect: boolean;
   names: string[];
   create: Create<Value>;
   givenFilePath?: string|undefined;
   givenFile: Error|Value|Callback<Value>[]|undefined;

  constructor(options: Options<Value>) {
    this.cache = {}
    this.cwd = options.cwd
    this.detect = options.detect ?? false
    this.names = options.names
    this.create = options.create

    this.givenFilePath = options.filePath
      ? path.resolve(options.cwd, options.filePath)
      : undefined

    this.givenFile
  }

  load(filePath:string, callback:Callback<Value>) {
    const self = this
    const givenFile = this.givenFile
    const {givenFilePath} = this

    if (givenFilePath) {
      if (givenFile) {
        apply(callback, givenFile)
      } else {
        const cbs = [callback]
        this.givenFile = cbs
        debug('Checking given file `%s`', givenFilePath)
        fs.readFile(givenFilePath, (error, buf) => {
          if (error) {
            const result: NodeJS.ErrnoException = fault(
              'Cannot read given file `%s`\n%s',
              path.relative(this.cwd, givenFilePath),
              error.stack
            )
            result.code = 'ENOENT'
            result.path = error.path
            result.syscall = error.syscall
            loaded(result)
          } else {
            wrap(this.create, (error, /** @type {Value} */ result) => {
              if (error) {
                debug(error.message)
                loaded(
                  fault(
                    'Cannot parse given file `%s`\n%s',
                    path.relative(this.cwd, givenFilePath),
                    error.stack
                  )
                )
              } else {
                debug('Read given file `%s`', givenFilePath)
                loaded(result)
              }
            })(buf, givenFilePath)
          }

          function loaded(result: Error|Value) {
            self.givenFile = result
            applyAll(cbs, result)
          }
        })
      }

      return
    }

    if (!this.detect) {
      return callback(null)
    }

    filePath = path.resolve(this.cwd, filePath)
    const parent = path.dirname(filePath)

    if (parent in this.cache) {
      apply(callback, this.cache[parent])
    } else {
      this.cache[parent] = [callback]
      find(parent)
    }

    function find(directory:string) {
      let index = -1

      next()

      function next() {
        // Try to read the next file.
        // We do not use `readdir` because on huge directories, that could be
        // *very* slow.
        if (++index < self.names.length) {
          fs.readFile(path.join(directory, self.names[index]), done)
        } else {
          const parent = path.dirname(directory)

          if (directory === parent) {
            debug('No files found for `%s`', filePath)
            found(null)
          } else if (parent in self.cache) {
            apply(found, self.cache[parent])
          } else {
            self.cache[parent] = [found]
            find(parent)
          }
        }
      }

      function done(error: NodeJS.ErrnoException|null, buf?:Buffer): void {
        const fp = path.join(directory, self.names[index])

        if (error) {
          // Hard to test.
          /* c8 ignore next 13 */
          if (error.code === 'ENOENT') {
            return next()
          }

          debug(error.message)
          return found(
            fault(
              'Cannot read file `%s`\n%s',
              path.relative(self.cwd, fp),
              error.message
            )
          )
        }

        wrap(self.create, (error, /** @type {Value} */ result) => {
          if (error) {
            found(
              fault(
                'Cannot parse file `%s`\n%s',
                path.relative(self.cwd, fp),
                error.message
              )
            )
          } else if (result) {
            debug('Read file `%s`', fp)
            found(null, result)
          } else {
            next()
          }
        })(buf, fp)
      }

      function found(error: Error|null, result?: Value):void {
        const cbs:unknown | unknown[] = self.cache[directory] ;

        if (!Array.isArray(cbs)) {
          throw new Error(`Expected cache to contain an array of callback`)
        }
        if ( !isCallback<Value>(cbs))  {
          throw new Error(`Expected cache to contain an array of callback`)

        }
        self.cache[directory] = error || result
        applyAll(cbs, error || result)
      }
    }

    function applyAll(cbs:Callback<Value>[], result:Value|Error|undefined) {
      let index = cbs.length

      while (index--) {
        apply(cbs[index], result)
      }
    }

    function apply(cb:Callback<Value>, result:Value|Error|Array<Callback<Value>>|undefined) {
      if (Array.isArray(result)) {
        result.push(cb)
      } else if (result instanceof Error) {
        cb(result)
      } else {
        cb(null, result)
      }
    }
  }
}
