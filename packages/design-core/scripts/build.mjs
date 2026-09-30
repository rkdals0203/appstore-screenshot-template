import ts from 'typescript'
import { readFile, rm, mkdir, readdir, writeFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
// Build only the declared public entry points and their dependency closure.
// No app aliases, React, generated maps, test fixtures, or private editor source.
const entries = Object.values(pkg.exports).map(entry => resolve(root,
  entry.import.replace('./dist/', './src/').replace(/\.js$/, '.ts')))
const options = {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true,
  skipLibCheck: true, declaration: true, noEmitOnError: true,
  types: ['node'], lib: ['lib.es2023.d.ts'], rootDir: resolve(root, 'src'), outDir: resolve(root, 'dist'),
}
const program = ts.createProgram(entries, options)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: p => p, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }))
  process.exit(1)
}
await rm(options.outDir, { recursive: true, force: true })
await mkdir(options.outDir, { recursive: true })
const emitted = program.emit()
if (emitted.emitSkipped) throw new Error('design-core-emit-failed')

// TypeScript preserves extensionless specifiers. Make the emitted ESM and
// declarations loadable in Node without a source loader or repository aliases.
async function finish(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name)
    if (entry.isDirectory()) { await finish(file); continue }
    if (!/\.(?:js|ts)$/.test(entry.name)) continue
    let text = await readFile(file, 'utf8')
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true)
    const changes = []
    function visit(node) {
      const value = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
          ? node.argument.literal
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0] : undefined
      if (value && ts.isStringLiteral(value) && value.text.startsWith('.')) {
        changes.push({ start: value.getStart(ast), end: value.end, specifier: value.text })
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    for (const change of changes.reverse()) {
      let specifier = change.specifier
      if (!specifier.endsWith('.js')) {
        const target = resolve(dirname(file), specifier)
        const isDirectory = (await stat(target).catch(() => null))?.isDirectory()
        specifier += isDirectory ? '/index.js' : '.js'
      }
      text = text.slice(0, change.start) + JSON.stringify(specifier) + text.slice(change.end)
    }
    await writeFile(file, text)
  }
}
await finish(options.outDir)
