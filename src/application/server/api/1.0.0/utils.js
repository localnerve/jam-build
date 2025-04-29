/**
 * General utility functions for the api services.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import net from 'node:net';
import debugLib from 'debug';

const debug = debugLib('api:utils');

/**
 * Ping a service on the network.
 *
 * @param {String} hostname - The hostname of another service on this network
 * @param {Number} [port] - The port of another service on this network, defaults to 80
 * @param {Number} [timeout] - The maximum time to wait for response in ms, defaults to 1500
 * @returns {Promise<Number>} The time lapsed in ms on ping, -1 on failure
 */
export async function ping (hostname, port = 80, timeout = 1500) {
  debug(`ping ${hostname}:${port}...`);
  return new Promise(resolve => {
    const start = performance.now();
    const socket = net.createConnection(port, hostname);
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      const end = performance.now();
      socket.end();
      debug(`Ping success on ${hostname}:${port}`);
      resolve(end - start);
    });
    function handleError (message) {
      debug(`Ping error on ${hostname}:${port} - ${message}`);
      socket.destroy();
      resolve(-1);
    }
    socket.on('timeout', handleError);
    socket.on('error', handleError);
  });
}