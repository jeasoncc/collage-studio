#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';

const codecLockSchema = z.object({
  sources: z.array(z.object({
    file: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })).min(1),
});
const sourcePackageSchema = z.object({ version: z.string() });

const version = '1.0.0';
const tag = `v${version}`;
const archiveName = `collage-studio-${version}.tar.gz`;
const args = process.argv.slice(2);
const commitIndex = args.indexOf('--commit');
const commit = commitIndex === -1 ? undefined : args[commitIndex + 1];
if (commitIndex !== -1) args.splice(commitIndex, 2);
if (args.includes('--help') || args.length < 1 || args.length > 2) {
  console.log('Usage: node scripts/generate-aur.mjs OWNER/REPO [OUTPUT_DIRECTORY] [--commit FULL_SHA]\nDownloads and validates the published v1.0.0 source release. --commit explicitly selects an immutable public source snapshot for local build verification; it does not publish a release or an AUR package.');
  process.exit(args.includes('--help') ? 0 : 1);
}
if (commitIndex !== -1 && !/^[a-f0-9]{40}$/.test(commit ?? '')) {
  throw new Error('--commit requires an immutable, full 40-character Git commit SHA.');
}
const repository = args[0];
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository)) {
  throw new Error('Repository must be a GitHub OWNER/REPO, not a URL; owner/repository names must contain only GitHub-safe characters.');
}
const outputDirectory = resolve(args[1] ?? 'packaging/aur/collage-studio');
const url = `https://github.com/${repository}`;
const sourceUrl = commit
  ? `https://codeload.github.com/${repository}/tar.gz/${commit}`
  : `${url}/releases/download/${tag}/${archiveName}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'collage-studio-aur-'));
try {
  const archivePath = join(temporaryDirectory, archiveName);
  try {
    execFileSync('curl', ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https',
      '--max-time', '180', '--output', archivePath, sourceUrl], { stdio: 'inherit' });
  } catch (error) {
    throw new Error(`Unable to download the public source: ${sourceUrl}. Check the network and published asset; --commit explicitly selects a public snapshot, never an automatic fallback.`, { cause: error });
  }
  const sha256 = createHash('sha256').update(await readFile(archivePath)).digest('hex');
  const members = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim().split('\n');
  const sourceRoot = commit ? `${repository.split('/')[1]}-${commit}` : `collage-studio-${version}`;
  if (members.some((member) => !member.startsWith(`${sourceRoot}/`) || member.split('/').includes('..'))) {
    throw new Error(`Release archive must contain only the ${sourceRoot}/ source directory.`);
  }
  const codecLock = codecLockSchema.parse(JSON.parse(execFileSync('tar', ['-xOzf', archivePath, `${sourceRoot}/third_party/codecs/sources.lock.json`], { encoding: 'utf8' })));
  for (const source of codecLock.sources) {
    const contents = execFileSync('tar', ['-xOzf', archivePath, `${sourceRoot}/third_party/codecs/sources/${source.file}`], { maxBuffer: 128 * 1024 * 1024 });
    if (createHash('sha256').update(contents).digest('hex') !== source.sha256) {
      throw new Error(`Source release does not contain the locked codec input ${source.file}.`);
    }
  }
  const required = ['package.json', 'bun.lock', 'scripts/license-codecs.mjs', 'scripts/license-build-codecs.sh', 'third_party/codecs/sources.lock.json', 'third_party/codecs/DISTRIBUTION.txt', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/icons/32x32.png', 'src-tauri/icons/128x128.png', 'src-tauri/icons/128x128@2x.png', 'public/icons/icon-512.png', 'public/third-party-notices.txt', 'packaging/linux/top.szlh.collage.desktop', 'LICENSE'];
  for (const member of required) {
    if (!members.includes(`${sourceRoot}/${member}`)) throw new Error(`Source release is missing ${member}.`);
  }
  const frontend = sourcePackageSchema.parse(JSON.parse(execFileSync('tar', ['-xOzf', archivePath, `${sourceRoot}/package.json`], { encoding: 'utf8' })));
  if (frontend.version !== version) throw new Error(`Source package version ${frontend.version} does not match ${version}.`);
  const cargo = execFileSync('tar', ['-xOzf', archivePath, `${sourceRoot}/src-tauri/Cargo.toml`], { encoding: 'utf8' });
  const packageSection = cargo.match(/^\[package\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1] ?? '';
  if (!new RegExp(`^version\\s*=\\s*"${version.replaceAll('.', '\\.')}"\\s*$`, 'm').test(packageSection)) {
    throw new Error('Native Cargo package version must match 1.0.0.');
  }
  const dependencies = ['gtk3', 'webkit2gtk-4.1', 'glib2', 'openssl', 'hicolor-icon-theme'];
  const buildDependencies = ['bun>=1.4.2', 'nodejs>=22', 'rust>=1.94.1', 'pkgconf', 'librsvg', 'cmake', 'python', 'autoconf', 'automake', 'libtool', 'patch', 'curl', 'tar', 'gzip', 'xz'];
  const licenses = ['MIT', 'ISC', 'Apache-2.0', 'LGPL-2.1-or-later', 'LGPL-3.0-or-later', 'MPL-2.0', 'OFL-1.1'];
  const quoteList = (items) => items.map((item) => `'${item}'`).join(' ');
  const pkgbuild = `# Generated from a verified public ${commit ? `source snapshot (${commit}); not a published release` : 'source release'}.
