# Jam Build

> A web application reference of a custom static site, but as a versionable, offline, service-worker MPA, with batching, multi-user OCC, RBAC authz, and data on top.
>
> Minimal, hand-crafted vanillajs by a human.

## Quick Links

* 🚀 [Getting Started](docs/localsetup.md)
* 💡 [How This is Different](docs/how-different.md)
* ⚡ [Static Site Generator](docs/static-site-generator.md)
* 📊 [Data Store and Flow Architecture](docs/nanostores.md)
* 📡 [Batch Update and Conflict Flow](docs/batch-updates.md)
* ⏳ [Service Worker Timer Architecture](docs/heartbeat-timer.md)
* 🧪 [Testing Procedure and Detail](docs/testing-documentation.md)
* 🎭 [Performance Audits](docs/performance-audits.md)
* 🔧 [Build Process Summary](docs/build.md)
* ✨ [Command Reference](docs/commands.md)
* 📈 [Project Stats Snapshots](docs/stats.md)

> A Go Fiber API with monitoring and multi-database support, as a drop-in replacement for the backend in this project, is available at [jam-build-propsdb](https://github.com/localnerve/jam-build-propsdb).

## Project Summary

### Overview

This project serves as a starting point for a PWA (Progressive Web Application). It builds a versionable, offline-first, multi-page JAM (JavaScript, APIs, Markup) web app with support for multi-user data.

### Key Features

* **Service Worker First:**
  * The project design centers around a service worker, which is different from most web applications.

* **Custom Sass/Handlebars Static Site Generator:** 
  * A multi-page application built using a custom static site generator that leverages Sass and Handlebars.
  * Image processors generate metadata used to render preload tags and other performance-oriented styles and markup.
    - Custom WASM image processor pipeline for performant optimization and `webp` format creation. Boosts build speed and reduces external toolchain dependencies. Eases application image maintenance, reduces image size.
  * See the [static site generator document](docs/static-site-generator.md) for more detail.
  * Static site only [branch](https://github.com/localnerve/jam-build/tree/front-only) (sans data layer) available.

* **Offline Capabilities:**
  * Pages are rendered directly from the service worker cache using a stale-while-revalidate strategy.
  * Service worker manages offline data updates and reconciliation when the network is restored.

* **Version Updates:** 
  * The service worker handles version updates and ensures that users receive the latest static pages and app versions.
  * Supports versioned deployment for both front-end and back-end components.

* **Service Worker Data Update Batching:**
  * Data mutations are staged in IndexedDB and committed to the API in offline supported batch processes, optimized for resource usage.

* **Optimistic Concurrency Control:**
  * The service worker and data service handle multi-user optimistic concurrency control with three-way merge resolution.

* **Role-Based Access Control:**
  * Supports role-based access control for different user roles (e.g., user, admin).

* **Reusable, General Data Design:**
  * Features a reusable, general data design with application and user regions.

* **Established Toolchain:**
  * Uses a well-established toolchain with no magic (no hidden or complex processes) and minimal dependencies.

## Technology Stack

* Vanillajs, plain Javascript Object persistent nanostores

### Runtime Dependencies

* [Expressjs](https://expressjs.com)
* [Workboxjs](https://developer.chrome.com/docs/workbox/)
* [Authorizer](https://github.com/localnerve/authorizer)
* [Mariadb](https://mariadb.com)

### Development Dependencies

* [Handlebars](https://handlebarsjs.com/guide/)
* [Sass](https://sass-lang.com/documentation/)
* [Playwright](https://playwright.dev)
* [Gulp](https://gulpjs.com)
* [Rollup](https://rollupjs.org/)
* [Docker](https://docker.com)
* [Localnerve](https://github.com/localnerve)

## Donate

If this project is helpful or useful to you, please consider donating to help me create and maintain more great things.  
[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/donate/?hosted_button_id=U98LEKAK7DXML)  
I'm also available for [hire](https://www.localnerve.com/contact).

## Author and License

Jam-build, a web application practical reference.  
Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC  

Jam-build is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU Affero General Public License](LICENSE.md) for more details.  
Additional terms under GNU AGPL version 3 section 7:  
  a) The reasonable legal notice of original copyright and author attribution must be preserved  
     by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"  
     in this material, copies, or source code of derived works.