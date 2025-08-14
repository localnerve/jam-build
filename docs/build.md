---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: August 12, 2025
Title: Build Process
---

# Build Process
The build produces the application from source and data to a single directory, ideal for integration with a service vendor or optionally with a portable container.

## Important Files
The are two main control files for directing the build and its contents:
+ **/data/site-data.json** - Contains site-wide data used to direct the build and produce the contents.
+ **/src/build/settings.js** - Contains the directions and options for the build tools used to produce the application.

## Steps

+ **images** - Generates responsive images and optimizes all images. As a side effect, updates the build-time, in-memory `site-data` representation to supply paths and image processing data to other build steps (templating html, sass compiled styles).

+ **styles** - Creates the stylesheets for the application. Compiles all the sass stylesheets in `src/application/client/styles` for the main stylesheet.

+ **scripts** - Create the scripts for the application. Bundles, minifies, and makes replacements in the client-side javascript.

+ **assets** - Generates other miscellaneous assets for the application. Includes generating the robots.txt and sitemap.xml from the `site-data`, also other assets like web manifest and browser config.

+ **asset revisions** - Generates 10 character hex hash for every asset file name in the distribution directory.

+ **templates** - Generates the html from the `site-data`, page, and content templates. Inlines css and javascript for each page.

+ **page revisions** - Fixes up asset references in the html pages with their asset revisioned equivalent.

+ **service worker** - Generate the main service worker and it's satelite files.

+ **html** - Minify the final html and generate a CSP policy for all css and javascript references.