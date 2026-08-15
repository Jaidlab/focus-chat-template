import {expect, test} from 'bun:test'
import {readFile} from 'node:fs/promises'
import {join, resolve} from 'node:path'

const root = resolve(import.meta.dir, '..')

test('builds the layered template', async () => {
  const build = Bun.spawnSync([process.execPath, 'scripts/build.ts'], {cwd: root})
  expect(build.exitCode).toBe(0)

  const source = await readFile(join(root, 'temp/chat_template.jinja'), 'utf8')
  const output = await readFile(join(root, 'dist/chat_template.jinja'), 'utf8')

  expect(source).toContain("resolved_reasoning_effort = reasoning_effort|default('xhigh')")
  expect(source).toContain("resolved_reasoning_effort not in ('xhigh', 'medium', 'low')")

  expect(output).toContain("_preserve_thinking = preserve_thinking if preserve_thinking is defined else true")
  expect(output).toContain("message.role == 'system' or message.role == 'developer'")
  expect(output).toContain("call.arguments is defined and call.arguments is string and call.arguments")
  expect(output).toContain('continue_final_message is defined and continue_final_message')
  expect(output).toContain("'[image]'")
  expect(output).toContain("'[video]'")
  expect(output).not.toContain('<|image_pad|>')
  expect(output).not.toContain('<|video_pad|>')
})
