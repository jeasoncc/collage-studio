import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const { GH_TOKEN, GITHUB_REPOSITORY, ARTIFACT_ID, RUNNER_TEMP } = process.env;
if (!GH_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPOSITORY ?? '') || !/^\d+$/.test(ARTIFACT_ID ?? '') || !RUNNER_TEMP) {
  throw new Error('Missing GitHub credentials, repository, artifact ID, or runner temporary directory.');
}
const endpoint = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/artifacts/${ARTIFACT_ID}`;
const headers = { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const metadataResponse = await fetch(endpoint, { headers });
if (!metadataResponse.ok) throw new Error(`Artifact metadata returned HTTP ${metadataResponse.status}.`);
const artifact = await metadataResponse.json();
if (artifact.expired || artifact.name !== 'ios-simulator-app' || !/^sha256:[a-f\d]{64}$/.test(artifact.digest ?? '') || !/^[a-f\d]{40}$/.test(artifact.workflow_run?.head_sha ?? '')) {
  throw new Error('Expected an unexpired iOS simulator artifact with an official SHA-256 digest and source commit.');
}
if (ARTIFACT_ID === '11738451664' && (artifact.digest !== 'sha256:dedbdfc80a54a5b47abe78ceddc46c83a86b164b6d43096dbdc6fdf07e492a04' || artifact.workflow_run.head_sha !== '0ecfb3be867202fd4eb71bd7c8febc20571071c3')) {
  throw new Error('The accepted 0ec simulator fixture no longer matches its recorded digest/source.');
}
const redirect = await fetch(`${endpoint}/zip`, { headers, redirect: 'manual' });
if (redirect.status !== 302) throw new Error(`Artifact download returned HTTP ${redirect.status}, not a redirect.`);
const downloadUrl = new URL(redirect.headers.get('location'));
if (downloadUrl.protocol !== 'https:') throw new Error('Artifact storage must use HTTPS.');
// The GitHub credential is deliberately not sent to redirected artifact storage.
const download = await fetch(downloadUrl);
if (!download.ok || !download.body) throw new Error(`Artifact storage returned HTTP ${download.status}.`);
const hash = createHash('sha256');
let bytes = 0;
const destination = path.join(RUNNER_TEMP, 'ios-verified-input.zip');
await pipeline(Readable.fromWeb(download.body), new Transform({
  transform(chunk, _encoding, callback) { bytes += chunk.length; hash.update(chunk); callback(null, chunk); },
}), createWriteStream(destination, { flags: 'wx' }));
const actual = hash.digest('hex');
if (`sha256:${actual}` !== artifact.digest || bytes !== artifact.size_in_bytes) throw new Error('Downloaded artifact digest or size does not match GitHub metadata.');
await mkdir('out/ios-smoke', { recursive: true });
await writeFile('out/ios-smoke/source-artifact.json', JSON.stringify({
  repository: GITHUB_REPOSITORY,
  artifactId: Number(ARTIFACT_ID),
  artifactUrl: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${artifact.workflow_run.id}/artifacts/${ARTIFACT_ID}`,
  sourceCommit: artifact.workflow_run.head_sha,
  sha256: actual,
  bytes,
  runtimeWorkflowCommit: process.env.GITHUB_SHA,
  applicationRebuilt: false,
}, null, 2) + '\n');
console.log(`Verified simulator artifact ${ARTIFACT_ID}: ${bytes} bytes, SHA-256 ${actual}, source ${artifact.workflow_run.head_sha}.`);
