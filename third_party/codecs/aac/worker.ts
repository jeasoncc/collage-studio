/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * Local worker adapter for the source-built AAC encoder.
 */
export default function createWorker(): Worker {
  return new Worker(new URL('./build/encode.worker.js', import.meta.url), { type: 'module', name: 'collage-aac-encoder' });
}
