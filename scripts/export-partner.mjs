// Allowlisted source snapshot. Never copies Git history or local configuration.
import { mkdir, readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, '.local/exports/studio-partner');
const allowed = [
  '.env.example', '.gitignore', 'README.md', 'package.json', 'package-lock.json',
  'im-h5.html', 'vite.config.js', 'src/im-chat', 'server', 'skills', 'design-agent', 'docs',
  'test', 'examples/workbench/index.html', 'examples/workbench/app.js',
  'examples/workbench/style.css', 'examples/workbench/workspace.css',
  'scripts/sync-sdk.mjs', 'scripts/preview-workbench.mjs', 'scripts/export-partner.mjs',
];
const collected = [];
async function collect(relative) {
  const full = path.join(root, relative), info = await lstat(full);
  if (info.isSymbolicLink()) throw new Error(`Symlink not allowed: ${relative}`);
  if (info.isDirectory()) {
    for (const name of (await readdir(full)).sort()) await collect(path.join(relative, name));
    return;
  }
  if (!info.isFile()) throw new Error(`Unsupported file: ${relative}`);
  const data = await readFile(full), text = data.toString('utf8');
  const sensitive = /sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|LTAI[0-9A-Za-z]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:\/Users\/|\/home\/)\w+\/|https?:\/\/(?!127\.0\.0\.1\b)(?:\d{1,3}\.){3}\d{1,3}|["'`]\d{18,20}["'`]/;
  if (sensitive.test(text)) throw new Error(`Review required before export: ${relative}`);
  if (/(?:^|\/)(?:\.env|\.local|\.git|evidence|node_modules)(?:\/|$)/.test(relative)) throw new Error(`Private path: ${relative}`);
  collected.push({relative,data});
}
for (const relative of allowed) await collect(relative);
await mkdir(path.dirname(target), {recursive:true, mode:0o700});
// Refuse to overwrite a previous handoff; move it away before exporting again.
await mkdir(target, {mode:0o700});
for (const {relative,data} of collected) {
  const dest=path.join(target,relative);
  await mkdir(path.dirname(dest), {recursive:true});
  await writeFile(dest,data);
}
console.log(`Exported ${collected.length} source files to ${target}`);
