import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

export function configPaths(home = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'))) {
  return { home, profile: join(home, 'profiles/tui'), preferences: join(home, 'profiles/tui/cordis.patch.yml'), overrides: join(home, 'cordis.patch.yml'), credentials: join(home, '.credentials.yaml'), sessions: join(home, 'sessions'), themes: join(home, 'themes'), exports: join(home, 'exports') }
}
export interface HealthCheck { readonly name: string; readonly status: 'ok' | 'warn' | 'fail'; readonly detail: string }
export function localHealth(home?: string): HealthCheck[] {
  const paths = configPaths(home)
  const checks: HealthCheck[] = []
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
  checks.push({ name: 'Node.js', status: major > 22 || (major === 22 && minor >= 19) ? 'ok' : 'fail', detail: process.version })
  const manifest = join(paths.profile, 'package.json')
  if (!existsSync(manifest)) return [...checks, { name: 'TUI profile', status: 'fail', detail: `missing ${manifest}` }]
  try {
    const require = createRequire(manifest)
    const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { dependencies?: Record<string, string> }
    for (const name of ['@deepseek-ai/dsh', '@deepseek-ai/dsh-base', '@sagmans/dsh-tui']) {
      try { require.resolve(name === '@deepseek-ai/dsh' ? `${name}/profile-boot` : name); checks.push({ name, status: 'ok', detail: pkg.dependencies?.[name] ?? 'resolved' }) }
      catch { checks.push({ name, status: 'fail', detail: 'dependency is missing; restore the profile or install its pinned dependencies' }) }
    }
    const missing = Object.keys(pkg.dependencies ?? {}).filter(name => { try { require.resolve(name === '@deepseek-ai/dsh' ? `${name}/profile-boot` : name); return false } catch { return true } })
    checks.push({ name: 'Profile dependencies', status: missing.length ? 'fail' : 'ok', detail: missing.length ? missing.join(', ') : `${Object.keys(pkg.dependencies ?? {}).length} resolved` })
  } catch (error) { checks.push({ name: 'Profile manifest', status: 'fail', detail: String(error) }) }
  const credential = existsSync(paths.credentials) && statSync(paths.credentials).size > 0
  checks.push({ name: 'Credential source', status: credential || process.env.DEEPSEEK_API_KEY ? 'ok' : 'warn', detail: credential ? 'local credential store exists (contents hidden; authentication not tested)' : process.env.DEEPSEEK_API_KEY ? 'environment variable exists (value hidden)' : 'check provider credentials or project .env before sending a task' })
  checks.push({ name: 'Preferences', status: existsSync(paths.preferences) ? 'ok' : 'warn', detail: paths.preferences })
  checks.push({ name: 'Terminal', status: process.stdin.isTTY && process.stdout.isTTY ? 'ok' : 'warn', detail: process.stdin.isTTY && process.stdout.isTTY ? `${process.stdout.columns ?? '?'} columns · ${process.env.TERM ?? 'unknown'}` : 'piped shell: interactive mode requires a TTY; use dsh -p for scripts' })
  try { const git = execFileSync('git', ['--version'], { encoding: 'utf8', timeout: 2000 }).trim(); checks.push({ name: 'Git', status: 'ok', detail: git }) }
  catch { checks.push({ name: 'Git', status: 'warn', detail: 'git is unavailable' }) }
  return checks
}
export function formatHealth(checks: readonly HealthCheck[]): string {
  return ['DeepSeek CLI · 本地诊断（不请求模型）', ...checks.map(check => `${check.status === 'ok' ? '✓' : check.status === 'warn' ? '!' : '✗'} ${check.name}: ${check.detail}`)].join('\n')
}
export function workspaceChanges(cwd = process.cwd()): string {
  try {
    const git = (args: string[]) => {
      try { return execFileSync('git', ['--no-pager', ...args], { cwd, encoding: 'utf8', timeout: 3000, maxBuffer: 256 * 1024 }).trim() }
      catch (error) {
        const result = error as { code?: string; stdout?: string | Buffer }
        if (result.code === 'ENOBUFS' && result.stdout !== undefined) return `${String(result.stdout).slice(0, 14000)}\n… 补丁超过缓冲上限；在终端运行 git diff 查看完整内容。`
        throw error
      }
    }
    const status = git(['status', '--short'])
    if (!status) return '工作区没有待提交的变更。'
    const diffArgs = ['--no-ext-diff', '--no-textconv', '--color=never']
    const text = ['工作区变更（含未跟踪文件名）', status, '未暂存补丁', git(['diff', ...diffArgs]) || '无', '已暂存补丁', git(['diff', '--cached', ...diffArgs]) || '无'].join('\n')
    return text.length <= 14000 ? text : `${text.slice(0, 14000)}\n… 补丁超过显示上限；在终端运行 git diff 查看完整内容。`
  } catch { return '无法读取 Git 变更；请在 Git 仓库中使用 /diff。' }
}
