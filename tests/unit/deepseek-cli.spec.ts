import { describe, it, expect } from 'vitest'
import { commandRows, CommandPicker, groupedHelp } from '@/ui/command-picker.ts'
import { defaultKeymap } from '@/input/actions.ts'
import { classifySubmission } from '@/input/submission.ts'
import { chordBindings } from '@/input/keymap.ts'
import { StatusBar } from '@/ui/status.ts'
import { welcomeRows } from '@/ui/welcome.ts'
import { createTheme } from '@/theme.ts'
import { visibleWidth } from '@earendil-works/pi-tui'
import type { StatusFacts } from '@/ui/status.ts'
import { parseSettings } from '@/theme-settings.ts'

const facts = { model: 'deepseek-v4-pro', agentPreset: 'ptc', cwd: '/tmp', activity: 'idle' } as StatusFacts

describe('DeepSeek local edition', () => {
  it('filters and deduplicates surface and registry commands', () => {
    const registered = [{ name: 'export', description: 'browser export' }, { name: 'compact', description: 'compress context' }]
    const rows = commandRows(registered)
    expect(rows.filter(row => row.name === '/export')).toHaveLength(1)
    expect(rows.find(row => row.name === '/export')?.description).not.toBe('browser export')
    expect(groupedHelp(registered, 'compact')).toContain('compress context')
    expect(groupedHelp([], 'nonexistent')).toContain('没有匹配')
  })
  it('searches palette and returns a selection without running a model', () => {
    const picker = new CommandPicker(() => commandRows([]), defaultKeymap)
    for (const key of 'doctor') picker.handleKey(key)
    expect(picker.visible().map(row => row.name)).toContain('/doctor')
    expect(picker.handleKey('\r')).toEqual({ kind: 'pick', id: '/doctor' })
    expect(new CommandPicker(() => commandRows([]), defaultKeymap).handleKey('\x1b')).toEqual({ kind: 'cancel' })
  })
  it('routes palette, filtered help and diagnostics locally', () => {
    expect(classifySubmission('/commands')).toEqual({ kind: 'commands' })
    expect(classifySubmission('/help 会话')).toEqual({ kind: 'help', argument: '会话' })
    expect(classifySubmission('/diff')).toEqual({ kind: 'local-info', command: 'diff' })
    expect(chordBindings(defaultKeymap()).find(binding => binding.key === 'k')?.submission).toEqual({ kind: 'commands' })
  })
  it('keeps rendered welcome within narrow, standard and wide terminals', () => {
    for (const width of [1, 20, 40, 80, 120]) {
      const rows = welcomeRows(width, createTheme('none'), facts, defaultKeymap())
      expect(rows.every(row => visibleWidth(row) <= width)).toBe(true)
    }
    expect(welcomeRows(100, createTheme('none'), facts, defaultKeymap())).toHaveLength(5)
    expect(welcomeRows(100, createTheme('none'), facts, defaultKeymap()).join('\n')).toMatch(/[\u2801-\u28ff]/u)
  })
  it('keeps persistent metrics concise and puts work feedback on a separate row', () => {
    let state = { ...facts, contextTokens: 2000, contextWindow: 10000, inputTokens: 1500, outputTokens: 500, cacheRate: 0.9 }
    const status = new StatusBar(() => state, createTheme('none'))
    expect(status.render(100)).toHaveLength(1)
    expect(status.render(100)[0]).toContain('deepseek-v4-pro · 上下文剩余 80% · Token 入1.5k / 出500 · 缓存90%')
    state = { ...state, activity: 'working', elapsedMs: 22000, contextTokens: 9000 }
    expect(status.render(100).join('')).toContain('正在处理 · 22s')
    expect(status.render(100)[0]).toContain('上下文剩余 10%')
    expect(status.render(100)).toHaveLength(2)
    expect(status.render(100).join('')).toContain('ctrl+c 停止')
  })
  it('accepts deep-frozen nested settings without mutating the config host', () => {
    const section = Object.freeze({ spacing: Object.freeze({ padding: 1 }), tools: Object.freeze({ default: Object.freeze({ collapsed: true, output: 'hidden' }) }) })
    expect(() => parseSettings(section)).not.toThrow()
    expect(section.spacing).toEqual({ padding: 1 })
  })
})
