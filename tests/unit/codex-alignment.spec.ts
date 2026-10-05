import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { visibleWidth } from '@earendil-works/pi-tui'
import { CommandPicker, commandRows } from '@/ui/command-picker.ts'
import { defaultKeymap } from '@/input/actions.ts'
import { classifySubmission } from '@/input/submission.ts'
import { TranscriptModel } from '@/transcript.ts'
import { TranscriptView } from '@/ui/view.ts'
import { MarkdownRenderer } from '@/ui/markdown.ts'
import { workspaceChanges } from '@/local-diagnostics.ts'
import { toolDisplayFor, toolDisplayTable } from '@/tool-display.ts'
import { bashPresenter, theme, toolCall, toolResult, COLLAPSED, OPEN } from './fixtures/transcript-view.ts'

const tools = toolDisplayTable({ default: { collapsed: true, output: 'hidden' }, bash: { output: 'tail', tail: 2 } })
function view(model: TranscriptModel, expanded = false) {
  return new TranscriptView(model, theme, new MarkdownRenderer(theme.markdown), {
    presentation: 'codex', state: () => expanded ? OPEN : COLLAPSED,
    toolDisplay: tool => toolDisplayFor(tools, tool),
  })
}
describe('Codex command and output alignment', () => {
  it('preserves alias arguments and keeps permission changes on the real permission command', () => {
    expect(classifySubmission('/permissions workspace-write')).toEqual({ kind: 'command', name: 'permission', line: '/permission workspace-write' })
    expect(classifySubmission('/approvals')).toEqual({ kind: 'permissions' })
    expect(classifySubmission('/keymap surface')).toEqual({ kind: 'keys', argument: 'surface' })
    expect(classifySubmission('/ps kill job1')).toEqual({ kind: 'jobs', argument: 'kill job1' })
    expect(classifySubmission('/agent open last')).toEqual({ kind: 'subagents', argument: 'open last' })
    expect(classifySubmission('/unknown task')).toEqual({ kind: 'command', name: 'unknown', line: '/unknown task' })
  })
  it('keeps the command reference compact while every command remains reachable', () => {
    const rows = commandRows([])
    const picker = new CommandPicker(() => rows, defaultKeymap)
    expect(picker.card(100).rows.length).toBeLessThanOrEqual(8)
    for (let step = 0; step < 20; step++) picker.handleKey('\x1b[B')
    const card = picker.card(100)
    expect(card.rows.find(row => row.current)?.label).toBe(rows[20]!.name)
    expect(card.above).toBeGreaterThan(0)
    for (const character of 'review') picker.handleKey(character)
    expect(picker.card().rows[0]?.label).toBe('/review')
  })
  it('keeps commands whole, folds output honestly and hides successful exit boilerplate', () => {
    const model = new TranscriptModel(bashPresenter)
    const command = 'printf 中文输出 && echo very-long-command-at-terminal-edge'
    model.apply(toolCall(JSON.stringify({ command })))
    expect(view(model).render(80).join('\n')).toContain('Running')
    model.apply(toolResult('first\nsecond\nthird'))
    const folded = view(model).render(80).join('\n')
    expect(folded).toContain(`• Ran ${command}`)
    expect(folded).toContain('  └ second\n    third')
    expect(folded).toContain('1 earlier line')
    expect(folded).toContain('ctrl+shift+o')
    expect(folded).not.toContain('exit 0')
    expect(view(model, true).render(80).join('\n')).toContain('  └ first')
    for (const width of [1, 2, 10, 30]) expect(view(model).render(width).every(row => visibleWidth(row) <= width)).toBe(true)
    expect(view(model).render(30).join('').replace(/\s/gu, '')).toContain(command.replace(/\s/gu, ''))
  })
  it('keeps errors visible even when ordinary output is hidden', () => {
    const model = new TranscriptModel(bashPresenter)
    model.apply(toolCall('{"command":"missing-command"}'))
    model.apply({ type: 'tool/result', data: { message: { content: [{ type: 'tool-result', toolCallId: 'c1', text: 'command not found' }], isError: true } } })
    const result = view(model).render(80).join('\n')
    expect(result).toContain('Failed missing-command')
    expect(result).toContain('command not found')
    expect(result).toContain('exit 1')
  })
  it('copies conversation content without decorative role markers', () => {
    const model = new TranscriptModel()
    model.apply({ type: 'user/message', data: { content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } } })
    model.apply({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'answer\nnext line' }] } } })
    const screen = view(model)
    expect(screen.render(80).join('\n')).toContain('> hello')
    expect(screen.render(80).join('\n')).toContain('  answer')
    const content = screen.copyRows().map(row => row.frame ? row.drawn.slice(row.frame.lead) : row.drawn).join('\n')
    expect(content).toContain('hello')
    expect(content).toContain('answer')
    expect(content).not.toMatch(/[›•]/u)
  })
  it('shows staged and unstaged patches, and names untracked files without reading their contents', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dsh-diff-'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' })
    try {
      git('init'); writeFileSync(join(cwd, 'tracked.txt'), 'old\n'); git('add', '.');
      git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'fixture')
      writeFileSync(join(cwd, 'tracked.txt'), 'staged\n'); git('add', '.');
      writeFileSync(join(cwd, 'tracked.txt'), 'unstaged\n')
      writeFileSync(join(cwd, 'untracked.txt'), 'private-untracked-content')
      const text = workspaceChanges(cwd)
      expect(text).toContain('+staged'); expect(text).toContain('+unstaged')
      expect(text).toContain('untracked.txt'); expect(text).not.toContain('private-untracked-content')
    } finally { rmSync(cwd, { recursive: true, force: true }) }
  })
})
