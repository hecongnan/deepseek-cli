import { describe, expect, it } from 'vitest'
import { ScrollView, CURSOR_MARKER, stripTerminalSequences, type TUI } from '@earendil-works/pi-tui'
import { renderLayoutFrame } from '@earendil-works/pi-tui/dist/layout.js'
import { BoxedEditor } from '@/ui/editor.ts'
import { PromptBar } from '@/ui/prompt.ts'
import { SelectionPanel } from '@/ui/selection-panel.ts'
import { StatusBar } from '@/ui/status.ts'
import { surfaceLayout } from '@/ui/layout.ts'
import { TranscriptView } from '@/ui/view.ts'
import { TranscriptModel } from '@/transcript.ts'
import { MarkdownRenderer } from '@/ui/markdown.ts'
import { defaultKeymap } from '@/input/actions.ts'
import { createModalInput } from '@/surface/modal-input.ts'
import { fixture, scriptedPicker, ESCAPE } from './fixtures/modal-input.ts'
import { theme, mouse } from './fixtures/transcript-view.ts'

const empty = { render: () => [], invalidate: () => {} }
const card = { note: undefined, title: 'model · current deepseek/flash', filter: '', rows: [{ label: 'DeepSeek Flash', current: true, description: '当前' }], hint: '↑↓ 选择 · Enter 确认 · Esc 返回', above: 0, below: 0 }

describe('reference conversation layout', () => {
  it('keeps the whale and exchange above ruled input and a searchable panel below it', () => {
    const model = new TranscriptModel()
    model.apply({ type: 'user/message', data: { content: [{ type: 'text', text: '你现在是什么模型' }], source: { kind: 'user' } } })
    model.apply({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '我现在使用 DeepSeek。' }] } } })
    const view = new TranscriptView(model, theme, new MarkdownRenderer(theme.markdown), { presentation: 'codex', welcome: () => ({ activity: 'idle', cwd: '/project', model: 'flash', chord: undefined, back: undefined, elapsedMs: undefined, provider: undefined, effort: undefined, agentPreset: undefined, preset: undefined, contextTokens: undefined, contextWindow: undefined, cacheRate: undefined, uncachedInputTokens: undefined, outputTokens: undefined, home: undefined }) })
    const terminal = { rows: 42, columns: 80 }
    const tui = { terminal, requestRender: () => {} } as unknown as TUI
    const editor = new BoxedEditor(tui, theme.editor, defaultKeymap, undefined, text => text, line => line)
    editor.setText('保留草稿')
    const status = new StatusBar(() => ({ activity: 'idle', cwd: '/project', model: 'flash', chord: undefined, back: undefined, elapsedMs: undefined, provider: undefined, effort: undefined, agentPreset: undefined, preset: undefined, contextTokens: 2000, contextWindow: 10000, cacheRate: undefined, uncachedInputTokens: undefined, inputTokens: 1000, outputTokens: 300, home: undefined }), theme)
    const root = surfaceLayout({ transcript: new ScrollView(view, { primary: true, follow: 'end' }), dock: empty, queue: empty, prompt: new PromptBar(editor), controls: new SelectionPanel(() => card, theme), promptMinRows: 3, status })
    const lines = renderLayoutFrame(root, 80, 42, () => {}).lines.map(stripTerminalSequences)
    expect(lines.join('\n')).toContain('DeepSeek CLI')
    const question = lines.findIndex(line => line.includes('> 你现在是什么模型'))
    const answer = lines.findIndex(line => line.includes('我现在使用 DeepSeek。'))
    const draft = lines.findIndex(line => line.includes('保留草稿'))
    const panel = lines.findIndex(line => line.includes('切换模型'))
    expect(question).toBeLessThan(answer); expect(answer).toBeLessThan(draft); expect(draft).toBeLessThan(panel)
    expect(lines[draft - 1]).toBe('─'.repeat(80)); expect(lines[draft + 1]).toBe('─'.repeat(80))
    expect(lines[draft + 2]).toContain('flash · 上下文剩余 80% · Token 入1.0k / 出300')
    expect(draft + 2).toBeLessThan(panel)
    expect(lines.join('\n')).toContain('搜索：')
    for (const height of [1, 2, 3, 10]) {
      terminal.rows = height
      const small = renderLayoutFrame(root, 80, height, () => {}).lines
      expect(small.some(line => line.includes('保留草稿'))).toBe(true)
      expect(editor.getText()).toBe('保留草稿')
    }
  })

  it('routes even popup requests to the lower region and cancels without touching the draft', async () => {
    const given = fixture(); given.editor.text = 'unsent draft'
    const modals = createModalInput(given.ctx, { ...given.ports, belowPromptPickers: true })
    const picker = scriptedPicker(); const selected = modals.openPicker(picker, undefined, 'popup')
    expect(given.overlays).toHaveLength(0)
    expect(modals.pickerCard()).toBeDefined()
    picker.action = { kind: 'cancel' }; modals.handleKey(ESCAPE)
    await expect(selected).resolves.toBeUndefined()
    expect(given.editor.text).toBe('unsent draft')
    expect(given.editor.disableSubmit).toBe(false)
    expect(modals.pickerCard()).toBeUndefined()
  })

  it('positions the real search cursor after escaped filter text and empties on dismissal', () => {
    let current: typeof card | undefined = { ...card, filter: 'deepseek' }
    const panel = new SelectionPanel(() => current, theme)
    const search = panel.render(40).find(line => line.includes(CURSOR_MARKER))
    expect(search).toContain(`deepseek${CURSOR_MARKER}`)
    current = undefined; expect(panel.render(40)).toEqual([])
  })

  it('opens reasoning at its visible row beneath the retained welcome header', () => {
    const model = new TranscriptModel()
    model.apply({ type: 'assistant/message', data: { message: { content: [
      { type: 'reasoning', text: 'First thought\nSecond thought' },
      { type: 'text', text: 'Answer' },
    ] } } })
    const view = new TranscriptView(model, theme, new MarkdownRenderer(theme.markdown), {
      presentation: 'codex',
      welcome: () => ({ activity: 'idle', cwd: '/project', model: 'flash', chord: undefined, back: undefined, elapsedMs: undefined, provider: undefined, effort: undefined, agentPreset: undefined, preset: undefined, contextTokens: undefined, contextWindow: undefined, cacheRate: undefined, uncachedInputTokens: undefined, outputTokens: undefined, home: undefined }),
    })
    const folded = view.render(60)
    expect(folded.join('\n')).toContain('First thought')
    expect(folded.join('\n')).not.toContain('Second thought')
    expect(view.handleMouse(mouse('click', 'left', 0))).toBeUndefined()
    const summary = folded.findIndex(line => line.includes('reasoning ·'))
    expect(view.handleMouse(mouse('click', 'left', summary))).toEqual({ handled: true, render: true })
    expect(view.render(60).join('\n')).toContain('Second thought')
  })
})
