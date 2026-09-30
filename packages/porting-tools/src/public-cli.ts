#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { basename, dirname, resolve } from 'node:path'
import { readProjectFile } from './files.js'
import { captureAppStoreSource, importLocalScreenshots } from './source.js'
import { registerImageAsset } from './assets.js'
import { compareImages } from './comparison.js'
import { readProject, saveProject, checkProject } from './project.js'
import { packProject, unpackProject } from './project-archive.js'
import { uploadCloudResource } from './cloud-upload.js'

const help = `App Store Screenshot Template tools
  capture <app-store-url-or-id> <workspace> [--storefronts us,kr] [--shelf id]
  files <workspace> <image>... [--language ko]
  asset <workspace> <image> --spec <provenance.json>
  compare <source-image> <render-image> <review-directory>
  init <workspace> --document <json> --spec <project-spec.json>
  check <workspace>
  read <workspace>
  save <workspace> --document <json> --revision <hash> [--spec <project-spec.json>]
  pack <workspace> <archive.zip>
  unpack <archive.zip> <new-workspace>
  upload <workspace> --prepared <prepare-upload-response.json> --origin <app-origin>

Local files are working material. These commands do not save a Crescreendo app.
Use the connected Crescreendo MCP to create/edit a cloud draft and render it.
Open the editor URL returned by MCP. No local editor or capture browser is installed.
check validates files and references, not visual quality. compare never approves design.
upload sends one verified binary; call finalize_upload afterward. Keep ticket files private.
`
const optionsByCommand = {
  capture: { storefronts: { type: 'string' }, shelf: { type: 'string' } },
  files: { language: { type: 'string' } }, asset: { spec: { type: 'string' } }, compare: {},
  init: { document: { type: 'string' }, spec: { type: 'string' } }, check: {}, read: {},
  save: { document: { type: 'string' }, revision: { type: 'string' }, spec: { type: 'string' } },
  pack: {}, unpack: {}, upload: { prepared: { type: 'string' }, origin: { type: 'string' } },
} as const
async function readJson(path: string) {
  const file = resolve(path)
  return JSON.parse((await readProjectFile(dirname(file), basename(file))).toString('utf8'))
}
async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === '--help' || command === 'help') { console.log(help); return }
  if (!(command in optionsByCommand)) throw new Error(`unknown-command:${command}`)
  const { positionals: p, values } = parseArgs({ args, allowPositionals: true, strict: true, options: optionsByCommand[command as keyof typeof optionsByCommand] })
  const value = (key: string) => (values as Record<string, unknown>)[key] as string | undefined
  let result
  if (command === 'capture' && p.length === 2) {
    result = await captureAppStoreSource({ app: p[0], directory: resolve(p[1], 'source'), storefronts: value('storefronts')?.split(','), shelfId: value('shelf') })
    if (result.artifact.failures.length) process.exitCode = 2
  } else if (command === 'files' && p.length >= 2) {
    result = await importLocalScreenshots({ directory: resolve(p[0], 'source'), files: p.slice(1), language: value('language') })
  } else if (command === 'asset' && p.length === 2 && value('spec')) {
    result = await registerImageAsset({ directory: resolve(p[0]), file: p[1], spec: await readJson(value('spec')!) })
  } else if (command === 'compare' && p.length === 3) {
    result = await compareImages({ source: p[0], rendered: p[1], directory: resolve(p[2]) })
  } else if ((command === 'init' || command === 'save') && p.length === 1 && value('document') && (command === 'init' ? value('spec') : value('revision'))) {
    result = await saveProject({ directory: resolve(p[0]), expectedRevision: command === 'init' ? null : value('revision')!, document: await readJson(value('document')!), spec: value('spec') ? await readJson(value('spec')!) : undefined })
  } else if (command === 'read' && p.length === 1) result = await readProject(resolve(p[0]))
  else if (command === 'check' && p.length === 1) {
    result = await checkProject(resolve(p[0])); if (!result.ok) process.exitCode = 2
  } else if (command === 'pack' && p.length === 2) result = await packProject(resolve(p[0]), resolve(p[1]))
  else if (command === 'unpack' && p.length === 2) result = await unpackProject(resolve(p[0]), resolve(p[1]))
  else if (command === 'upload' && p.length === 1 && value('prepared') && value('origin')) {
    result = await uploadCloudResource({ directory: resolve(p[0]), prepared: await readJson(value('prepared')!), appOrigin: value('origin')! })
  } else throw new Error(`invalid-arguments\n${help}`)
  console.log(JSON.stringify(result, null, 2))
}
main().catch((error: unknown) => {
  // Schema diagnostics may echo the signed input; never include them in terminal output.
  console.error(error instanceof Error && error.name !== 'ZodError' ? error.message : 'invalid-input')
  process.exitCode = 1
})
