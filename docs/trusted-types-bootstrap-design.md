# @localnerve/trusted-types-bootstrap — Design

> Proposed reusable package that turns the per-app Trusted Types bootstrap script
> (currently `src/application/client/scripts/inline/trusted-types.js` in jam-build)
> into a shared, parameterized export every LocalNerve web app can use.

Status: **scaffolded + tested** (2026-09-02) — package lives at
`~/projects/trusted-types-bootstrap`, 21/21 tests green, lint clean; publish +
jam-build migration pending. The immediate escape fixes this design builds on
are already landed (see [Security Architecture](fe-security.md)).

## Problem

Every web app that enforces `require-trusted-types-for 'script'` re-implements the
same boilerplate inline bootstrap script:

1. detect whether CSP is enforced (meta tag present),
2. register the reserved `default` policy (escaping `createHTML`, same-origin-only
   `createScriptURL`, no `createScript`),
3. optionally register app-named policies for static-markup passthrough,
4. install a passthrough shim for browsers without Trusted Types,
5. log `securitypolicyviolation` events for development visibility.

jam-build's current implementation is over-localized: the logic is identical for
any app; only the **named policies** and **allowed script origins** vary per
project. Re-creating it in every web app is waste and drift risk.

## Design goals

* **One import + one config call** replaces the ~90-line inline bootstrap in each app.
* **Zero cost for apps that don't need rich content**: the core (escape, same-origin
  guard, shim, orchestration) must be ~1–2 KB minified, dependency-free.
* **Opt-in sanitize tier**: DOMPurify-backed "allow some safe HTML" support is a
  separate sub-path export so it only lands in bundles of apps that import it.
