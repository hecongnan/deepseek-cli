import { ListPicker, type PickerCard } from './picker.ts'
import { hintKeys, type Keymap } from '../input/actions.ts'
import { LOCAL_COMMANDS, LOCAL_COMMAND_DESCRIPTIONS } from '../input/submission.ts'
import type { RegisteredCommand } from '../input/completion.ts'

export interface CommandRow { readonly name: string; readonly description: string; readonly group: string }
const groups: Readonly<Record<string, readonly string[]>> = {
  '会话': ['new', 'resume', 'fork', 'rename', 'reload', 'undo', 'redo', 'export'],
  '模型与工作': ['review', 'init', 'permissions', 'approvals', 'ps', 'agent', 'model', 'preset', 'plan', 'compact', 'goal', 'todo', 'jobs', 'subagents', 'status'],
  '输入与草稿': ['copy', 'history', 'stash', 'stash-pop', 'stash-apply', 'stash-list', 'stash-drop', 'stash-clear'],
  '界面': ['doctor', 'config', 'diff', 'commands', 'help', 'keys', 'keymap', 'theme', 'clear', 'screen-clear', 'quit', 'exit'],
}
const shortDescriptions: Readonly<Record<string, string>> = {
  '/review': '审查当前 Git 变更（使用 DeepSeek）', '/init': '检查并编写项目 AGENTS.md',
  '/permissions': '查看或切换权限策略', '/approvals': '权限命令兼容别名', '/keymap': '查看和搜索快捷键',
  '/ps': '查看、读取或停止后台任务', '/agent': '查看、打开或停止子代理', '/plan': '切换计划模式', '/screen-clear': '仅清空显示，保留上下文',
  '/commands': '搜索并打开命令', '/doctor': '诊断运行环境与依赖', '/config': '查看配置文件位置', '/diff': '查看 Git 变更补丁',
  '/help': '查看分组帮助', '/status': '模型、权限与用量', '/model': '切换模型与推理强度', '/preset': '选择代理模式',
  '/new': '开始新会话', '/resume': '恢复历史会话', '/fork': '分支当前会话', '/rename': '修改会话标题', '/reload': '重新载入会话配置',
  '/undo': '回退最近一轮', '/redo': '恢复已回退的一轮', '/export': '导出 Markdown 对话', '/copy': '复制最近回答',
  '/todo': '查看任务列表', '/jobs': '查看、读取或停止后台任务', '/subagents': '查看、打开或停止子代理',
  '/theme': '选择界面主题', '/keys': '搜索快捷键', '/clear': '新建会话并清空显示', '/history': '提示词历史设置',
  '/stash': '保存提示词草稿', '/stash-pop': '取出草稿', '/stash-apply': '载入并保留草稿', '/stash-list': '选择已存草稿',
  '/stash-drop': '删除一个草稿', '/stash-clear': '确认后清空草稿库', '/quit': '退出并显示恢复命令', '/exit': '退出并显示恢复命令',
}
export function commandRows(registered: readonly RegisteredCommand[]): CommandRow[] {
  const rows = new Map<string, CommandRow>()
  for (const name of LOCAL_COMMANDS) rows.set(name, { name, description: shortDescriptions[name] ?? LOCAL_COMMAND_DESCRIPTIONS[name] ?? '', group: groupOf(name) })
  // Surface commands deliberately shadow host commands such as browser export.
  for (const command of registered) {
    const name = `/${command.name}`
    if (!rows.has(name)) rows.set(name, { name, description: command.description ?? 'Harness command', group: groupOf(name) })
  }
  return [...rows.values()]
}
function groupOf(name: string): string {
  return Object.entries(groups).find(([, names]) => names.includes(name.slice(1)))?.[0] ?? '扩展'
}
export function groupedHelp(registered: readonly RegisteredCommand[], query = ''): string {
  const needle = query.trim().toLocaleLowerCase()
  const rows = commandRows(registered).filter(row => `${row.name} ${row.description} ${row.group}`.toLocaleLowerCase().includes(needle))
  if (!rows.length) return `没有匹配的命令：${query} · /commands 搜索全部命令`
  const sections = [...new Set(rows.map(row => row.group))].map(group => {
    const lines = rows.filter(row => row.group === group).map(row => `  ${row.name.padEnd(14)} ${row.description}`)
    return [group, ...lines].join('\n')
  })
  return ['DeepSeek CLI · 命令指南', 'Ctrl+Shift+P / Ctrl+X → K 打开命令面板 · /help <关键词> 筛选', ...sections].join('\n\n')
}
/** Keep a searchable reference compact enough to leave the conversation in view. */
const COMMAND_WINDOW = 8
export class CommandPicker extends ListPicker<CommandRow> {
  override card(window = COMMAND_WINDOW): PickerCard {
    return super.card(Math.min(window, COMMAND_WINDOW))
  }
  constructor(source: () => readonly CommandRow[], map: () => Keymap) {
    super(source, () => '命令面板 · 搜索名称、用途或分类', row => row.name,
      row => ({ label: row.name, description: `${row.group} · ${row.description}`, current: false }),
      row => `${row.name} ${row.description} ${row.group}`, {
        empty: () => '没有匹配项 · Backspace 修改搜索',
        listed: () => `↑↓ 选择 · ${hintKeys(map(), 'picker.confirm')} 打开 · ${hintKeys(map(), 'picker.cancel')} 返回 · 输入筛选`,
      }, map)
  }
}
