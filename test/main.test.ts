import {expect, test} from 'bun:test'

const {default: focusChatTemplate} = await import('#src/main.ts')

test('should run', () => {
  const result = focusChatTemplate()
  expect(result).toBe('focus-chat-template') // TODO Test actual functionality
})
