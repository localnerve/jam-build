---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: September 3, 2026
Title: Front-end Security Architecture
---

# Front-end Security Architecture

> How jam-build defends against XSS and cross-origin attacks with a strict CSP, Trusted Types, and isolated browsing contexts.

This document describes the client-side security model of jam-build: the Content-Security-Policy (CSP), the [Trusted Types](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types) architecture that keeps the app working under `require-trusted-types-for 'script'`, and how the policy allowlist is computed automatically at build time.

## Threat Model

The primary client-side threat is **cross-site scripting (XSS)**: an attacker injecting executable markup or script through a data sink (`innerHTML`, `document.write`, `eval`, `<script src>`, Workers, dynamic `import()`). jam-build addresses this with defense in depth:

1. **A strict CSP** that forbids inline/eval code and unknown origins.
2. **`require-trusted-types-for 'script'`**, which forces every injection sink to receive a value produced by an allowlisted Trusted Types policy — so even if a string reaches a sink, it cannot execute unless a policy explicitly vouches for it.
3. **Isolated browsing contexts** via COOP/CORP, reducing cross-origin attack surface.

## Content-Security-Policy

The page CSP is delivered as a `<meta http-equiv="Content-Security-Policy">` tag generated from the base template `data/partials/page/header.hbs`. In production builds it is finalized by `src/build/html.js` (minify → compute Trusted Types directive → add sha256 hashes); in dev builds the meta content is stripped so local development is not constrained.

The production directive set:

```
base-uri 'self';
default-src 'self';
connect-src 'self' https://rp-localnerve.duckdns.org;
form-action 'self';
font-src https://fonts.gstatic.com;
frame-src 'self' https://rp-localnerve.duckdns.org;
img-src 'self' https://*;
require-trusted-types-for 'script';
script-src https://polyfill-fastly.io 'unsafe-inline' 'self' <sha256 of each inline script>;
style-src 'unsafe-inline' 'unsafe-hashes' 'self' <sha256 of each inline style>;
trusted-types default editable-object jam-app-static;
```

Key points:

