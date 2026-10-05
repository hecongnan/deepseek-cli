/** What one submitted editor line asks the surface to do. */
export type Submission =
  | { readonly kind: 'empty' }
  | { readonly kind: 'quit' }
  | { readonly kind: 'clear' }
  | { readonly kind: 'help'; readonly argument?: string }
  | { readonly kind: 'commands' }
  | { readonly kind: 'permissions' }
  | { readonly kind: 'local-info'; readonly command: 'doctor' | 'config' | 'diff' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'status' }
  | { readonly kind: 'model'; readonly argument: string }
  | { readonly kind: 'plugin-action'; readonly id: string }
  | { readonly kind: 'preset'; readonly argument: string }
  | { readonly kind: 'jobs'; readonly argument: string }
  | { readonly kind: 'rename'; readonly title: string }
  | { readonly kind: 'export'; readonly path: string }
  | { readonly kind: 'subagents'; readonly argument: string }
  | { readonly kind: 'fork'; readonly title: string }
  | { readonly kind: 'new'; readonly title: string }
  /** Steps the transcript back over the newest prompt without deleting it. */
  | { readonly kind: 'undo' }
  /** Steps the transcript forward again after an undo. */
  | { readonly kind: 'redo' }
  | { readonly kind: 'reload' }
  | { readonly kind: 'todo' }
  | { readonly kind: 'theme'; readonly argument: string }
  | { readonly kind: 'keys'; readonly argument: string }
  | { readonly kind: 'copy' }
  | { readonly kind: 'plan' }
  | { readonly kind: 'history'; readonly argument: string }
  | { readonly kind: 'stash'; readonly argument: string }
  /** The chord: park whatever the editor is holding, which a typed command cannot do. */
  | { readonly kind: 'stash-draft' }
  /**
   * The chord: edit the draft in the reader's own editor.
   *
   * Typed, this would be a command whose own line is already consumed by the
   * time it runs, so the chord is the only way to hand over the draft in hand.
   */
  | { readonly kind: 'editor' }
  | { readonly kind: 'stash-pop'; readonly selector: string }
  | { readonly kind: 'stash-apply'; readonly selector: string }
  | { readonly kind: 'stash-list' }
  | { readonly kind: 'stash-drop'; readonly selector: string }
  | { readonly kind: 'stash-clear' }
  | { readonly kind: 'command'; readonly name: string; readonly line: string }
  | { readonly kind: 'prompt'; readonly text: string }

/** Commands the surface answers itself, without a model turn. */
export const LOCAL_COMMANDS = [
  '/review', '/init', '/permissions', '/approvals', '/keymap', '/ps', '/agent', '/plan', '/screen-clear',
  '/commands', '/doctor', '/config', '/diff', '/help', '/status', '/model', '/preset', '/todo', '/theme', '/keys', '/jobs', '/subagents', '/fork', '/new', '/reload', '/undo', '/redo', '/rename', '/export', '/copy', '/history', '/clear', '/resume', '/quit', '/exit',
  '/stash', '/stash-pop', '/stash-apply', '/stash-list', '/stash-drop', '/stash-clear',
] as const

/** What each local command does, shown in the editor's completion menu. */
export const LOCAL_COMMAND_DESCRIPTIONS: Readonly<Record<string, string>> = {
  '/review': '审查当前 Git 变更，输出问题和文件位置',
  '/init': '检查项目并生成 AGENTS.md 指南',
  '/doctor': '诊断运行环境与依赖',
  '/config': '查看配置文件位置',
  '/diff': '查看 Git 变更补丁',
  '/commands': '搜索并打开命令',
  '/help': '查看分组帮助',
  '/status': '模型、权限与用量',
  '/model': '切换模型与推理强度',
  '/preset': '选择代理模式',
  '/jobs': '查看、读取或停止后台任务',
  '/subagents': '查看、打开或停止子代理',
  '/todo': '查看任务列表',
  '/theme': '选择界面主题',
  '/keys': '搜索快捷键',
  '/fork': '分支当前会话',
  '/new': '开始新会话',
  '/reload': '重新载入会话配置',
  '/undo': '回退最近一轮',
  '/redo': '恢复已回退的一轮',
  '/copy': '复制最近回答',
  '/history': '提示词历史设置',
  '/rename': '修改会话标题',
  '/export': '导出 Markdown 对话',
  '/clear': '新建会话并清空显示',
  '/screen-clear': '仅清空显示，保留上下文',
  '/permissions': '查看或切换权限策略',
  '/approvals': '权限命令兼容别名',
  '/keymap': '查看和搜索快捷键',
  '/ps': '查看、读取或停止后台任务',
  '/agent': '查看、打开或停止子代理',
  '/plan': '切换计划模式',
  '/resume': '恢复历史会话',
  '/stash': '保存提示词草稿',
  '/stash-pop': '取出草稿',
  '/stash-apply': '载入并保留草稿',
  '/stash-list': '选择已存草稿',
  '/stash-drop': '删除一个草稿',
  '/stash-clear': '确认后清空草稿库',
  '/quit': '退出并显示恢复命令',
  '/exit': '退出并显示恢复命令',
}

/**
 * Classify one submitted line.
 *
 * Deciding this in one pure place keeps the plugin's wiring a switch instead of
 * a chain of string comparisons, and a slash line that is not a local command
 * is still routed as a command rather than guessed at by the model.
 */
