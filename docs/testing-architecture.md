# Testing Architecture — Subtle Dependencies & Multi-Tier Arrangement

This document explains the non-obvious dependencies inside jam-build's test
support: how endpoints are resolved, why some values must exist at *image build
time* while others only matter at *test runtime*, and what each tier of the
testing arrangement is actually exercising. For command reference see
[testing-documentation.md](./testing-documentation.md).

## The four testing tiers

| Tier | Command prefix | App under test | Services | TLS | Coverage |
| --- | --- | --- | --- | --- | --- |
| Naked host dev | `test:local:*` | whatever is running on the host (`LOCALAPP_URL`) | none — no containers at all | optional (proxy variant) | no server-side c8 |
| Containerized dev | `test:*` (e.g. `test`, `test:webkit`) | **dev build** in Testcontainers | MariaDB + authorizer + app containers | none (host/GHA) or Caddy (devcontainer) | yes — `dev:cover` |
| Containerized prod | `test:prod*` | **production build** in Testcontainers, under c8 | same as above | **required** (external proxy) | yes — `start:cover` |
| Devcontainer | any of the above with `DEVCONTAINER=true` | unchanged from tier 2/3 | containers join a shared network; Caddy front provides real HTTPS via DuckDNS | yes | yes |

Key distinctions that are easy to conflate:

- **`LOCALAPP_URL`** short-circuits *everything*: `globals.js` returns an empty
  teardown and no containers are started. The test harness assumes the app,
  authorizer, and database already exist on the host. This is for rapid naked
  development only — never use it to validate production behavior.
- **`DEVCONTAINER`** changes *networking and endpoints*, not the build. A
  devcontainer run of tier 2 is still a dev build; it merely gets TLS in front
  of it via Caddy.
- **`TEST_BUILD=prod`** changes *what is built and how it runs*. It is
  deliberately decoupled from `DEVCONTAINER`: prod tests can run anywhere that
  has a TLS reverse proxy in front of the containers, devcontainer or not.
- Dev and prod test runs share the same network alias (`jam-build-app`) and
  port (5000). They are **never meant to run simultaneously** — Docker will
  fail loudly on the duplicate container name if you try.

## The two consumers of `AUTHZ_URL` (and why ordering matters)

This is the subtlest dependency in the arrangement. `process.env.AUTHZ_URL`
feeds two completely different consumers at two different times:

### Consumer 1 — baked into the client bundle at image build time

`src/build/settings.js` performs a rollup replace of `process.env.AUTHZ_URL`
and `process.env.AUTHZ_CLIENT_ID` inside the client scripts, and also uses the
raw value to populate the CSP `connect-src` / `framesrc` directives in the
page templates. In **production builds** this CSP is hash-locked and enforced
in every browser; in dev builds the meta tag content is stripped, so the baked
CSP is effectively unenforced.

Once the image exists, neither of these can be changed by any test-side knob.

### Consumer 2 — the runtime endpoint, injected into browsers at test time

`src/test/page.utils.js` → `startPage()` runs, on every navigation:

```js
await page.addInitScript(
  initScriptDataUpdate, [process.env.AUTHZ_URL, process.env.AUTHZ_CLIENT_ID]
);
```

which sets `window.__authorizerOverrides`. The client's login code
(`src/application/client/scripts/main/login.js`) prefers this override over the
baked value:

```js
if (window.__authorizerOverrides) {
  ({ authorizerURL, clientID } = window.__authorizerOverrides);
} else {
  authorizerURL = process.env.AUTHZ_URL; // baked at bundle time
}
```

The test harness itself (API tests in `src/test/authz.js`, fixtures, login
utils) also reads `process.env.AUTHZ_URL` directly at runtime.

### Why dev-mode ordering "accidentally" worked

In the containerized dev flow, `globals.js` used to assign
`process.env.AUTHZ_URL` **after** `createAppContainer()` returned — i.e. after
the image was already built with whatever value the environment happened to
hold at build time. That was safe for two compounding reasons:

1. Browsers never used the baked value — `__authorizerOverrides` always won,
   and it was fed by the *runtime* env var (set in time, before any test
   navigated).
2. The dev build's CSP meta content is stripped, so a mismatch between the
   baked `connect-src` and the URL the browser actually called was unpoliced.

Both properties are specific to **dev builds**. This is why the same ordering
would be broken in prod mode: the override correctly points the browser at the
TLS authorizer endpoint, but the hash-locked CSP only allows whichever origin
was baked in at build time — and the first authorizer request would violate it.

