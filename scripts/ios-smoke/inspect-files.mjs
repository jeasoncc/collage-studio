import { createHash } from 'node:crypto';
import { copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const phase = process.argv[2];
const root = process.env.SIMULATOR_DATA_ROOT;
const output = 'out/ios-smoke';
if (!root || !['png', 'cancel', 'project'].includes(phase)) throw new Error('Expected simulator data root and png/cancel/project phase.');
const found = [];
const staged = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename);
    else if (entry.isFile() && /^ios-smoke(?:[ .(].*)?\.(?:png|collage)$/.test(entry.name)) {
      if (filename.includes('/Library/Caches/') || filename.includes('/tmp/')) staged.push(filename);
      else found.push(filename);
    }
  }
}
await visit(path.join(root, 'Containers'));
const pngs = found.filter(filename => filename.endsWith('.png'));
const projects = found.filter(filename => filename.endsWith('.collage'));
if (pngs.length !== 1 || projects.length !== (phase === 'project' ? 1 : 0)) throw new Error(`Unexpected saved Files destinations: ${JSON.stringify({ found, staged })}`);
if (staged.length) throw new Error(`Finished native save left staged export files: ${JSON.stringify(staged)}`);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const png = await readFile(pngs[0]);
if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.toString('ascii', 12, 16) !== 'IHDR' || png.toString('ascii', png.length - 8, png.length - 4) !== 'IEND') throw new Error('Saved image is not a complete PNG.');
const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
if (dimensions.width !== 2160 || dimensions.height !== 2700) throw new Error(`Expected the three-photo 4:5 sample at HD 2160×2700, got ${JSON.stringify(dimensions)}.`);
const decoded = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', pngs[0]], { encoding: 'utf8' });
if (decoded.status !== 0 || !/pixelWidth:\s+2160/.test(decoded.stdout) || !/pixelHeight:\s+2700/.test(decoded.stdout)) throw new Error(`ImageIO could not decode the actual saved PNG: ${decoded.stderr || decoded.stdout}`);
const pngStat = await stat(pngs[0]);
const savedPng = { destination: pngs[0], bytes: png.length, sha256: sha256(png), ...dimensions, modifiedTimeMs: pngStat.mtimeMs };
const report = { phase, files: found, staged, png: savedPng };
if (phase !== 'png') {
  const before = JSON.parse(await readFile(`${output}/native-save-png.json`, 'utf8'));
  if (JSON.stringify(before.png) !== JSON.stringify(savedPng)) throw new Error('PNG destination, bytes, digest, dimensions or modification time changed after cancel/project export.');
  report.pngUnchangedSinceSave = true;
}
if (phase === 'png') await copyFile(pngs[0], `${output}/ios-smoke.png`);
if (phase === 'project') {
  const archive = projects[0];
  const zipTest = spawnSync('unzip', ['-t', archive], { encoding: 'utf8' });
  if (zipTest.status !== 0) throw new Error(`Saved project ZIP failed CRC validation: ${zipTest.stderr || zipTest.stdout}`);
  function member(name) {
    const result = spawnSync('unzip', ['-p', archive, name], { maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Could not read saved project member ${name}.`);
    return result.stdout;
  }
  const namesResult = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
  if (namesResult.status !== 0) throw new Error('Could not enumerate saved project members.');
  const names = namesResult.stdout.trim().split('\n');
  const manifestBytes = member('manifest.json');
  if (member('manifest.sha256').toString('utf8') !== sha256(manifestBytes)) throw new Error('Saved project manifest digest mismatch.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.format !== 'collage-studio' || manifest.version !== 1 || manifest.project?.title !== 'ios-smoke' || manifest.project.pages.length !== 1 || manifest.assets?.length !== 3 || names.length !== 5 || new Set(names).size !== 5) throw new Error('Saved editable project does not contain one page and exactly three original sample assets.');
  const assets = manifest.assets.map(entry => {
    if (!/^assets\/[a-zA-Z0-9_-]{1,128}$/.test(entry.path) || !entry.metadata?.mime?.startsWith('image/') || !names.includes(entry.path)) throw new Error('Unexpected saved sample asset.');
    const bytes = member(entry.path);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error(`Saved original asset digest/size mismatch: ${entry.path}.`);
    return { path: entry.path, name: entry.metadata.name, mime: entry.metadata.mime, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const projectBytes = await readFile(archive);
  report.project = { destination: archive, bytes: projectBytes.length, sha256: sha256(projectBytes), pages: 1, assets };
  await copyFile(archive, `${output}/ios-smoke.collage`);
  await writeFile(`${output}/saved-project-manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
}
await writeFile(`${output}/native-save-${phase}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
