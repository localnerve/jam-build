/**
 * DevContainer network diagnostics.
 * A diagnostic script to run standalone inside the DEVCONTAINER to verify network conditions.
 * Run from package.json script: `npm run test:devcontainer:diag`
 *
 * ** MACOS HOST: Run `ifconfig` for en0 and check DUCKDNS.ORG via developer google login for ip alignment. **
 *
 * Other useful checks from DEVCONTAINER terminal to diagnose duckdns caddy side-car network status:
 *
 * # DNS resolution
 * cat /etc/resolv.conf
 * getent hosts rp-localnerve.duckdns.org
 * getent hosts ln.rp-localnerve.duckdns.org
 *
 * # Can we reach caddy sidecar on the compose network?
 * curl -v --max-time 5 http://caddy:80 2>&1 | head -30
 *
 * # Can we reach caddy on 443?
 * curl -kv --max-time 5 https://caddy:443 2>&1 | head -30
 *
 * # What does the DuckDNS hostname resolve to and can we reach it?
 * curl -v --max-time 5 https://rp-localnerve.duckdns.org 2>&1 | head -40
 *
 * # Routing table
 * ip route show
 *
 * # What networks are we on?
 * ip addr show
 *
 * # hosts file
 * cat /etc/hosts
 *
 * ------------------------------------------------------------------------
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
import { createDatabaseAndAuthorizer, createAppContainer } from './services.js';

const appImageName = 'jam-build-test';

console.log('=== Network Diagnostics ===\n');

// Start containers and test direct bridge IP access - MUST RUN test:env first
console.log('\nStarting testcontainers...');
let authorizerContainer, containerNetwork, mariadbContainer, appContainer;
try {
  ({ authorizerContainer, containerNetwork, mariadbContainer } = await createDatabaseAndAuthorizer());
  console.log(`   Auth container host: ${authorizerContainer.getHost()}:${authorizerContainer.getMappedPort(9011)}`);

  appContainer = await createAppContainer(authorizerContainer, containerNetwork, mariadbContainer, appImageName);
  console.log(`   App container host: ${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`);
} catch (e) {
  console.error(`   Container startup FAILED: ${e.message}`);
  process.exit(1);
}

// Basic outbound DNS + HTTPS — can we reach DuckDNS at all?
console.log('\nTesting DNS resolution and HTTPS to DuckDNS hostnames...');
try {
  const authzResp = await fetch('https://rp-localnerve.duckdns.org', { signal: AbortSignal.timeout(5000) });
  console.log(`   AUTHZ URL: ${authzResp.status} ${authzResp.statusText}`);
} catch (e) {
  console.error(`   AUTHZ URL FAILED: ${e.message}`);
}

try {
  const appResp = await fetch('https://ln.rp-localnerve.duckdns.org', { signal: AbortSignal.timeout(5000) });
  console.log(`   APP URL: ${appResp.status} ${appResp.statusText}`);
} catch (e) {
  console.error(`   APP URL FAILED: ${e.message}`);
}

// Test direct bridge IP access (what Testcontainers reports)
console.log('\nTesting direct bridge IP access from devcontainer...');
const authzDirectUrl = `http://${authorizerContainer.getHost()}:${authorizerContainer.getMappedPort(9011)}`;
const appDirectUrl = `http://${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`;

try {
  const r = await fetch(authzDirectUrl, { signal: AbortSignal.timeout(5000) });
  console.log(`   Auth direct (${authzDirectUrl}): ${r.status}`);
} catch (e) {
  console.error(`   Auth direct FAILED (${authzDirectUrl}): ${e.message}`);
}

try {
  const r = await fetch(appDirectUrl, { signal: AbortSignal.timeout(5000) });
  console.log(`   App direct (${appDirectUrl}): ${r.status}`);
} catch (e) {
  console.error(`   App direct FAILED (${appDirectUrl}): ${e.message}`);
}

// Test host.docker.internal resolution — what Caddy uses to reach the host
console.log('\nTesting host.docker.internal from devcontainer...');
try {
  const r = await fetch('http://host.docker.internal:5000', { signal: AbortSignal.timeout(5000) });
  console.log(`   host.docker.internal:5000: ${r.status}`);
} catch (e) {
  console.error(`   host.docker.internal:5000 FAILED: ${e.message}`);
}
try {
  const r = await fetch('http://host.docker.internal:9010', { signal: AbortSignal.timeout(5000) });
  console.log(`   host.docker.internal:9010: ${r.status}`);
} catch (e) {
  console.error(`   host.docker.internal:9010 FAILED: ${e.message}`);
}

// Test localhost fixed ports — do the pinned ports land on localhost too?
// (should fail)
console.log('\nTesting localhost fixed ports from devcontainer (should fail)...');
try {
  const r = await fetch('http://localhost:5000', { signal: AbortSignal.timeout(5000) });
  console.log(`   localhost:5000: ${r.status}`);
} catch (e) {
  console.error(`   localhost:5000 FAILED: ${e.message}`);
}
try {
  const r = await fetch('http://localhost:9010', { signal: AbortSignal.timeout(5000) });
  console.log(`   localhost:9010: ${r.status}`);
} catch (e) {
  console.error(`   localhost:9010 FAILED: ${e.message}`);
}

// Cleanup
console.log('\n7. Cleaning up containers...');
await appContainer?.stop();
await authorizerContainer?.stop();
await mariadbContainer?.stop();
await containerNetwork?.stop();

console.log('\n=== Diagnostics complete ===');