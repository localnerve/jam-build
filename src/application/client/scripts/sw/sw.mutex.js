/**
 * A mutex to guarantee fifo execution
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

export class Mutex {
  constructor () {
    this.queue = [];
    this.currentPromise = Promise.resolve();
  }

  async acquire () {
    // Create a new promise for the current waiter
    let resolveCurrent;
    const currentPromise = new Promise((resolve) => {
      resolveCurrent = resolve;
    });

    // Add the current promise to the queue
    this.queue.push(currentPromise);

    // Wait for it's this waiter's turn
    await this.currentPromise;

    // Update the current promise to the next one in the queue
    if (this.queue.length > 0) {
      this.currentPromise = this.queue.shift();
    } else {
      this.currentPromise = Promise.resolve();
    }

    resolveCurrent();
  }

  release () {
    if (this.queue.length > 0) {
      this.queue[0].resolve();
    }
  }
}