* **Compatible with computed allowlists**: named policies are declared at the call
  site (in the app's inline script), so `@localnerve/trusted-types-rules` keeps
  detecting them via AST analysis — no special handling needed.
* **ESM-first, tree-shakeable** for bundlers (Rollup/webpack).

## Library selection (researched 2026-09-02)

| Candidate | Role | Verdict |
| --- | --- | --- |
| `he` (v1.2.0, MIT, 3.6k★) | strict entity encode/decode; `he.escape()` does exactly the 6-char escape | **Rejected for the escape hook.** The npm package is a single monolithic UMD (~101 KB raw / ~33 KB gzip, not ESM); `he.escape` cannot be tree-shaken — you pay 33 KB gzip for ~5 lines of logic. Use it only if `decode`/full `encode` becomes needed. |
| DOMPurify (v3.4.14, MPL/Apache, 17.4k★, 640K dependents) | XSS sanitizer: strips scripts/event handlers, allows configurable safe HTML | **Accepted for the opt-in sanitize tier.** Real shipped cost ≈ 11 KB gzip (minified). Bug-bounty backed, OpenSSF-scored. First-class TT integration: call `sanitize()` inside your own policy's `createHTML` with `TRUSTED_TYPES_POLICY: null` so it never creates its own `dompurify` policy (which would break a computed allowlist). |

The two are **different tiers, not competitors**:

* **Escape tier** — default behavior. Strict 6-char escape (`& < > " ' \`` →
  `&amp; &lt; &gt; &quot; &#x27; &#x60;`), implemented as a tiny self-contained
  function (no dependency). Safe in element-content **and** attribute contexts.
* **Sanitize tier** — opt-in, per-policy. DOMPurify strips dangerous markup while
  preserving an author-specified allow-list of safe HTML. For rendering untrusted
  rich content (user-supplied posts, importable documents), never plain escaping.

## Proposed API

### Core entry: `@localnerve/trusted-types-bootstrap`

```js
import { bootstrapTrustedTypes } from '@localnerve/trusted-types-bootstrap';

bootstrapTrustedTypes({
  // 'auto' (default): enforce only when a CSP meta tag is present (prod builds).
  // true/false to override.
  enforce: 'auto',

  // Origins allowed by the default policy's createScriptURL. Default: same-origin
  // only. Extra entries are full origins, e.g. https://polyfill-fastly.io.
  scriptURLOrigins: ['self'],

  // App-named policies to register alongside `default`. Keys must appear in the
  // CSP trusted-types allowlist (computed by @localnerve/trusted-types-rules).
  // Value forms: the 'staticHtml' preset string, a hooks object, or {hooks, helper}.
  policies: {
    'jam-app-static': {
      // pass-through createHTML: author-controlled markup only
      hooks: { createHTML: input => String(input) },
      helper: window => {       // optional: attach a convenience global/helper
        window.trustedStaticHtml = html =>
          window.trustedTypes.getPolicy('jam-app-static').createHTML(html);
      }
    }
  },

  logViolations: true,          // console.warn on securitypolicyviolation (dev aid)
  shimWhenUnavailable: true     // passthrough shim for browsers without TT
});
```

Behavior contract (identical to jam-build's current inline script):

* `default` policy: escaping `createHTML` (6-char), same-origin/allowlisted
  `createScriptURL` (throws on disallowed origin), **no** `createScript`.
* `enforce: 'auto'` + no CSP meta → register nothing (dev passthrough).
* No TT support in browser → shim (`trustedTypes.createPolicy` returning plain
  strings, plus the `createElement('script').src` setter patch) so sinks never throw.
* Custom-element / web-component policies are unaffected: components register their
  own named policies at their own load time (wcb-based), exactly as today.

### Sanitize sub-path: `@localnerve/trusted-types-bootstrap/sanitize`

```js
// Only this module imports DOMPurify (~11 KB gzip). Apps without rich content
// never pay for it.
import { createSanitizerPolicy } from '@localnerve/trusted-types-bootstrap/sanitize';

const policy = createSanitizerPolicy('app-rich', {
  USE_PROFILES: { html: true },   // DOMPurify config passthrough
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong']
});

// use at the sink:
el.innerHTML = policy.createHTML(dirtyHtml);
```

Internals: creates a named policy whose `createHTML` calls
`DOMPurify.sanitize(input, { ...config, TRUSTED_TYPES_POLICY: null })`, so
DOMPurify does not create its internal `dompurify` policy. The policy name is the
first argument and must be in the CSP allowlist (detected by trusted-types-rules
as usual).

### Non-browser exports

* `escapeHtml(input)` — self-contained 6-char escape (byte-identical to wcb's
  `escapeHtml`; shared test vector guards drift), usable in build-time/computed contexts.
* `defaultPolicyHooks({ scriptURLOrigins })` returning the hook objects, for
  apps that want to register policies manually.

## Package layout

```
trusted-types-bootstrap/            (own GitHub repo: localnerve/trusted-types-bootstrap)
├── package.json                    name: @localnerve/trusted-types-bootstrap, type: module
├── index.js                        core entry: bootstrapTrustedTypes + escapeHtml re-export
├── lib/
│   ├── escape.js                   6-char escape (single source of truth)
│   ├── shim.js                     no-TT passthrough shim
│   └── sanitize.js                 DOMPurify-backed createSanitizerPolicy
├── test/                           node --test + jsdom for browser-path coverage
├── eslint.config.js
├── readme.md
└── LICENSE.md                      BSD-3-Clause (LocalNerve)
```

`exports` map:

```json
{
  ".": "./index.js",
  "./sanitize": "./lib/sanitize.js"
}
```

Dependencies: **none required** for the core. `dompurify` — either a regular
dependency (simplest, but then it installs even if unused) or a peer/optional
dependency documented as "required only when importing `/sanitize`". Decision at
scaffold time; lean toward regular dependency + tree-shaking since the sanitize
module is a separate entry point never imported by escape-only apps.

## Relationship to existing packages

| Package | Scope | TT role |
| --- | --- | --- |
| `@localnerve/web-component-build` | web component build pipeline | **Component-level** runtime helpers (`escapeHtml`, `getTrustedPolicy`, `trustedHtml`) inlined into each component's bundle; components register their own named policy. |
| `@localnerve/trusted-types-bootstrap` (new) | **app/page-level** bootstrap | Registers the app's `default` + named policies, shim, violation logging. One call per app. |
| `@localnerve/trusted-types-rules` | build-time audit | Computes the CSP `trusted-types` allowlist from built JS (AST). Consumes output of both above; no changes needed — named policies are declared at call sites and detected as today. |

The 6-char escape exists in two places by design: wcb's `escapeHtml`
(component-level, build-time-inlined) and the bootstrap core (app-level, runtime).
They must stay byte-identical; a shared test vector should guard that. If this
duplication becomes annoying, the bootstrap could depend on wcb's browser module —
but wcb is currently a component *build* tool, so keeping the escape self-contained
in both avoids coupling an app-runtime lib to a build-time one.

## Migration plan (jam-build as first adopter)

1. Scaffold the package (own repo), implement core + sanitize + tests. Publish RC.
2. jam-build: replace the body of `src/application/client/scripts/inline/trusted-types.js`
   with the import + config call (keep the file as the FIRST inline script; it
   shrinks to ~10 lines). The `jam-app-static` policy moves into the config's
   `policies` map; `window.trustedStaticHtml` continues to be attached via the
   policy's `helper`.
3. Rebuild jam-build: confirm audit output unchanged
   (`trusted-types default editable-object jam-app-static`) and inline script CSP
   hash regenerates (hashstream handles it automatically).
4. Prod rebuild + live verification (CSP directive, zero violations, component
   connects) — manual, user-confirmed.
5. Reuse in next web app project; collect friction; iterate on the API.

## Open questions (resolve at scaffold time)

* `dompurify` as regular vs peer dependency of the bootstrap package.
* Whether `enforce: 'auto'` detection should also respect a CSP *header* (some
  apps may move off meta tags). Current jam-build uses meta; keep auto = meta for now.
* Violation logging: keep `console.warn` always, or gate behind a config flag only
  (current code logs unconditionally). Leaning: always-on warn — it is cheap and the
  event never fires in healthy prod.
* Should the shim also patch other sinks (`insertAdjacentHTML`) for robustness?
  Current shim only guards `createElement('script').src`; browsers without TT
  ignore `require-trusted-types-for` so nothing else can throw. Keep as-is unless
  evidence says otherwise.
