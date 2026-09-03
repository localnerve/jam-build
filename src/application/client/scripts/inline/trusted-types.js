/**
 * Trusted Types bootstrap - inline script, bundled with the other inline js.
 * 
 * Delegates to @localnerve/trusted-types-bootstrap (bootstrapTrustedTypes) to
 * register a Trusted Types policy under the reserved name `default`. Because
 * it is the default policy, every injection sink in the application (and in
 * web components like editable-object) is satisfied automatically without
 * call-site edits, while untrusted plain strings can no longer execute:
 *   - createHTML applies the industry-standard 6-char escape (& < > " ' `), so
 *     markup sinks render inert text instead of executing injected tags and the
 *     value stays safe in both element-content and attribute contexts.
 *   - createScriptURL only allows same-origin URLs, so code can never be loaded
 *     from another origin (<script src>, Workers, dynamic import()).
 *   - no createScript hook: eval() / new Function() remain blocked by CSP.
 * 
 * Also registers the app-named `jam-app-static` pass-through policy (for
 * static, author-controlled markup) and shims the API for browsers without
 * Trusted Types (e.g. Firefox < 148) with a passthrough effect: those browsers
 * ignore require-trusted-types-for, so plain strings pass through as before
 * and nothing throws.
 * 
 * This file must remain the first inline script in the page so the policy is
 * registered before any other code runs. It is hashed like every other inline
 * script in production builds (see src/build/html.js).
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

import { bootstrapTrustedTypes } from '@localnerve/trusted-types-bootstrap';

/**
 * Passthrough for dev builds / browsers without Trusted Types: returns the
 * input unchanged so sinks never throw and plain strings render as before.
 * 
 * @param {String} html - Static, author-controlled markup.
 * @returns {String} The input string.
 */
const passthroughStaticHtml = html => String(html);

/**
 * Create static, author-controlled markup as a trusted value when CSP
 * enforcement is active; passthrough plain string otherwise (dev builds,
 * browsers without Trusted Types). Must never be used for user-influenced
 * data - that goes through the escaping default policy instead.
 * 
 * @param {String} html - Static, author-controlled markup.
 * @returns {TrustedHTML|String} The trusted value, or the input string.
 */
window.trustedStaticHtml = passthroughStaticHtml;

bootstrapTrustedTypes({
  // 'auto': register policies only when the CSP meta tag is present (prod)
  enforce: 'auto',
  // same-origin script URLs only
  scriptURLOrigins: ['self'],
  // Named policy for static, author-controlled markup that must render as real
  // HTML (e.g. the home page's no-data placeholder). Values passed through it
  // must never include user-influenced data - use the escaping default policy
  // for anything user-controlled. This name is also listed explicitly in the
  // build-time audit (src/build/html.js) so it stays in the computed CSP
  // trusted-types allowlist even though registration now happens in the
  // bootstrap package, not in this source.
  policies: {
    // 'staticHtml' preset: bootstrap registers the pass-through policy; we
    // just retrieve it below (a name may only be created once)
    'jam-app-static': 'staticHtml'
  },
  logViolations: true,
  shimWhenUnavailable: true
});

// prod + TT enforcement active: route static markup through the registered
// policy; dev / no-TT browsers keep the passthrough assigned above. The
// 'jam-app-static' name is also listed explicitly in the build-time audit
// (src/build/html.js) so it stays in the computed CSP trusted-types allowlist
// even though registration now happens in the bootstrap package, not here.
// getPolicy exists only on the real Trusted Types API (the no-TT shim does
// not implement it), so this is a safe probe for "enforcement is active"
if ('trustedTypes' in window && typeof window.trustedTypes.getPolicy === 'function' &&
    window.trustedTypes.getPolicy('jam-app-static')) {
  window.trustedStaticHtml = html =>
    window.trustedTypes.getPolicy('jam-app-static').createHTML(html);
}
