#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const codecs = join(root, 'third_party/codecs');
const lock = JSON.parse(readFileSync(join(codecs, 'sources.lock.json'), 'utf8'));
const command = process.argv[2];
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const run = (exe, args, options = {}) => {
  const result = spawnSync(exe, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${exe} failed (${result.status})`);
};
const walk = (dir, exclude = new Set()) => readdirSync(dir).sort().flatMap((name) => {
  if (exclude.has(name)) return [];
  const file = join(dir, name);
  return statSync(file).isDirectory() ? walk(file, exclude) : [file];
});
const sourceFiles = () => [...walk(codecs, new Set(['.work', 'generated', 'build', 'relink', 'build-receipt.json'])),
  join(root, 'scripts/license-codecs.mjs'), join(root, 'scripts/license-build-codecs.sh')].sort();
const sourceDigest = () => createHash('sha256').update(JSON.stringify(sourceFiles().map((file) => [relative(root, file), sha(file)]))).digest('hex');
const products = ['generated/heif.js', 'aac/build/aac.js', 'aac/build/encode.worker.js',
  'relink/heif-bridge.o', 'relink/aac-bridge.o', 'relink/libheif.a', 'relink/libde265.a', 'relink/libavcodec.a', 'relink/libavutil.a'];
const receiptPath = join(codecs, 'build-receipt.json');
function validReceipt() {
  if (!existsSync(receiptPath)) return false;
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  return receipt.sourceDigest === sourceDigest() && products.every((file) =>
    existsSync(join(codecs, file)) && receipt.products[file] === sha(join(codecs, file)));
}
function downloadSources() {
  mkdirSync(join(codecs, 'sources'), { recursive: true });
  for (const source of lock.sources) {
    const path = join(codecs, 'sources', source.file);
    if (!existsSync(path)) {
      const temp = `${path}.download`;
      run('curl', ['--fail', '--location', '--retry', '3', '--output', temp, source.url]);
      if (sha(temp) !== source.sha256) { rmSync(temp); throw new Error(`Source checksum mismatch: ${source.name}`); }
      run('mv', [temp, path]);
    }
    if (sha(path) !== source.sha256) throw new Error(`Source checksum mismatch: ${source.name}`);
  }
}
function updateRuntimeNotices() {
  const start = 'BEGIN SOURCE-BUILT CODEC RUNTIME NOTICES';
  const end = 'END SOURCE-BUILT CODEC RUNTIME NOTICES';
  const path = join(root, 'public/third-party-notices.txt');
  const original = readFileSync(path, 'utf8');
  const licenses = readdirSync(join(codecs, 'licenses')).filter((file) =>
    file.startsWith('emscripten-') && !file.includes('AUTHORS') && !file.includes('mimalloc')).sort();
  const block = `${start}\nEmscripten 4.0.9 and its bundled C/C++ runtime license texts.\nRetained conservatively; not every optional runtime component is enabled.\n\n` +
    licenses.map((file) => `Verbatim source: third_party/codecs/licenses/${file}\n${readFileSync(join(codecs, 'licenses', file), 'utf8')}\n`).join('\n') + end;
  const first = original.indexOf(start);
  const last = original.indexOf(end, first);
  if (first !== -1 && last === -1) throw new Error('Incomplete generated runtime notice section');
  const updated = first === -1 ? `${original.trimEnd()}\n\n${block}\n` :
    original.slice(0, first) + block + original.slice(last + end.length);
  if (updated !== original) writeFileSync(path, updated);
}
if (command === 'download') {
  downloadSources();
} else if (command === 'build') {
  downloadSources();
  updateRuntimeNotices();
  if (!validReceipt() || process.env.CODEC_FORCE_REBUILD === '1') {
    rmSync(receiptPath, { force: true });
    run('bash', [join(root, 'scripts/license-build-codecs.sh')]);
    const result = await Bun.build({ entrypoints: [join(codecs, 'aac/src/encode.worker.ts')],
      target: 'browser', format: 'esm', minify: false, sourcemap: 'none',
      naming: 'encode.worker.js', outdir: join(codecs, 'aac/build') });
    if (!result.success) throw new AggregateError(result.logs, 'AAC worker bundling failed');
    writeFileSync(receiptPath, JSON.stringify({ schema: 1, emscripten: '4.0.9', bun: Bun.version,
      sourceDigest: sourceDigest(), products: Object.fromEntries(products.map((file) => [file, sha(join(codecs, file))])) }, null, 2) + '\n');
  }
} else if (command === 'release') {
  downloadSources();
  updateRuntimeNotices();
  if (!validReceipt()) throw new Error('Codecs absent, modified, or stale: run bun scripts/license-codecs.mjs build before release');
  const out = resolve(process.argv[3] ?? join(root, 'release'));
  mkdirSync(out, { recursive: true });
  const archive = join(out, 'collage-studio-codec-corresponding-source.tar.gz');
  run('tar', ['--exclude=third_party/codecs/.work', '-czf', archive,
    'third_party/codecs', 'scripts/license-codecs.mjs', 'scripts/license-build-codecs.sh', 'public/third-party-notices.txt']);
  writeFileSync(`${archive}.sha256`, `${sha(archive)}  ${relative(out, archive)}\n`);
  console.log(`Attach ${archive} and its SHA-256 file beside EVERY Linux/Android/iOS binary and web release; also publish the exact complete application source.`);
} else {
  throw new Error('Usage: bun scripts/license-codecs.mjs download|build|release [output-directory]');
}