export function classifySubmission(text: string): Submission {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'empty' }
  if (trimmed === '/quit' || trimmed === '/exit') return { kind: 'quit' }
  if (trimmed === '/clear') return { kind: 'new', title: '' }
  if (trimmed === '/screen-clear') return { kind: 'clear' }
  if (trimmed === '/plan') return { kind: 'plan' }
  if (trimmed === '/review' || trimmed.startsWith('/review ')) return {
    kind: 'prompt', text: `请审查当前工作区的 Git 已暂存、未暂存变更及相关未跟踪代码。仅进行只读检查，不修改文件、不提交。优先报告明确可复现的缺陷，标明优先级、文件和行号；没有问题时说明检查范围和未验证项。额外要求：${trimmed.slice(7).trim() || '无'}`,
  }
  if (trimmed === '/init') return {
    kind: 'prompt', text: '请检查当前项目的结构、现有文档和开发命令，编写适合本项目的 AGENTS.md，包含构建、验证和代码规范。先读取已有 AGENTS.md；如果它已存在且内容完整，保留它并报告建议，不覆盖用户已有指令。不要猜测未验证的命令，不修改其他文件。',
  }

  const alias = /^\/(permissions|approvals|keymap|ps|agent)(?:\s+(.*))?$/su.exec(trimmed)
  if (alias !== null) {
    const argument = alias[2]?.trim() ?? ''
    switch (alias[1]) {
      case 'permissions': case 'approvals': return argument === '' ? { kind: 'permissions' } : { kind: 'command', name: 'permission', line: `/permission ${argument}` }
      case 'keymap': return { kind: 'keys', argument }
      case 'ps': return { kind: 'jobs', argument }
      case 'agent': return { kind: 'subagents', argument }
    }
  }
  if (trimmed === '/doctor' || trimmed === '/config' || trimmed === '/diff') return { kind: 'local-info', command: trimmed.slice(1) as 'doctor' | 'config' | 'diff' }
  if (trimmed === '/commands') return { kind: 'commands' }
  if (trimmed === '/help') return { kind: 'help' }
  if (trimmed.startsWith('/help ')) return { kind: 'help', argument: trimmed.slice(5).trim() }
  if (trimmed === '/resume') return { kind: 'resume' }
  if (trimmed === '/status') return { kind: 'status' }
  if (trimmed === '/model' || trimmed.startsWith('/model ')) {
    return { kind: 'model', argument: trimmed.slice('/model'.length).trim() }
  }
  if (trimmed === '/preset' || trimmed.startsWith('/preset ')) {
    return { kind: 'preset', argument: trimmed.slice('/preset'.length).trim() }
  }
  if (trimmed === '/jobs' || trimmed.startsWith('/jobs ')) {
    return { kind: 'jobs', argument: trimmed.slice('/jobs'.length).trim() }
  }
  if (trimmed === '/rename' || trimmed.startsWith('/rename ')) {
    return { kind: 'rename', title: trimmed.slice('/rename'.length).trim() }
  }
  if (trimmed === '/export' || trimmed.startsWith('/export ')) {
    return { kind: 'export', path: trimmed.slice('/export'.length).trim() }
  }
  if (trimmed === '/subagents' || trimmed.startsWith('/subagents ')) {
    return { kind: 'subagents', argument: trimmed.slice('/subagents'.length).trim() }
  }
  if (trimmed === '/fork' || trimmed.startsWith('/fork ')) {
    return { kind: 'fork', title: trimmed.slice('/fork'.length).trim() }
  }
  if (trimmed === '/undo') return { kind: 'undo' }
  if (trimmed === '/redo') return { kind: 'redo' }
  if (trimmed === '/todo') return { kind: 'todo' }
  if (trimmed === '/theme' || trimmed.startsWith('/theme ')) {
    return { kind: 'theme', argument: trimmed.slice('/theme'.length).trim() }
  }
  if (trimmed === '/keys' || trimmed.startsWith('/keys ')) {
    return { kind: 'keys', argument: trimmed.slice('/keys'.length).trim() }
  }
  if (trimmed === '/copy') return { kind: 'copy' }
  if (trimmed === '/history' || trimmed.startsWith('/history ')) {
    return { kind: 'history', argument: trimmed.slice('/history'.length).trim() }
  }
  if (trimmed === '/new' || trimmed.startsWith('/new ')) {
    return { kind: 'new', title: trimmed.slice('/new'.length).trim() }
  }
  if (trimmed === '/reload') return { kind: 'reload' }
  if (trimmed === '/stash-pop' || trimmed.startsWith('/stash-pop ')) {
    return { kind: 'stash-pop', selector: trimmed.slice('/stash-pop'.length).trim() }
  }
  if (trimmed === '/stash-apply' || trimmed.startsWith('/stash-apply ')) {
    return { kind: 'stash-apply', selector: trimmed.slice('/stash-apply'.length).trim() }
  }
  if (trimmed === '/stash-list') return { kind: 'stash-list' }
  if (trimmed === '/stash-drop' || trimmed.startsWith('/stash-drop ')) {
    return { kind: 'stash-drop', selector: trimmed.slice('/stash-drop'.length).trim() }
  }
  if (trimmed === '/stash-clear') return { kind: 'stash-clear' }
  if (trimmed === '/stash' || trimmed.startsWith('/stash ')) {
    return { kind: 'stash', argument: trimmed.slice('/stash'.length).trim() }
  }
  if (trimmed.startsWith('/')) {
    const [head = ''] = trimmed.slice(1).split(/\s+/u, 1)
    const name = head.toLowerCase()
    return name === '' ? { kind: 'empty' } : { kind: 'command', name, line: trimmed }
  }
  return { kind: 'prompt', text: trimmed }
}
