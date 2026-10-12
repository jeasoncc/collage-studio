#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const marker = '\n\n=== NATIVE DEPENDENCY LICENSE INVENTORY ===\n';
const noticePath = join(root, 'public/third-party-notices.txt');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: bun scripts/license-native.mjs [--offline]\nAppends original Rust dependency, standard-library and Tauri JavaScript license texts to public/third-party-notices.txt. Requires locked Cargo dependencies and the matching rust-docs component. Existing Web/media/font notices are preserved verbatim.');
  process.exit(0);
}
if (args.some((arg) => arg !== '--offline')) throw new Error('Only --offline is supported.');

const packageSchema = z.object({
  name: z.string().min(1), version: z.string().min(1), license: z.string().min(1),
  license_file: z.string().nullable(), manifest_path: z.string(), source: z.string().nullable(),
});
const metadataSchema = z.object({ packages: z.array(packageSchema).min(1) });
const npmPackageSchema = z.object({ name: z.string().min(1), version: z.string().min(1), license: z.string().min(1) });
const supplementalSchema = z.object({
  sources: z.array(z.object({
    package: z.string().min(1),
    upstreamRepository: z.string().url(),
    upstreamCommit: z.string().regex(/^[a-f0-9]{40}$/),
    licenses: z.array(z.object({
      file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
      url: z.string().url(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    })).min(1),
  })),
});
const supplemental = new Map();
for (const slice of ['mobile', 'other']) {
  const directory = join(root, 'third_party/native-licenses', slice);
  const lock = supplementalSchema.parse(JSON.parse(await readFile(join(directory, 'sources.lock.json'), 'utf8')));
  for (const source of lock.sources) {
    if (supplemental.has(source.package)) throw new Error(`Duplicate native license source: ${source.package}`);
    supplemental.set(source.package, { ...source, directory });
  }
}
const metadata = metadataSchema.parse(JSON.parse(execFileSync('cargo', [
  'metadata', '--locked', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml', ...args,
], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })));
const original = await readFile(noticePath, 'utf8');
const markerIndex = original.indexOf(marker);
const existing = markerIndex < 0 ? original : original.slice(0, markerIndex);
const blocks = new Map();
const inventory = [];
const missing = [];
const ownManifests = new Set([
  join(root, 'src-tauri/Cargo.toml'), join(root, 'src-tauri/plugins/native-save/Cargo.toml'),
]);

async function licenseFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!/^(?:licen[cs]es?|copying|copyright|notice)(?:$|[._-])/i.test(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isFile()) files.push(path);
    else if (entry.isDirectory()) {
      async function walk(parent) {
        for (const child of await readdir(parent, { withFileTypes: true })) {
          const childPath = join(parent, child.name);
          if (child.isDirectory()) await walk(childPath);
          else if (child.isFile()) files.push(childPath);
        }
      }
      await walk(path);
    }
  }
  return files.sort();
}

async function retain(path, label, expectedSha) {
  const bytes = await readFile(path);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.includes('\0')) throw new Error(`License is not plain text: ${label}`);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (expectedSha && sha !== expectedSha) throw new Error(`Original native license hash mismatch: ${label}`);
  const block = blocks.get(sha);
  if (block) block.labels.add(label);
  else blocks.set(sha, { labels: new Set([label]), text });
  return sha;
}

