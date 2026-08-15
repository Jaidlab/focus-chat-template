import {access, mkdir, readdir, readFile, writeFile} from 'node:fs/promises'
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
const tempDir = join(root, 'temp')
const baseFile = join(tempDir, 'chat_template.jinja')
const outputDir = join(root, 'dist')
const outputFile = join(outputDir, 'chat_template.jinja')
const baseUrl = 'https://huggingface.co/Qwen/Qwen3.8-27B/resolve/1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0/chat_template.jinja'
const patchNames = (await readdir(sourceDir))
  .filter(name => name.startsWith('chat.jinja.') && name.endsWith('.patch'))
  .sort()

try {
  await access(baseFile)
} catch {
  const response = await fetch(baseUrl)
  if (!response.ok) {
    throw new Error(`Failed to download Qwen 3.8 chat template: HTTP ${response.status} ${response.statusText}`)
  }
  await mkdir(tempDir, {recursive: true})
  await writeFile(baseFile, await response.text())
  console.log('Downloaded Qwen 3.8 chat template to temp/chat_template.jinja.')
}

let template = await readFile(baseFile, 'utf8')
for (const patchName of patchNames) {
  template = applyPatch(template, await readFile(join(sourceDir, patchName), 'utf8'), patchName)
}

await mkdir(outputDir, {recursive: true})
await writeFile(outputFile, template)
console.log(`Built dist/chat_template.jinja from temp/chat_template.jinja with ${patchNames.length} patches.`)
