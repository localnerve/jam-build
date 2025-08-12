# Jam Build

> A high-performance project template for custom hybrid jam-stack offline MPA webapps

## Summary
This is a template repository for starting a webapp. It renders a versionable, service worker first, offline multi-page JAM app. No frameworks, just files and libs. it is easily extended with server side subapps and apis.

## Design Points
This project design is different from most web apps. This project builds an offline, service worker first, multi-page application. There is no client side router, all navigation requests render directly from the service worker with a stale-while-revalidate strategy that offers an update prompt system for the user to receive updates to pages and the app itself.

Using a minimal javascript, progressively enhanced approach, each navigation runs a stateless page start then supplies an optional page module that can participate in application state for a given page.

## Build Process
The build produces the application from source and data to a single directory, ideal for integration with a service vendor or optionally with a portable container (docker container supplied).

### Important Files
The are two main control files for directing the build and its contents.
+ **/data/site-data.json** - Contains site-wide data used to direct the build and produce the contents.
+ **/src/build/settings.js** - Contains the directions and options of the build tools used to produce the application.

### Steps

+ **images** - Generates responsive images and optimizes all images. As a side effect, updates the build-time, in-memory `site-data` representation to supply paths and image processing data to other build steps (templating html, sass compiled styles).

+ **styles** - Creates the stylesheets for the application. Compiles all the sass stylesheets in `src/application/client/styles` for the main stylesheet.

+ **scripts** - Create the scripts for the application. Bundles, minifies, and makes replacements in the client-side javascript.

+ **assets** - Generates other miscellaneous assets for the application. Includes generating the robots.txt and sitemap.xml from the `site-data`, also other assets like web manifest and browser config.

+ **asset revisions** - Generates 10 character hex hash for every asset file name in the distribution directory.

+ **templates** - Generates the html from the `site-data`, page, and content templates. Inlines css and javascript for each page.

+ **page revisions** - Fixes up asset references in the html pages with their asset revisioned equivalent.

+ **service worker** - Generate the main service worker and it's satelite files.

+ **html** - Minify the final html and generate a CSP policy for all css and javascript references.

## Technology Stack

### Runtime

* [Expressjs](https://expressjs.com)

### Buildtime

* [Handlebars](https://handlebarsjs.com/guide/)
* [Sass](https://sass-lang.com/documentation/)
* [Workboxjs](https://developer.chrome.com/docs/workbox/)
* [Gulp](https://gulpjs.com)
* [Rollup](https://rollupjs.org/)
* [Localnerve](https://localnerve.com)

## Author and License

Jam-build, a web application practical reference.
Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC

This file is part of Jam-build.
Jam-build is free software: you can redistribute it and/or modify it
under the terms of the GNU Affero General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later version.
Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.
You should have received a copy of the GNU Affero General Public License along with Jam-build.
If not, see <https://www.gnu.org/licenses/>.
Additional terms under GNU AGPL version 3 section 7:
a) The reasonable legal notice of original copyright and author attribution must be preserved
  by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC" in this material, copies, or source code of derived works.