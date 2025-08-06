/**
 * Utility functions
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
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