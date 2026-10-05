#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { configPaths, localHealth, formatHealth } from '../lib/local-diagnostics.js';
import { classifySubmission } from '../lib/input/submission.js';
import { listSessions, resolveSession } from './sessions.mjs';
export const EDITION = '1.2.1-local';
const HELP = `DeepSeek CLI · 本地增强版 ${EDITION}

使用：dsh [-C/--cd <目录>] [命令或任务]

  dsh                         开始交互会话
  dsh resume --last           继续当前目录最近的会话（兼容 -c）
  dsh resume [ID或标题]        恢复会话；--all 跨项目查找
  dsh -m <模型> "任务"         选择模型并开始交互任务
  dsh -r [会话ID或标题]        恢复指定会话；无参数时打开选择器
  dsh sessions                当前目录会话（--all / --search <词> / --json）
  dsh models                  列出已配置的模型
  dsh review [要求]           审查 Git 变更（DeepSeek，只读）
  dsh doctor                  检查环境与依赖（--json，不请求模型）
  dsh config                  配置文件位置（--json，隐藏密钥内容）
  dsh exec "任务"             执行单次任务并退出（别名 e / -p）
  dsh exec --json "任务"      输出 DeepSeek 原生 JSONL 事件
  cat input.txt | dsh -p -     从标准输入读取任务
  dsh -C ~/project -c          在指定项目继续
  dsh tui --help              原始 TUI 参数、模式和模型选项
  dsh --profile <名称> ...     原始 Harness 接口
  dsh plugin --profile tui ... 插件管理

TUI：/commands 搜索 · /permissions 权限 · /keymap 快捷键 · /ps 后台任务
     Ctrl+O 复制回答 · Ctrl+Shift+O 展开详情 · Esc 停止 · Ctrl+C 退出/取消
     /help <词> 分组帮助 · /diff 变更 · /doctor 诊断 · @ 引用文件
`;
function fail(message) { throw new Error(message); }
export async function invocation(input, baseCwd = process.cwd(), home = configPaths().home) {
  let args = [...input], cwd = baseCwd;
  while (args[0] === '-C' || args[0] === '--cwd' || args[0] === '--cd') {
    args.shift(); const path = args.shift(); if (!path || path.startsWith('-')) fail('-C/--cd/--cwd 需要一个目录');
    cwd = resolve(cwd, path); if (!(await stat(cwd).catch(() => null))?.isDirectory()) fail(`不是可访问的目录：${cwd}`);
    cwd = await realpath(cwd);
  }
  if (!args[0]?.startsWith('--profile') && !['--patch', '--from-default-profile'].includes(args[0])) {
    for (let i = 1; i < args.length && args[i] !== '--'; i++) {
      if (!['-C', '--cd', '--cwd'].includes(args[i])) continue;
      const path = args[i + 1]; if (!path || path.startsWith('-')) fail('-C/--cd 需要一个目录');
      cwd = resolve(cwd, path); if (!(await stat(cwd).catch(() => null))?.isDirectory()) fail(`不是可访问的目录：${cwd}`);
      cwd = await realpath(cwd); args.splice(i, 2); i--;
    }
  }
  const first = args[0];
  if (['--help', '-h', 'help'].includes(first)) { if (args.length !== 1) fail('dsh --help 不接受额外参数'); return { kind: 'text', text: HELP, cwd }; }
  if (['--version', '-V'].includes(first)) { if (args.length !== 1) fail('dsh --version 不接受额外参数'); return { kind: 'text', text: `DeepSeek CLI ${EDITION} · Harness 0.2.0-rc.2 · TUI 0.13.0`, cwd }; }
  if (first === 'doctor' || first === 'config') {
    const rest = args.slice(1); if (rest.some(flag => !['--json', '--help', '-h'].includes(flag))) fail(`${first} 只接受 --json 或 --help`);
    if (rest.includes('--help') || rest.includes('-h')) return { kind: 'text', text: `dsh ${first} [--json]\n${first === 'doctor' ? '本地诊断；不请求模型、不展示密钥。' : '显示配置位置；不展示配置内容或密钥。'}`, cwd };
    return { kind: first, json: rest.includes('--json'), cwd };
  }
  if (first === 'sessions') {
    let all = false, json = false, search = '', limit = 30, children = false;
    for (let i = 1; i < args.length; i++) {
      switch (args[i]) {
        case '--all': all = true; break;
        case '--json': json = true; break;
        case '--children': children = true; break;
        case '--search': search = args[++i] ?? fail('--search 需要关键词'); break;
        case '--limit': limit = Number(args[++i]); if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) fail('--limit 必须是 1–1000'); break;
        case '--help': case '-h': return { kind: 'text', text: 'dsh sessions [--all] [--search <词>] [--limit 1–1000] [--children] [--json]\n默认列出当前目录的主会话，按最近修改时间排序。', cwd };
        default: fail(`sessions 不认识参数：${args[i]}`);
      }
    }
    return { kind: 'sessions', json, cwd, options: { all, search, limit, children, cwd } };
  }
  if (first === 'models') { if (args.length !== 1) fail('models 不接受额外参数'); return { kind: 'launch', cwd, args: ['tui', 'list-models'] }; }
  if (first === '--') return { kind: 'launch', cwd, args: ['tui', '--prompt', args.slice(1).join(' ')] };
  if (first === 'review') {
    if (args.includes('--help') || args.includes('-h')) return { kind: 'text', text: 'dsh review [审查要求]\n使用 DeepSeek 对当前 Git 工作区进行只读审查，在交互界面显示结果。', cwd };
    const task = classifySubmission(`/review ${args.slice(1).join(' ')}`);
    return { kind: 'launch', cwd, args: ['tui', '--prompt', task.text] };
  }
  if (first === 'exec' || first === 'e') {
    const rest = args.slice(1);
    if (rest.includes('--help') || rest.includes('-h')) return { kind: 'text', text: 'dsh exec [--json] [--session-id <ID>] [任务或 -]\n单次 DeepSeek 任务；无任务或 - 从 stdin 读取。JSONL 是 DeepSeek 原生事件，非 Codex 事件协议。\n--session-id 仅恢复原生 headless 会话；TUI 会话使用 dsh resume。', cwd };
    if (rest[0] === 'resume') fail('exec resume 尚不支持 TUI 会话；交互恢复使用 dsh resume，headless 使用 --session-id。');
    return { kind: 'launch', cwd, args: ['headless', ...rest] };
  }
  if (first === 'resume') {
    const rest = args.slice(1);
    if (rest.includes('--help') || rest.includes('-h')) return { kind: 'text', text: 'dsh resume [ID或标题] [--last] [--all] [TUI选项]\n默认当前目录；--all 跨项目。无选择条件打开历史选择器。', cwd };
    const all = rest.includes('--all'), last = rest.includes('--last');
    const remaining = rest.filter(arg => arg !== '--all' && arg !== '--last');
    if (last && remaining[0] && !remaining[0].startsWith('-')) fail('resume --last 不能同时指定会话');
    if (last) {
      const found = await listSessions(home, { cwd, all, limit: 1 });
      if (!found.sessions.length) fail('没有可恢复的会话。使用 dsh 开始新会话。');
      return { kind: 'launch', cwd, args: ['tui', '--resume', found.sessions[0].id, ...remaining] };
    }
    if (remaining[0] && !remaining[0].startsWith('-')) {
      const selector = remaining.shift();
      const found = await listSessions(home, { cwd, all, limit: 10000 });
      const session = resolveSession(found.sessions, selector);
      return { kind: 'launch', cwd, args: ['tui', '--resume', session.id, ...remaining] };
    }
    return { kind: 'launch', cwd, args: ['tui', '--resume', ...remaining] };
  }
  if (first === '-p' || first === '--print') {
    args.shift(); if (!args.length) fail('-p/--print 需要任务文本或 -（读取标准输入）');
    return { kind: 'launch', cwd, args: ['headless', ...args] };
  }
  if (!['--profile', '--patch', '--dump-config', '--dump-config-schema', '--dump-default-config', '--from-default-profile'].some(flag => first === flag || first?.startsWith(`${flag}=`))) {
    args = args.map(arg => arg === '-m' ? '--model' : arg);
  }
  if (first && !first.startsWith('-') && !['tui', 'headless', 'plugin', 'web', 'init', 'list', 'version', 'run'].includes(first)) {
    return { kind: 'launch', cwd, args: ['tui', '--prompt', args.join(' ')] };
  }
  // A task following root TUI flags is forwarded explicitly, never mistaken for a resume mode.
  if (args[0]?.startsWith('-') && ['--model', '--provider', '--preset', '--no-bell', '--no-color', '--new'].includes(args[0])) {
    let i = 0;
    while (i < args.length) {
      if (['--model', '--provider', '--preset'].includes(args[i])) { if (!args[i + 1] || args[i + 1].startsWith('-')) fail(`${args[i]} 需要一个值`); i += 2; }
      else if (['--no-bell', '--no-color', '--new'].includes(args[i])) i++;
      else break;
    }
    if (args[i] && !args[i].startsWith('-')) return { kind: 'launch', cwd, args: ['tui', ...args.slice(0, i), '--prompt', args.slice(i).join(' ')] };
  }
  const explicitTui = first === 'tui'; let tuiArgs = explicitTui ? args.slice(1) : args;
  const resume = tuiArgs[0];
  if (['-c', '--continue', '-r'].includes(resume)) {
    tuiArgs.shift();
    if (resume === '-r' && (!tuiArgs[0] || tuiArgs[0].startsWith('-'))) return { kind: 'launch', cwd, args: ['tui', '--resume', ...tuiArgs] };
    if (resume === '-r') {
      const selector = tuiArgs.shift(); const found = await listSessions(home, { all: true, limit: 10000 });
      const session = resolveSession(found.sessions, selector);
      return { kind: 'launch', cwd, args: ['tui', '--resume', session.id, ...tuiArgs] };
    }
    if (tuiArgs.some(arg => arg === '--new' || arg.startsWith('--resume') || arg === '-r')) fail('--continue 不能和 --new、--resume、-r 一起使用');
    const found = await listSessions(home, { cwd, limit: 1 });
    if (!found.sessions.length) fail('当前目录没有可恢复的会话。使用 dsh 开始新会话，或 dsh sessions --all 查看其他项目。');
    return { kind: 'launch', cwd, args: ['tui', '--resume', found.sessions[0].id, ...tuiArgs] };
  }
  if (!args.length || (!explicitTui && first?.startsWith('-') && !['--profile', '--patch', '--dump-config', '--dump-config-schema', '--dump-default-config', '--from-default-profile'].some(flag => first === flag || first?.startsWith(`${flag}=`)))) args = ['tui', ...args];
  return { kind: 'launch', cwd, args };
}
function clean(value) { return String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' '); }
async function main() {
  const home = configPaths().home; const plan = await invocation(process.argv.slice(2), process.cwd(), home);
  switch (plan.kind) {
    case 'text': console.log(plan.text); return;
    case 'doctor': {
      const checks = localHealth(home); console.log(plan.json ? JSON.stringify({ edition: EDITION, checks }, null, 2) : formatHealth(checks));
      process.exitCode = checks.some(check => check.status === 'fail') ? 1 : 0; return;
    }
    case 'config': { const paths = configPaths(home); console.log(plan.json ? JSON.stringify(paths, null, 2) : Object.entries(paths).map(([key, value]) => `${key}: ${value}`).join('\n')); return; }
    case 'sessions': {
      const result = await listSessions(home, plan.options);
      if (plan.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(plan.options.all ? '所有项目会话 · 最近修改优先' : `项目会话 · ${clean(plan.cwd)}`);
        if (!result.sessions.length) console.log('没有会话。dsh 开始新会话；dsh sessions --all 查看其他项目。');
        for (const session of result.sessions) console.log(`\n${clean(session.title)}\n  ${session.id}\n  ${new Date(session.updatedAt).toLocaleString('zh-CN')} · ${clean(session.cwd)} · ${clean(session.preset ?? 'default')}`);
        if (result.warnings.length) console.error(`跳过 ${result.warnings.length} 个无法读取的日志；--json 查看原因。`);
      } return;
    }
    case 'launch': {
      const entry = join(configPaths(home).profile, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
      if (!existsSync(entry)) fail(`CLI 缺失：${entry}。请恢复安装或运行 dsh doctor。`);
      const child = spawn(process.execPath, [entry, ...plan.args], { cwd: plan.cwd, stdio: 'inherit', env: process.env });
      const onInt = () => {}; const onTerm = () => child.kill('SIGTERM'); const onHup = () => child.kill('SIGHUP');
      process.on('SIGINT', onInt); process.on('SIGTERM', onTerm); process.on('SIGHUP', onHup);
      child.on('error', error => { console.error(`dsh: ${error.message}`); process.exitCode = 1; });
      child.on('exit', (code, signal) => { process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm); process.removeListener('SIGHUP', onHup); if (signal) process.kill(process.pid, signal); else process.exitCode = code ?? 1; });
      return;
    }
  }
}
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  process.stdout.on('error', error => { if (error.code === 'EPIPE') process.exit(0); else throw error; });
  main().catch(error => { console.error(`dsh: ${error.message}`); process.exitCode = 2; });
}
