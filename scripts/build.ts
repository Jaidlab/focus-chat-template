import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

function applyPatch(source: string, patch: string, patchName: string) {
  const sourceHadFinalNewline = source.endsWith('\n')
  const sourceLines = source.replaceAll('\r\n', '\n').split('\n')
  if (sourceHadFinalNewline) {
    sourceLines.pop()
  }
  const patchLines = patch.replaceAll('\r\n', '\n').split('\n')
  const output: Array<string> = []
  let sourceIndex = 0
  let patchIndex = 0
  let hunkCount = 0

  while (patchIndex < patchLines.length) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(patchLines[patchIndex])
    if (!header) {
      patchIndex++
      continue
    }

    hunkCount++
    const oldStart = Number(header[1])
    const expectedOldCount = Number(header[2] ?? 1)
    const expectedNewCount = Number(header[4] ?? 1)
    const hunkSourceIndex = oldStart === 0 ? 0 : oldStart - 1
    if (hunkSourceIndex < sourceIndex) {
      throw new Error(`${patchName}: overlapping hunk at ${patchLines[patchIndex]}`)
    }

    output.push(...sourceLines.slice(sourceIndex, hunkSourceIndex))
    sourceIndex = hunkSourceIndex
    let oldCount = 0
    let newCount = 0
    patchIndex++

    while (patchIndex < patchLines.length && !patchLines[patchIndex].startsWith('@@ ')) {
      const line = patchLines[patchIndex]
      const marker = line[0]
      if (marker !== ' ' && marker !== '+' && marker !== '-' && marker !== '\\') {
        break
      }
      if (marker === '\\') {
        patchIndex++
        continue
      }

      const content = line.slice(1)
      if (marker === ' ' || marker === '-') {
        const actual = sourceLines[sourceIndex]
        if (actual !== content) {
          throw new Error(`${patchName}: context mismatch at source line ${sourceIndex + 1}: expected ${JSON.stringify(content)}, got ${JSON.stringify(actual)}`)
        }
        sourceIndex++
        oldCount++
      }
      if (marker === ' ' || marker === '+') {
        output.push(content)
        newCount++
      }
      patchIndex++
    }

    if (oldCount !== expectedOldCount || newCount !== expectedNewCount) {
      throw new Error(`${patchName}: hunk size mismatch: old ${oldCount}/${expectedOldCount}, new ${newCount}/${expectedNewCount}`)
    }
  }

  if (!hunkCount) {
    throw new Error(`${patchName}: no unified-diff hunks found`)
  }

  output.push(...sourceLines.slice(sourceIndex))
  return output.join('\n') + (sourceHadFinalNewline ? '\n' : '')
}

const root = resolve(import.meta.dir, '..')
const sourceDir = join(root, 'src')
const outputDir = join(root, 'dist')
const outputFile = join(outputDir, 'chat_template.jinja')
const patchNames = (await readdir(sourceDir))
  .filter(name => name.startsWith('chat.jinja.') && name.endsWith('.patch'))
  .sort()

let template = await readFile(join(sourceDir, 'chat.jinja'), 'utf8')
for (const patchName of patchNames) {
  template = applyPatch(template, await readFile(join(sourceDir, patchName), 'utf8'), patchName)
}

await mkdir(outputDir, {recursive: true})
await writeFile(outputFile, template)
console.log(`Built dist/chat_template.jinja from src/chat.jinja with ${patchNames.length} patches.`)
