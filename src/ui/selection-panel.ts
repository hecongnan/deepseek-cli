import { CURSOR_MARKER, type Component, wrapTextWithAnsi } from '@earendil-works/pi-tui'
import type { PickerCard } from './picker.ts'
import type { TuiTheme } from '../theme.ts'

/** Menus stay beside their input, outside the scrollable conversation. */
export class SelectionPanel implements Component {
  constructor(private readonly card: () => PickerCard | undefined, private readonly theme: TuiTheme) {}

  invalidate(): void {}

  render(width: number): string[] {
    const card = this.card()
    if (width <= 0 || card === undefined) return []
    const cut = (text: string, token: 'picker.title' | 'picker.row' | 'picker.rowCurrent' | 'picker.hint' | 'picker.note') =>
      this.theme.cut(this.theme.rich(text, { token }), width, '…')
    const title = card.title.startsWith('model ·') ? '切换模型' : card.title.startsWith('reasoning effort ·') ? '推理强度' : card.title
    const lines = [cut(title, 'picker.title'), '', `${cut(`  搜索：${card.filter}`, 'picker.row')}${CURSOR_MARKER}`, '']
    if (card.note) lines.push(cut(card.note, 'picker.note'))
    if (card.above > 0) lines.push(cut(`  ↑ 还有 ${card.above} 项`, 'picker.hint'))
    for (const row of card.rows) {
      const label = `${row.current ? '> ' : '  '}${row.label}${row.description ? `  ${row.description}` : ''}`
      lines.push(cut(label, row.current ? 'picker.rowCurrent' : 'picker.row'))
    }
    if (card.below > 0) lines.push(cut(`  ↓ 还有 ${card.below} 项`, 'picker.hint'))
    lines.push('', ...wrapTextWithAnsi(this.theme.rich(card.hint, { token: 'picker.hint' }), width))
    return lines
  }
}
