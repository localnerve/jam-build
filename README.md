# Jam Build

> A web application reference of a custom static site, but as a versionable, offline, service-worker MPA, with batching, multi-user OCC, RBAC authz, and data on top.
>
> Minimal, hand-crafted vanillajs by a human.

## Donate

If this project is helpful or useful, please consider donating to help me create and maintain more great things.  
[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/donate/?hosted_button_id=U98LEKAK7DXML)  
I'm also available for hire.

## Summary

This project is a starting point for a web application. It builds a versionable, service worker first, offline, multi-page JAM webapp with multi-user data. The project design is different from most webapps because of it's use of a service worker as the central component. The service worker renders pages directly from cache, handles version updates, offline behavior, update batching, and optimistic concurrency resolution. The underlying data design [Document > Collection > Property] lends itself to most applicatons.

### Background

This project is based on a [localnerve](https://www.localnerve.com) sassy-handlebars static site generator on branch [font-only](https://github.com/localnerve/jam-build/tree/front-only). It's an file-based site-generator that uses build-time image processors to generate metadata used to render preload tags and other performance-oriented styles and markup. CSS Classes are generated based on template partial file names for optional specificity. Older, established toolchain, no magic, minimal deps.

## Docs

* [How to run locally](docs/localsetup.md)
* [Build](docs/build.md)
* [Commands](docs/commands.md)
* [Data](docs/data.md)
* [Stats](docs/stats.md)

## Technology Stack

* Vanillajs, plain Javascript Object persistent nanostores

### Runtime Dependencies

* [Expressjs](https://expressjs.com)
* [Workboxjs](https://developer.chrome.com/docs/workbox/)
* [Authorizer](https://authorizer.dev)
* [Mariadb](https://mariadb.com)

### Development Dependencies

* [Handlebars](https://handlebarsjs.com/guide/)
* [Sass](https://sass-lang.com/documentation/)
* [Playwright.dev](https://playwright.dev)
* [Gulp](https://gulpjs.com)
* [Rollup](https://rollupjs.org/)
* [Localnerve](https://github.com/localnerve)

## Author and License

Jam-build, a web application practical reference.  
Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC  

Jam-build is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU Affero General Public License](LICENSE.md) for more details.  
Additional terms under GNU AGPL version 3 section 7:  
  a) The reasonable legal notice of original copyright and author attribution must be preserved  
     by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"  
     in this material, copies, or source code of derived works.