### The invariant that makes `TEST_BUILD=prod` correct

In `globals.js`, `resolveUrls()` settles `process.env.AUTHZ_URL` (and
`BASE_URL`) **before** any container is created, when `TEST_BUILD=prod`:

- build time and test runtime are guaranteed to agree on one endpoint;
- the baked CSP `connect-src`/`framesrc` matches the URL
  `__authorizerOverrides` will inject.

If you ever add a second prod endpoint pair, preserve this invariant: the
value baked at image-build time and the value injected at test runtime must be
the same string.

## TLS / HSTS dependencies

- The server sends `strict-transport-security` only when it believes it is
  behind TLS: either `--TLS` on the command line, or implied by
  `DEVCONTAINER=true` (`src/application/server/lib.js`, `processArgs()`).
- The dev entrypoint (`dev:cover`) passes neither — so a dev build served
  through the devcontainer Caddy is *still* TLS-agnostic at the app level.
  (The `DEVCONTAINER=true` implication covers the naked-host devcontainer case
  where the server runs with that env var set.)
- The prod entrypoint (`start:cover --TLS`) declares it explicitly, because
  prod mode may run on hosts without `DEVCONTAINER`.
- Tests in `pages/page.webspecs.test.js` compute expectations from
  `BASE_URL`: an `https:` target expects the full HSTS header; an `http:`
  target expects none. This is why a dev build behind Caddy "fails correctly"
  rather than silently passing — and why prod mode exists to make those tests
  pass *for real*.

## Trusted Types in prod test mode (rule: no DOM script injection)

Prod pages enforce `require-trusted-types-for 'script'` with a **computed,
hash-locked** policy allowlist. The app's bootstrap owns the reserved
`default` policy and deliberately registers it **without** a `createScript`
hook (so `eval`/`new Function` stay blocked). Per spec, plain-string
auto-conversion at Trusted Types sinks consults *only* the `default` policy —
no named test policy can intercept them. Consequence:

> **The harness must never inject DOM `<script>` elements into app pages**
> (`page.addScriptTag({content, path})`). Under the prod CSP that is illegal
> no matter what hashes or allowlist entries are baked in, because the sink
> requires a `TrustedScript` from `default`, which does not exist on purpose.

The harness therefore runs all page-side test code through
**`page.evaluate` / `page.addInitScript`** — browser-protocol execution that
is outside both `script-src` and Trusted Types enforcement:

- `page.utils.js startPage()`: the debug flag (`localStorage.setItem(...)`)
  is a one-line `evaluate`, not an injected script.
- `coverage.js getSwCoverage()`: the SW message helper lives *inside* the
  `evaluate` body (a local function), not as an injected script.
- `initScriptDataUpdate` (`window.__authorizerOverrides`, the SW data-update
  hook) was already an `addInitScript` and needed nothing.

An earlier attempt baked a `jam-app-tests` policy name + injected-script sha256
hashes into the prod test image's CSP meta. It was reverted: named policies
cannot satisfy the `default`-only sink, so it never worked — and keeping those
extra directives would only *weaken* the exact property prod mode exists to
test. The prod test image's CSP meta is byte-identical to a real deployment's.

The one remaining DOM injection is legal by construction: `authz.js` injects
`@localnerve/authorizer-js` on a **blank fixture page** (no CSP meta at all)
during sign-in; only the captured cookies flow into real contexts.

## Coverage pipeline (identical for dev and prod test modes)

Both containerized tiers run the server under `c8` and extract coverage on
teardown:

1. Entrypoint wraps the server in c8 (`dev:cover` or `start:cover`).
2. The app registers a test-only `POST /shutdown` route when started with
   `--TEST`.
3. `globals.js` teardown POSTs `/shutdown`, waits briefly for c8 to flush,
   then tars `/home/node/app/coverage` out of the container and extracts it
   into `coverage/<timestamp>/` in the repo root (pruning older days).

This is why the `runtime-prod-cover` Dockerfile stage exists: a plain prod
image does `npm ci --omit=dev` (no c8), so "production-like" testing would
otherwise silently lose server-side coverage. The stage reuses the shared
builder layer, so it costs only one extra small image layer — not a second
build of the app.

