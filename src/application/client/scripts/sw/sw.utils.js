/**
 * Utility functions
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import { _private } from 'workbox-core';

// WorkboxJS debug logger
export const { debug } = _private.logger || { debug: ()=>{} };

/**
 * Send a message to all the open application tabs.
 * If meta is falsy, payload must be the entire message.
 *
 * @param {String} meta - The meta message identifier
 * @param {Any} [payload] - The message payload
 */
export async function sendMessage (meta, payload) {
  if (self.clients) {
    let clients = await self.clients.matchAll();

    if (clients.length === 0) {
      await self.clients.claim();
      clients = await self.clients.matchAll();
    }

    const message = meta ? { meta, payload } : payload;
    for (let i = 0; i < clients.length; i++) {
      clients[i].postMessage(message);
    }
  }
}

/**
 * A class to enforce serialized execution
 */
export class CriticalSection {
  constructor () {
    this.queue = [];
    this.lock = false;
  }

  async execute (task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });

      if (!this.lock) {
        this._processQueue();
      }
    });
  }

  async _processQueue () {
    this.lock = true;

    while (this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();

      try {
        const result = await task();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.lock = false;
  }
}