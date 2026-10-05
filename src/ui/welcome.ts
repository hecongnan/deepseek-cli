import type { StatusFacts } from './status.ts'
import { shortPath } from './status.ts'
import type { Keymap } from '../input/actions.ts'
import type { TuiTheme } from '../theme.ts'
import { WHALE_ROWS } from './whale.ts'

/** A quiet introduction; commands and diagnostics belong behind explicit requests. */
export function welcomeRows(width: number, theme: TuiTheme, facts: StatusFacts, _map: Keymap): string[] {
  if (width < 1) return []
  const information = [
    'DeepSeek CLI',
    '欢迎回来',
    facts.model === undefined ? '正在载入…' : `${facts.model}${facts.effort ? ` (${facts.effort})` : ''}`,
    shortPath(facts.cwd, facts.home),
    '',
  ]
  if (width < 48) return information.slice(0, 4).map((text, index) =>
    theme.cut(theme.rich(text, { token: index === 0 ? 'markdown.heading' : 'status.cwd' }), width))
  return WHALE_ROWS.map((row, index) => theme.cut(
    theme.style('markdown.heading', row) + '   ' +
    theme.rich(information[index] ?? '', { token: index === 0 ? 'markdown.heading' : 'status.cwd' }), width))
}
