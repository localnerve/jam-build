/**
 * DevContainer network diagnostics.
 * A diagnostic script to run standalone inside the DEVCONTAINER to verify network conditions.
 * Run from package.json script: `npm run test:devcontainer:diag`
 *
 * This version targets the alias-based routing topology (containers attached
 * directly to DEVCONTAINER_NETWORK, addressed by AUTHZ_NETWORK_ALIAS /
 * APP_NETWORK_ALIAS / DB_NETWORK_ALIAS, Caddy reverse-proxying to those
 * aliases) rather than the old host-hairpin (host.docker.internal / fixed
 * host ports) topology. The hairpin checks are kept at the bottom
 * specifically as regression checks — they are EXPECTED TO FAIL now. If they
 * start passing again, something has drifted back toward the old setup.
 *
 * ** MACOS HOST: Run `ifconfig` for en0 and check DUCKDNS.ORG via developer google login for ip alignment. **
 *
 * Other useful checks from DEVCONTAINER terminal:
 *
 * # Confirm the shared network convention is exported
 * echo $DEVCONTAINER $DEVCONTAINER_NETWORK
 *
 * # DNS resolution (extra_hosts-driven, static — not live DNS)
 * cat /etc/hosts
 * getent hosts rp-localnerve.duckdns.org
 * getent hosts ln.rp-localnerve.duckdns.org
 *
 * # Can dev-workstation resolve project aliases via Docker's embedded DNS?
 * # (only meaningful once containers from createDatabaseAndAuthorizer/
 * # createAppContainer are up and attached to DEVCONTAINER_NETWORK)
 * getent hosts jam-build-authorizer
 * getent hosts jam-build-app
 * getent hosts mariadb
 *
 * # Is Caddy itself reachable on the shared network?
 * curl -v --max-time 5 http://caddy:80 2>&1 | head -30
 * curl -kv --max-time 5 https://caddy:443 2>&1 | head -30
 *
 * # Caddy admin API — is conf.d actually loaded?
 * curl -s http://caddy:2019/config/ | head -c 2000
 *
 * # conf.d permissions (should be owned by the devcontainer's USERNAME, not root)
 * ls -la /etc/caddy/conf.d
 *
 * # What does the DuckDNS hostname resolve to and can we reach it end-to-end?
 * curl -v --max-time 5 https://rp-localnerve.duckdns.org 2>&1 | head -40
 *
 * # Routing / interfaces
 * ip route show
 * ip addr show
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
const inDevcontainer = process.env.DEVCONTAINER === 'true';

const authzAlias = process.env.AUTHZ_NETWORK_ALIAS || 'authorizer';
const appAlias = process.env.APP_NETWORK_ALIAS || 'jam-build';
const dbAlias = process.env.DB_NETWORK_ALIAS || 'mariadb';

let passCount = 0;
let failCount = 0;

function pass(label, detail = '') {
  passCount++;
  console.log(`   \u2713 ${label}${detail ? `: ${detail}` : ''}`);
}

function fail(label, detail = '') {
  failCount++;
  console.error(`   \u2717 ${label}${detail ? `: ${detail}` : ''}`);
}

async function checkFetch(label, url, { expect = 'ok', redirect } = {}) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      ...(redirect ? { redirect } : {})
    });
    if (expect === 'ok') {
      pass(label, `${r.status} ${r.statusText} (${url})`);
    } else {
      // expect === 'fail' — a successful response here is the surprise
      fail(`${label} — expected this to fail but it responded`, `${r.status} (${url})`);
    }
    return r;
  } catch (e) {
    if (expect === 'ok') {
      fail(label, `${e.message} (${url})`);
    } else {
      pass(`${label} (correctly unreachable)`, `${e.message}`);
    }
    return null;
  }
}

console.log('=== DevContainer Network Diagnostics ===\n');

console.log('0. Environment / convention check');
if (!inDevcontainer) {
  console.log('   DEVCONTAINER not set — running in CI/ephemeral mode.');
  console.log('   Alias/Caddy checks below are not applicable; only container');
  console.log('   startup and bridge-IP reachability will be meaningful.\n');
} else {
  if (process.env.DEVCONTAINER_NETWORK) {
    pass('DEVCONTAINER_NETWORK is set', process.env.DEVCONTAINER_NETWORK);
  } else {
    fail('DEVCONTAINER_NETWORK is NOT set — alias mode will throw in services.js');
  }
  console.log(`   AUTHZ_NETWORK_ALIAS=${authzAlias}  APP_NETWORK_ALIAS=${appAlias}  DB_NETWORK_ALIAS=${dbAlias}\n`);
}

console.log('1. Starting testcontainers...');
let authorizerContainer, containerNetwork, mariadbContainer, appContainer;
try {
  ({ authorizerContainer, containerNetwork, mariadbContainer } = await createDatabaseAndAuthorizer());
  console.log(`   Auth container host (published port): ${authorizerContainer.getHost()}:${authorizerContainer.getMappedPort(9011)}`);

  appContainer = await createAppContainer(authorizerContainer, containerNetwork, mariadbContainer, appImageName);
  console.log(`   App container host (published port): ${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`);
} catch (e) {
  console.error(`   Container startup FAILED: ${e.message}`);
  process.exit(1);
}

console.log('\n2. Direct bridge-IP / published-port access (should always work, any mode)...');
const authzDirectUrl = `http://${authorizerContainer.getHost()}:${authorizerContainer.getMappedPort(9011)}`;
const appDirectUrl = `http://${appContainer.getHost()}:${appContainer.getMappedPort(5000)}`;
await checkFetch('Auth direct', authzDirectUrl);
await checkFetch('App direct', appDirectUrl);

if (inDevcontainer) {
  console.log('\n3. Alias resolution on the shared devcontainer network...');
  console.log('   (dev-workstation must itself be attached to DEVCONTAINER_NETWORK for these to resolve)');
  await checkFetch('Authorizer via alias', `http://${authzAlias}:9011`);
  await checkFetch('App via alias', `http://${appAlias}:5000`);
  // mariadb has no HTTP surface — presence of a resolvable host is the useful signal here,
  // a connection-refused (rather than a DNS/timeout failure) on 3306 confirms the alias resolves.
  await checkFetch('DB alias resolves (expect connection-refused, not timeout/DNS fail)', `http://${dbAlias}:3306`, { expect: 'fail' });

  console.log('\n4. Caddy reachability on the shared network...');
  await checkFetch('Caddy HTTP (redirect only, not following)', 'http://caddy:80', { redirect: 'manual' });
  await checkFetch('Caddy admin API', 'http://caddy:2019/config/');

  console.log('\n5. End-to-end via DuckDNS hostnames through Caddy...');
  console.log('   (requires: conf.d snippet registered via devcontainer:setup, Caddy reloaded, alias checks above passing)');
  await checkFetch('AUTHZ URL (rp-localnerve.duckdns.org)', 'https://rp-localnerve.duckdns.org');
  await checkFetch('APP URL (ln.rp-localnerve.duckdns.org)', 'https://ln.rp-localnerve.duckdns.org');

  console.log('\n6. Legacy hairpin paths — REGRESSION CHECK, these are expected to fail now.');
  console.log('   A pass here means routing has drifted back toward host.docker.internal/hairpin.');
  await checkFetch('host.docker.internal:5000', 'http://host.docker.internal:5000', { expect: 'fail' });
  await checkFetch('host.docker.internal:9010', 'http://host.docker.internal:9010', { expect: 'fail' });
  await checkFetch('localhost:5000 (published port never lands on localhost from here)', 'http://localhost:5000', { expect: 'fail' });
  await checkFetch('localhost:9010', 'http://localhost:9010', { expect: 'fail' });
} else {
  console.log('\n3-6. Skipped — alias/Caddy/hairpin checks only apply when DEVCONTAINER=true.');
}

console.log('\n7. Cleaning up containers...');
await appContainer?.stop();
await authorizerContainer?.stop();
await mariadbContainer?.stop();
await containerNetwork?.stop();

console.log(`\n=== Diagnostics complete: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) {
  process.exitCode = 1;
}