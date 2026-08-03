/**
 * Setup the devcontainer.
 * A one-time setup to extend the devcontainer caddy service with our project's named RPs and aliases.
 * Run inside the devcontainer only.
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
import fs from 'node:fs';
import path from 'node:path';

if (process.env.DEVCONTAINER !== 'true') {
  console.log('Not in devcontainer — skipping Caddy registration.');
  process.exit(0);
}

const src = path.resolve('./devcontainer/jam-build.Caddyfile');
const dest = '/etc/caddy/conf.d/jam-build.Caddyfile';

fs.copyFileSync(src, dest);
console.log(`Installed ${dest}`);

// Trigger a reload — Caddy's admin API is reachable directly since
// dev-workstation and caddy share the devcontainer network.
const resp = await fetch('http://172.19.0.2:2019/load', {
  method: 'POST',
  headers: { 'Content-Type': 'text/caddyfile' },
  body: fs.readFileSync('/etc/caddy/Caddyfile', 'utf8')
});

if (!resp.ok) {
  throw new Error(`Caddy reload failed: ${resp.status} ${await resp.text()}`);
}
console.log('Caddy reloaded.');