/**
 * Utility functions
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
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
    await self.clients.claim(); // clients can be stale (ff=n, chromium=0), always refresh
    const freshClients = await self.clients.matchAll();

    const message = meta ? { meta, payload } : payload;
    debug(`sendMessage (${freshClients.length})`, message);

    for (let i = 0; i < freshClients.length; i++) {
      freshClients[i].postMessage(message);
    }
  }
}

/**
 * Substitute for navigator.sendBeacon for service worker.
 * Fire and forget, keepalive POST.
 *
 * @param {String} event - The name of the event
 * @param {Object} labels - The label payload
 */
export function sendBeacon (event, labels) {
  fetch('/api/metrics', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      labels
    })
  });
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

/**
 * A class to serialize access with a reentrant, recursive mutex
 */
export class AffiliatedLock {
  constructor () {
    this.heldId = null;
    this.queue = [];
  }

  /**
   * Acquire an affiliated lock.
   * If you have the currently held affiliation id, or none has been issued (heldId is null), you are granted immedate access.
   * If the lock is busy (heldId is occupied), and you don't have the currently held affiliation id, you are queued and get a promise that resolves to the new affilation id when the lock is free.
   * Can block for the duration of a previous recusive execution.
   * 
   * @param {Symbol} [affiliationId] - An optional lock affiliation id
   * @returns Promise<Symbol> - A promise that resolves to the affiliation id
   */
  acquire (affiliationId = null) {
    // Affiliated re-entry: bypass queue
    if (affiliationId !== null && affiliationId === this.heldId) {
      return Promise.resolve(affiliationId);
    }
    // Free: take lock immediately
    if (this.heldId === null) {
      this.heldId = Symbol('batch-process-id');
      return Promise.resolve(this.heldId);
    }
    // Unaffiliated: enqueue and wait, receive id when granted
    return new Promise(resolve => this.queue.push(resolve));
  }

  /**
   * Release the affiliated lock.
   * If there is a waiter, create a new AffiliatedLock by id and release it. Otherwise enter an unoccupied state.
   * 
   * @param {Symbol} affiliationId - The id of the AffiliatedLock to release
   */
  release (affiliationId) {
    if (affiliationId !== this.heldId) return;
    if (this.queue.length > 0) {
      this.heldId = Symbol('batch-process-id'); // pre-assign to next holder
      this.queue.shift()(this.heldId);          // wake them with their new id
    } else {
      this.heldId = null;
    }
  }
}
