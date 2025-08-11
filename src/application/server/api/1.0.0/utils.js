/**
 * General utility functions for the api services.
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
import net from 'node:net';
import debugLib from '@localnerve/debug';

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