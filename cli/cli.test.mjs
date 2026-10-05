import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, utimes, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { invocation } from './main.mjs';
import { listSessions, resolveSession } from './sessions.mjs';

test('launcher runs the Harness from an isolated DSH_HOME', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-cli-home-'));
  try {
    const directory = join(home, 'profiles/tui/node_modules/@deepseek-ai/dsh/lib');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'bin.js'), 'console.log(JSON.stringify(process.argv.slice(2)))');
    const entry = fileURLToPath(new URL('./main.mjs', import.meta.url));
    const result = execFileSync(process.execPath, [entry, 'exec', 'offline task'], {
      encoding: 'utf8', env: { ...process.env, DSH_HOME: home }, timeout: 10000,
    });
    assert.deepEqual(JSON.parse(result), ['headless', 'offline task']);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('launcher preserves Harness arguments and validates local options', async () => {
  assert.deepEqual((await invocation(['--profile', 'web', '--patch', 'x.yml', '--help'])).args, ['--profile', 'web', '--patch', 'x.yml', '--help']);
  assert.deepEqual((await invocation([])).args, ['tui']);
  assert.deepEqual((await invocation(['--profile=web', '--help'])).args, ['--profile=web', '--help']);
  assert.deepEqual((await invocation(['--model', 'test'])).args, ['tui', '--model', 'test']);
  assert.deepEqual((await invocation(['-p', 'task', '--json'])).args, ['headless', 'task', '--json']);
  assert.equal((await invocation(['sessions', '--all', '--json', '--limit', '7'])).options.limit, 7);
  await assert.rejects(invocation(['sessions', '--limit', '0']));
  await assert.rejects(invocation(['-p']));
  await assert.rejects(invocation(['-C', '/does-not-exist']));
});

test('sessions use durable identity, isolate cwd, skip children and recover from corrupt logs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cli-test-'));
  try {
    const a = join(root, 'project-a'), b = join(root, 'project-b'); await mkdir(a); await mkdir(b);
    async function seed(id, cwd, updatedAt, depth = 0) {
      const dir = join(root, 'sessions', 'bucket', id); await mkdir(dir, { recursive: true });
      const header = JSON.stringify({ type: 'session', version: 4, id, cwd, createdAt: updatedAt, delegationDepth: depth });
      const file = join(dir, 'session.v4.jsonl.zstd'); await writeFile(file, zstdCompressSync(Buffer.from(header + '\n' + 'x'.repeat(200000))));
      await utimes(file, new Date(updatedAt), new Date(updatedAt));
    }
    await seed('a1', a, 10000); await seed('a2', a, 20000); await seed('b1', b, 30000); await seed('child', a, 40000, 1);
    const broken = join(root, 'sessions/bucket/broken'); await mkdir(broken); await writeFile(join(broken, 'session.v4.jsonl.zstd'), 'broken');
    const found = await listSessions(root, { cwd: a });
    assert.deepEqual(found.sessions.map(s => s.id), ['a2', 'a1']); assert.equal(found.warnings.length, 1);
    assert.deepEqual((await invocation(['-c'], a, root)).args, ['tui', '--resume', 'a2']);
    assert.deepEqual((await invocation(['-C', b, '-c'], a, root)).args, ['tui', '--resume', 'b1']);
    const all = await listSessions(root, { all: true }); assert.equal(all.sessions.length, 3);
    assert.equal((await listSessions(root, { all: true, children: true })).sessions.length, 4);
    await assert.rejects(invocation(['-c', '--new'], a, root));
    assert.deepEqual((await invocation(['resume', '--last'], a, root)).args, ['tui', '--resume', 'a2']);
    assert.deepEqual((await invocation(['resume', '--last', '--all'], a, root)).args, ['tui', '--resume', 'b1']);
    await assert.rejects(invocation(['resume', 'b1'], a, root));
    assert.deepEqual((await invocation(['resume', 'b1', '--all'], a, root)).args, ['tui', '--resume', 'b1']);
    assert.equal((await invocation(['exec', '--cd', b, 'task'], a, root)).cwd, b);
    await assert.rejects(invocation(['resume', '--last', 'a1'], a, root));
    assert.equal(resolveSession(all.sessions, 'b1').id, 'b1');
    assert.throws(() => resolveSession(all.sessions, 'a'), /歧义/);
    await assert.rejects(invocation(['-c'], root, root), /没有可恢复/);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('entry runs through an atomic current symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cli-entry-'));
  try {
    const entry = fileURLToPath(new URL('./main.mjs', import.meta.url));
    const alias = join(root, 'main.mjs'); await symlink(entry, alias);
    const version = execFileSync(process.execPath, [alias, '--version'], { encoding: 'utf8' });
    assert.match(version, /DeepSeek CLI 1.2.1-local/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Codex-compatible task entry points preserve text and native execution', async () => {
  assert.deepEqual((await invocation(['exec', '--json', 'a task'])).args, ['headless', '--json', 'a task']);
  assert.deepEqual((await invocation(['e'])).args, ['headless']);
  assert.deepEqual((await invocation(['a task'])).args, ['tui', '--prompt', 'a task']);
  assert.deepEqual((await invocation(['-m', 'deepseek-v4-pro', 'a task'])).args, ['tui', '--model', 'deepseek-v4-pro', '--prompt', 'a task']);
  assert.deepEqual((await invocation(['tui', '-m', 'test'])).args, ['tui', '--model', 'test']);
  assert.deepEqual((await invocation(['resume'])).args, ['tui', '--resume']);
  assert.match((await invocation(['review'])).args[2], /只读检查/);
  assert.deepEqual((await invocation(['--', '-literal task'])).args, ['tui', '--prompt', '-literal task']);
  await assert.rejects(invocation(['exec', 'resume']), /尚不支持/);
  await assert.rejects(invocation(['-m']), /需要一个值/);
});