**Service-worker instrumentation is mode-gated at build time.** `src/build/sw.js`
only instruments the `sw.custom` bundle (istanbul, `self.__coverage__`) when
`SW_INSTRUMENT` is set. The Dockerfile sets it in *both* test modes: always for
the dev build, and for the prod build **iff** `TEST_BUILD=prod` reaches the
builder (build arg from `services.js`). A real-deploy prod image never carries
instrumentation. Only chromium ever requests SW coverage (`stopJS` returns
early on other browsers), so a missing `self.__coverage__` surfaces as
`Object.keys(undefined)` in `coverage.js` — if you see that, the image was
built without `TEST_BUILD=prod` (stale tag; use `FORCE_BUILD=1`).

**Naked-host (`test:local:*`) runs collect no server-side coverage** — there
is no c8 wrapper and no container to tar from. Treat local runs as behavior
verification, not coverage evidence.

### Build-only runs (`FORCE_BUILD`)

`npm run test:build` / `test:build:prod` run the global setup/teardown without
Playwright, purely to (re)build the image. One accommodation makes this work on
hosts where `BASE_URL` cannot route back to the container (a bare host has no
Caddy in front of it):

- **Teardown**: when `FORCE_BUILD` is set, `shutdownAppContainer()` stops the
  container directly — no `/shutdown` POST, no coverage tar. No tests ran, so
  there is no coverage to flush.

Prod image builds follow the same endpoint contract as real deployments:
`AUTHZ_URL`/`BASE_URL` are set by `test:env:prod` (devcontainer Caddy defaults;
override for other hosts) *before* the build, and baked into the bundle and CSP.
There is no such thing as an endpoint-less prod image. If you pre-build on one
host and later test against different endpoints, run with `FORCE_BUILD=1` so
the image rebuilds with the correct bake — a cached `jam-build-test-prod`
image will otherwise be reused silently.

## Image tags, build caching, and switching modes

- `TEST_BUILD=prod` → image tag `jam-build-test-prod`, target
  `runtime-prod-cover`, `DEV_BUILD=0`.
- dev mode → image tag `jam-build-test`, target `runtime-dev`, `DEV_BUILD=1`.

The tags are distinct deliberately: `createAppContainer()` reuses an existing
image when `checkImageExists()` passes and `FORCE_BUILD` is unset. A shared
tag would make switching modes silently serve the stale, wrong-mode image.
Use `FORCE_BUILD=1` (or `npm run test:build`) to force a rebuild of either
mode.

## Caddy / devcontainer specifics

- The full devcontainer stack lives in `~/work/dev-container`; this repo's
  `devcontainer/` holds only the project-specific Caddy site blocks and the
  one-time registration script (`npm run test:devcontainer:setup`).
- Site blocks (kept aligned with `globals.js` defaults):
  - `rp-localnerve.duckdns.org` → `jam-build-authorizer:9011`
  - `ln.rp-localnerve.duckdns.org` → `jam-build-app:5000`
- Inside the devcontainer, containers join the shared network
  (`DEVCONTAINER_NETWORK`) by alias instead of an ephemeral Testcontainers
  network; Caddy reaches them over that same network.
- Outside the devcontainer, prod mode requires explicit
  `BASE_URL` / `AUTHZ_URL` (https) — the harness fails fast rather
  than assuming someone else's DuckDNS names.

## Known dead config (do not rely on it)

`playwright.config.js` sets `use: { bypassCSP }` for `LOCALAPP_URL` runs, but
no fixture consumes a `bypassCSP` option — nothing in the suite actually
bypasses CSP. The reason local/prod testing still works is architectural
(Caddy-issued trusted certs + hash-based policies that match the real
endpoints), not a bypass. If you ever see "CSP bypass" referenced, it refers
to this unused setting.

## Quick mental model

```
              build time                        test runtime
AUTHZ_URL ──────────────┬──────────────────────────┬─────────────────────────
   │                    │                          │
   ├─ baked into bundle (rollup replace)           ├─ window.__authorizerOverrides
   ├─ baked into CSP connect-src/framesrc          │  (page.utils.js addInitScript)
   │    [prod: hash-locked, enforced]              ├─ harness API calls (authz.js)
   │    [dev:   stripped, unenforced]              └─ waitForURL assertions
   └─ image frozen. Nothing above this line          both read process.env.AUTHZ_URL
      can change after the build.                    set by globals.js setup()
```

The whole arrangement reduces to one rule: **anything baked at build time must
already equal what runtime will do.** Dev mode got away with breaking that
rule because both consumers were unenforced; prod mode enforces it, which is
the point of running prod tests.