for (const pkg of metadata.packages.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'))) {
  const directory = dirname(pkg.manifest_path);
  const files = new Set(await licenseFiles(directory));
  if (pkg.license_file) files.add(resolve(directory, pkg.license_file));
  if (ownManifests.has(pkg.manifest_path)) files.add(join(root, 'LICENSE'));
  const refs = [];
  const origins = [];
  for (const file of [...files].sort()) refs.push(await retain(file, `${pkg.name}@${pkg.version} / ${relative(directory, file)}`));
  if (!files.size) {
    const source = supplemental.get(`${pkg.name}@${pkg.version}`);
    if (!source) { missing.push(`${pkg.name}@${pkg.version}`); continue; }
    origins.push(`${source.upstreamRepository} @ ${source.upstreamCommit}`);
    for (const license of source.licenses) {
      refs.push(await retain(join(source.directory, license.file), `${pkg.name}@${pkg.version} / ${license.url}`, license.sha256));
      origins.push(license.url);
    }
  }
  const source = pkg.source === 'registry+https://github.com/rust-lang/crates.io-index'
    ? `https://static.crates.io/crates/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.name)}-${encodeURIComponent(pkg.version)}.crate`
    : pkg.source ?? `Included application source: ${relative(root, directory)}`;
  inventory.push(`${pkg.name} ${pkg.version}\nSPDX declaration: ${pkg.license}\nSource: ${source}\n${origins.length ? `Original license provenance: ${origins.join('\n')}\n` : ''}Original license text SHA-256: ${refs.join(', ')}\n`);
}

for (const name of ['@tauri-apps/api', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-fs', '@tauri-apps/plugin-opener']) {
  const directory = join(root, 'node_modules', name);
  const pkg = npmPackageSchema.parse(JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')));
  const files = await licenseFiles(directory);
  if (!files.length) { missing.push(`${pkg.name}@${pkg.version}`); continue; }
  const refs = [];
  for (const file of files) refs.push(await retain(file, `${pkg.name}@${pkg.version} / ${relative(directory, file)}`));
  inventory.push(`${pkg.name} ${pkg.version}\nSPDX declaration: ${pkg.license}\nSource: https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split('/').at(-1)}-${pkg.version}.tgz\nOriginal license text SHA-256: ${refs.join(', ')}\n`);
}

if (missing.length) throw new Error(`Original license files missing; no notice output changed: ${missing.join(', ')}`);
const rustVersion = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
const sysroot = execFileSync('rustc', ['--print', 'sysroot'], { encoding: 'utf8' }).trim();
const rustDocs = join(sysroot, 'share/doc/rust');
const rustFiles = [join(rustDocs, 'COPYRIGHT-library.html')];
for (const entry of await readdir(join(rustDocs, 'licenses'), { withFileTypes: true })) {
  if (entry.isFile()) rustFiles.push(join(rustDocs, 'licenses', entry.name));
}
const rustRefs = [];
for (const file of rustFiles.sort()) rustRefs.push(await retain(file, `Rust standard-library SDK / ${relative(rustDocs, file)}`));
inventory.push(`${rustVersion}\nOriginal library copyright inventory and SDK license texts: ${rustRefs.join(', ')}\n`);
const lockSha = createHash('sha256').update(await readFile(join(root, 'src-tauri/Cargo.lock'))).digest('hex');
const header = `Native Rust/Cargo and Tauri JavaScript license materials\n-----------------------------------------------------\nCargo.lock SHA-256: ${lockSha}\n\nThis records the complete locked Cargo dependency resolution, including build-only and alternative-platform packages; it does not claim every entry is linked into every native binary. Tauri JavaScript bridge packages and the installed Rust standard-library copyright inventory are included separately. Original license/NOTICE/COPYRIGHT bytes are retained below; identical texts are deduplicated by SHA-256, never replaced with a generic license or fabricated copyright. SPDX declarations record upstream choices, not a blanket MIT relicense.\n\nRegistry crates with MPL-2.0 declarations use their pinned published Source Code Form at the exact crate URL listed below. Local vendored Wry modifications and original licenses are included in the complete application source. Rust SDK copyright material conservatively covers multiple targets; compiler-only license texts are not a claim that the compiler is shipped.\n\n`;
let output = existing + marker + header + inventory.join('\n');
for (const [sha, block] of [...blocks].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  output += `\n=== ORIGINAL LICENSE TEXT ${sha} ===\nUsed by:\n${[...block.labels].sort().join('\n')}\n\n${block.text}\n`;
}
await writeFile(noticePath, output);
console.log(`Retained native licenses: ${metadata.packages.length} Cargo packages, 4 Tauri JavaScript packages, ${blocks.size} distinct original texts; Cargo.lock ${lockSha}.`);