* **`default-src 'self'`** — everything defaults to same-origin. There is no wildcard fall-through.
* **`script-src`** allows `'unsafe-inline'` **only for hashed scripts**. In production every inline `<script>` block is sha256-hashed (see [CSP hashes](#csp-hashes)), so `'unsafe-inline'` effectively admits *only* the exact, known script contents — arbitrary inline code is still blocked. The polyfill CDN origin is allowlisted because it is a required runtime dependency.
* **`style-src 'unsafe-inline' 'unsafe-hashes'`** — same hashing story for inline styles; `csp-hashes` computes the style hashes (including the editable-object shadow-DOM CSS).
* **`trusted-types default editable-object jam-app-static`** — the allowlist of Trusted Types policy names. This line is **computed at build time**, not hand-maintained (see [Computing the directive](#computing-the-trusted-types-directive)).

### Cross-origin isolation headers

Page routes also set cross-origin isolation / isolation headers in `src/application/server/lib.js` (`routeSet`/`setHeaders`):

* **`Cross-Origin-Opener-Policy: same-origin`** — the page becomes its own browsing-context group, isolating it from cross-origin popups/windows and enabling stronger cross-origin protections.
* **`Cross-Origin-Resource-Policy: same-site`** — the page is not usable as a cross-origin resource by other sites.

These are applied to page routes only (not static assets), so they do not interfere with how the site's own resources are fetched. `src/test/pages/page.webspecs.test.js` asserts their presence on page routes and absence on assets.

## Trusted Types Architecture

`require-trusted-types-for 'script'` makes the browser **reject plain strings** at every injection sink. To keep the app functional, each sink must receive a value created by one of the allowlisted policies. jam-build registers three policies:

### `default` (escaping) — the safety net

Registered by [`@localnerve/trusted-types-bootstrap`](https://github.com/localnerve/trusted-types-bootstrap#readme) from the inline script `src/application/client/scripts/inline/trusted-types.js`, which is **bundled first** into every page so the policy exists before any other code runs. Because it uses the reserved name `default`, it automatically satisfies **every** sink in the app and in web components without call-site edits:

* **`createHTML`** applies the industry-standard 6-character escape (`& < > " ' \``) — so if a raw string ever reaches a markup sink it renders as inert text instead of executing injected tags, and the value stays safe in both element-content and attribute contexts (matching `he.escape` / wcb's `escapeHtml`).
* **`createScriptURL`** only permits **same-origin** URLs (anything else throws) — so code can never be loaded cross-origin via `<script src>`, Workers, or dynamic `import()`.
* **No `createScript` hook** — `eval()` / `new Function()` remain blocked by CSP.

This is the policy that real user-influenced data should flow through (e.g. `login.js` rendering `Welcome, ${profile.email}`).

### `jam-app-static` (pass-through) — for static markup

Also registered by the bootstrap, declared in the app's inline script config (`policies: { 'jam-app-static': 'staticHtml' }`). This policy's `createHTML` is a plain pass-through, **for author-controlled, static markup only** that must render as real HTML (not escaped text). The home page uses it to render its "no data" placeholder via the `window.trustedStaticHtml(html)` helper:

```js
// src/application/client/scripts/main/pages/home.js
noDataMarkup.innerHTML = window.trustedStaticHtml(noDataMarkup);
```

> **Rule:** never pass user-influenced data through `jam-app-static` / `trustedStaticHtml`. Anything user-controlled goes through the escaping `default` policy. The name and pass-through behavior are intentional: static templates need real HTML, user data must be escaped.

### `editable-object` — a component's own policy

The [`@localnerve/editable-object`](https://github.com/localnerve/editable-object#trusted-types) web component is Trusted Types aware and registers **its own** named policy (`editable-object`) for the static shadow-DOM template it injects, escaping any user-influenced property keys/values with `escapeHtml()` before composing them. Its helpers come from [`@localnerve/web-component-build`](https://github.com/localnerve/web-component-build#trusted-types-helpers) at build time (a dev dependency only — no runtime coupling), and the policy name is exported as `POLICY_NAME`. Because it registers its own policy, it must appear in the `trusted-types` allowlist — which the build computes automatically.

### Dev builds & browsers without Trusted Types

The bootstrap checks whether a CSP meta tag is present (production) before registering policies:

* **Dev builds** strip the meta content, so no policy is registered and everything passes through as plain strings — local development is unconstrained.
* **Browsers without Trusted Types** (e.g. older Firefox) ignore `require-trusted-types-for` and would otherwise throw when a sink receives an unexpected type; the bootstrap installs a **passthrough shim** of `trustedTypes` so nothing breaks.

A `securitypolicyviolation` listener logs any violation to the console in development, making regressions visible immediately.

> **Shared library:** the bootstrap boilerplate is now provided by [`@localnerve/trusted-types-bootstrap`](https://github.com/localnerve/trusted-types-bootstrap#readme) — one import + config call, with an opt-in DOMPurify-backed sanitize sub-path (`/sanitize`) for untrusted rich content. Every LocalNerve web app reuses it instead of re-creating this script. See [trusted-types-bootstrap-design.md](trusted-types-bootstrap-design.md).

## Computing the Trusted Types Directive

The `trusted-types default editable-object jam-app-static` line is **not hand-maintained**. It is computed from the built JavaScript by [`@localnerve/trusted-types-rules`](https://github.com/localnerve/trusted-types-rules#readme) during the build (`src/build/html.js` → `trustedTypesDirective(dist)`):

1. Every top-level `.js` file in `dist/` **plus** the inline bootstrap source (`inline/trusted-types.js`, which is not a standalone dist file) is scanned.
2. Injection sinks are audited (markup, code-execution, script-URL patterns).
3. Every `trustedTypes.createPolicy('name', ...)` registration in app and component sources is resolved with real AST analysis (acorn), so it survives terser minification — including the hoisted `const r = "editable-object"; f(r)` shape that a minified web component bundle produces.
4. The inline script's named policy (`jam-app-static`) is registered by the bootstrap package in `node_modules` (not scanned), so it is listed explicitly in the audit call — `{ policyNames: ['default', 'jam-app-static'] }` — while component policies remain auto-detected.
5. The reported directive replaces the `trusted-types …` placeholder in every page's CSP meta tag.

The build logs an audit line you can inspect, e.g.:

```
trusted-types audit: sinks=8 components=editable-object directive="trusted-types default jam-app-static editable-object"
```

This means a newly added web component (or new `innerHTML` usage) is picked up on the next build and allowlisted automatically, instead of being silently missed in a hand-edited policy. Uncovered sinks produce warnings during the build.

## CSP Hashes

Inline scripts and styles are allowed via sha256 hashes rather than blanket `'unsafe-inline'`. `@localnerve/csp-hashes` computes these; the editable-object shadow-DOM CSS is hashed via its package's `getEditableObjectCssText()` export so the component's inline `<style>` is admitted.

## Summary Table

| Defense | Where | Protects against |
| --- | --- | --- |
| `default-src 'self'` + explicit allowlists | CSP meta (`header.hbs`, finalized in `html.js`) | Loading/executing unknown-origin code & resources |
| Hashed `'unsafe-inline'` for scripts/styles | `csp-hashes` in `html.js` | Arbitrary inline code injection |
| `require-trusted-types-for 'script'` | CSP meta | Plain-string execution at any injection sink |
| Escaping `default` TT policy | `inline/trusted-types.js` | Markup sinks rendering injected tags; cross-origin script URLs |
| `jam-app-static` TT policy | `inline/trusted-types.js` + `home.js` | Safe static-markup rendering (no user data) |
| `editable-object` TT policy | `@localnerve/editable-object` | Component shadow-DOM sinks |
| Computed `trusted-types` allowlist | `@localnerve/trusted-types-rules` package in `html.js` | Drift between registered policies and the CSP allowlist |
| COOP / CORP headers | `src/application/server/lib.js` | Cross-origin context & resource abuse |
| `securitypolicyviolation` logging | `inline/trusted-types.js` | Silent regressions during development |
