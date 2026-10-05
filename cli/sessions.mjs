import { readdir, stat, readFile, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createZstdDecompress, createGunzip } from 'node:zlib';
import { join, resolve } from 'node:path';

// Only metadata leaves this reader. Stop at the header so large conversations
// do not need decoding just to choose a session.
export function readHeader(file) {
  return new Promise((accept, reject) => {
    const input = createReadStream(file, { highWaterMark: 4096 });
    const stream = file.endsWith('.zstd') ? input.pipe(createZstdDecompress()) : file.endsWith('.gz') ? input.pipe(createGunzip()) : input;
    let chunks = [], bytes = 0, settled = false;
    const timer = setTimeout(() => finish(new Error('session header timed out')), 3000);
    function finish(error, value) {
      if (settled) return; settled = true; clearTimeout(timer); input.destroy(); stream.destroy();
      error ? reject(error) : accept(value);
    }
    input.on('error', error => finish(error)); stream.on('error', error => finish(error));
    stream.on('data', chunk => {
      chunks.push(chunk); bytes += chunk.length;
      const data = Buffer.concat(chunks); const end = data.indexOf(10);
      if (end >= 0) { try { finish(undefined, JSON.parse(data.subarray(0, end).toString('utf8'))); } catch (error) { finish(error); } }
      else if (bytes > 65536) finish(new Error('session header is too large'));
    });
    stream.on('end', () => { if (!settled) { try { finish(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { finish(error); } } });
  });
}
async function directories(path) { try { return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
export async function listSessions(home, { cwd = process.cwd(), all = false, children = false, search = '', limit = 30 } = {}) {
  const root = join(home, 'sessions'); const files = [];
  for (const project of await directories(root)) {
    for (const session of await directories(join(root, project.name))) {
      const dir = join(root, project.name, session.name);
      const names = await readdir(dir);
      const name = ['session.v4.jsonl.zstd', 'session.v4.jsonl', 'session.v4.jsonl.gz'].find(name => names.includes(name));
      if (name) files.push({ id: session.name, path: join(dir, name) });
    }
  }
  const items = [], warnings = []; let cursor = 0;
  const canonicalCwd = await realpath(cwd).catch(() => resolve(cwd));
  await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      try {
        const header = await readHeader(file.path);
        if (header.type !== 'session' || header.version !== 4 || header.id !== file.id || typeof header.cwd !== 'string') throw new Error('unsupported or mismatched session header');
        if (!children && Number(header.delegationDepth ?? 0) > 0) continue;
        if (!all && (await realpath(header.cwd).catch(() => resolve(header.cwd))) !== canonicalCwd) continue;
        let title = '';
        // Titles are a best-effort projection; the durable log owns identity.
        try { const cache = JSON.parse(await readFile(join(home, 'storages/session_projcache/sessions', `${file.id}.json`), 'utf8')); title = cache.record?.rows?.title?.val ?? cache.record?.rows?.titleInput?.val?.first?.text ?? ''; } catch {}
        if (typeof title !== 'string') title = '';
        title = title.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim().slice(0, 160);
        const item = { id: file.id, title: title || '(未命名会话)', cwd: header.cwd, createdAt: Number(header.createdAt) || 0, updatedAt: (await stat(file.path)).mtimeMs, preset: header.agentPreset ?? null };
        if (`${item.id} ${item.title} ${item.cwd}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) items.push(item);
      } catch (error) { warnings.push(`${file.id}: ${error.message}`); }
    }
  }));
  return { sessions: items.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt).slice(0, limit), warnings };
}
export function resolveSession(sessions, selector) {
  const exact = sessions.find(item => item.id === selector); if (exact) return exact;
  const needle = selector.toLocaleLowerCase();
  const matches = sessions.filter(item => item.id.startsWith(selector) || item.title.toLocaleLowerCase().includes(needle));
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error(`找不到会话：${selector}。使用 dsh sessions --all 查看。`);
  throw new Error(`会话名称有歧义，请使用完整 ID：\n${matches.slice(0, 8).map(item => `${item.id}  ${item.title}`).join('\n')}`);
}