# Regenerate for a different release; never replace the checksum with SKIP.
pkgname=collage-studio
pkgver=${version}
pkgrel=1
pkgdesc='Local-first photo collage editor'
arch=('x86_64' 'aarch64')
url='${url}'
license=(${quoteList(licenses)})
depends=(${quoteList(dependencies)})
makedepends=(${quoteList(buildDependencies)})
source=("${archiveName}::${sourceUrl}")
sha256sums=('${sha256}')
options=('!lto' '!debug')

prepare() {
  cd "$srcdir/${sourceRoot}"
  bun install --frozen-lockfile
  bun scripts/license-codecs.mjs download
  cargo fetch --locked --manifest-path src-tauri/Cargo.toml
}

build() {
  cd "$srcdir/${sourceRoot}"
  # Arch's native hardening flags cannot be passed to the wasm32 compiler.
  env -u CFLAGS -u CXXFLAGS -u CPPFLAGS -u LDFLAGS bun run build:native
  CARGO_TARGET_DIR="$srcdir/target" cargo build --frozen --release --features tauri/custom-protocol --manifest-path src-tauri/Cargo.toml
  bun scripts/license-codecs.mjs release "$srcdir/codec-source"
  printf '%s  %s\\n' '${sha256}' '${archiveName}' > "$srcdir/${archiveName}.sha256"
}

package() {
  cd "$srcdir/${sourceRoot}"
  install -Dm755 "$srcdir/target/release/collage-studio" "$pkgdir/usr/bin/collage-studio"
  install -Dm644 packaging/linux/top.szlh.collage.desktop "$pkgdir/usr/share/applications/top.szlh.collage.desktop"
  install -Dm644 src-tauri/icons/32x32.png "$pkgdir/usr/share/icons/hicolor/32x32/apps/top.szlh.collage.png"
  install -Dm644 src-tauri/icons/128x128.png "$pkgdir/usr/share/icons/hicolor/128x128/apps/top.szlh.collage.png"
  install -Dm644 src-tauri/icons/128x128@2x.png "$pkgdir/usr/share/icons/hicolor/256x256/apps/top.szlh.collage.png"
  install -Dm644 public/icons/icon-512.png "$pkgdir/usr/share/icons/hicolor/512x512/apps/top.szlh.collage.png"
  install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
  install -Dm644 public/third-party-notices.txt "$pkgdir/usr/share/licenses/$pkgname/third-party-notices.txt"
  install -Dm644 "$srcdir/codec-source/collage-studio-codec-corresponding-source.tar.gz" "$pkgdir/usr/share/licenses/$pkgname/collage-studio-codec-corresponding-source.tar.gz"
  install -Dm644 "$srcdir/codec-source/collage-studio-codec-corresponding-source.tar.gz.sha256" "$pkgdir/usr/share/licenses/$pkgname/collage-studio-codec-corresponding-source.tar.gz.sha256"
  install -Dm644 "$srcdir/${archiveName}" "$pkgdir/usr/share/licenses/$pkgname/${archiveName}"
  install -Dm644 "$srcdir/${archiveName}.sha256" "$pkgdir/usr/share/licenses/$pkgname/${archiveName}.sha256"
  install -Dm644 third_party/codecs/DISTRIBUTION.txt "$pkgdir/usr/share/licenses/$pkgname/codec-distribution.txt"
  install -Dm644 third_party/codecs/sources.lock.json "$pkgdir/usr/share/licenses/$pkgname/codec-sources.lock.json"
  install -Dm644 third_party/codecs/licenses/* -t "$pkgdir/usr/share/licenses/$pkgname/codecs"
}
`;
  const srcinfo = [
    'pkgbase = collage-studio',
    '\tpkgdesc = Local-first photo collage editor',
    `\tpkgver = ${version}`,
    '\tpkgrel = 1',
    `\turl = ${url}`,
    '\tarch = x86_64',
    '\tarch = aarch64',
    ...licenses.map((license) => `\tlicense = ${license}`),
    ...buildDependencies.map((dependency) => `\tmakedepends = ${dependency}`),
    ...dependencies.map((dependency) => `\tdepends = ${dependency}`),
    `\tsource = ${archiveName}::${sourceUrl}`,
    `\tsha256sums = ${sha256}`,
    '\toptions = !lto',
    '\toptions = !debug',
    '',
    'pkgname = collage-studio',
    '',
  ].join('\n');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, 'PKGBUILD'), pkgbuild);
  await writeFile(join(outputDirectory, '.SRCINFO'), srcinfo);
  await writeFile(join(outputDirectory, `${archiveName}.sha256`), `${sha256}  ${archiveName}\n`);
  await writeFile(join(outputDirectory, 'LICENSE'), execFileSync('tar', ['-xOzf', archivePath, `${sourceRoot}/LICENSE`]));
  console.log(`Generated ${outputDirectory}/PKGBUILD and .SRCINFO\nSource: ${sourceUrl}\nSHA-256: ${sha256}`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
