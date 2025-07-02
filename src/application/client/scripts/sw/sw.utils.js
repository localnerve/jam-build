/**
 * Utility functions
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

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
