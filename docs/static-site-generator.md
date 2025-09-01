---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: August 30, 2025
Title: Jam-Build Custom Static Site Generator
---

# Jam-Build Custom Static Site Generator

## Overview

Jam-Build features a sophisticated custom static site generator built on top of Gulp, designed specifically for building high-performance, offline-first web applications. The generator combines Handlebars templating, Sass compilation, advanced JavaScript bundling with Rollup, responsive image processing, and comprehensive asset management.

## Quick Links

* 📐 [Architecture](#architecture)
* 🔧 [Build Process Flow](#build-process-flow)
* 👷 [Template System](#template-system)
* 🗂️ [Asset Processing](#asset-processing)
* 🗄️ [Asset Management](#asset-management)
* 😏 [Development Features](#development-features)
* ✴️ [Integration Points](#integration-points)
* 🪁 [Usage](#usage)
* ⛩️ [Site Data Configuration](#site-data-configuration-and-template-system)
* 🌌 [Template System Integration](#template-system-integration)
* 💚 [Template Compilation Examples](#template-compilation-examples)

## Architecture

### Build System Components

The static site generator consists of multiple specialized build modules, each handling a specific aspect of the build process:

```
src/build/
├── index.js         # Build orchestration and task sequencing
├── settings.js      # Configuration management for prod/dev builds
├── data.js          # Site data loading and caching (site-data.json)
├── templates.js     # Handlebars template compilation and rendering
├── hb-helpers.js    # Custom Handlebars helper functions
├── styles.js        # Sass compilation and CSS processing
├── scripts.js       # JavaScript bundling with Rollup
├── images.js        # Responsive image processing
├── assets.js        # Asset generation (sitemaps, manifests)
├── html.js          # HTML minification
├── revision.js      # Asset versioning and cache-busting
├── sw.js            # Service worker generation
└── copy.js          # File copying utilities
```

### Data-Driven Architecture

The generator is driven by a central `site-data.json` file that defines:
- Page structure and metadata
- Navigation configuration
- Image processing rules
- Build settings and paths
- Content organization

## Build Process Flow

### 1. Build Orchestration (`index.js`)

The main build sequence follows a carefully orchestrated pipeline:

```javascript
export async function createBuild (settings, args) {
  return gulp.series(
    // 1. Environment Setup
    rimraf.bind(null, settings.dist, {}),           // Clean dist directory
    mkdirp.bind(null, settings.dist, {}),           // Create dist directory
    mkdirp.bind(null, settings.distImages, {}),     // Create images directory
    
    // 2. Asset Processing
    dirCopy.bind(null, settings.copyImages),        // Copy static images
    imageProcessingSequence,                        // Generate responsive images
    createStyles.bind(null, settings.styles),       // Compile Sass → CSS
    createScripts.bind(null, settings.scripts),     // Bundle JavaScript
    generateAssets.bind(null, settings.assets),     // Generate sitemaps/manifests
    
    // 3. Versioning and Templates
    assetRevision.bind(null, settings.revision),    // Add cache-busting hashes
    renderHtml.bind(null, settings.templates, args), // Render Handlebars templates
    pageRevision.bind(null, settings.revision),     // Update asset references
    
    // 4. Finalization
    buildSwMain.bind(null, settings.sw),            // Generate service worker
    minifyHtml.bind(null, settings.html),           // Minify HTML output
    
    // 5. Optional Debugging
    audit // Dump build data if --dump flag provided
  );
}
```

### 2. Configuration Management (`settings.js`)

Provides environment-specific build configurations:

```javascript
export function createSettings (prod = true) {
  return {
    prod,
    // Asset processing configuration
    styles: {
      srcClient: 'src/application/client',
      prod,
      webStyles: '/styles' // URL path for CSS files
    },
    scripts: {
      prod,
      webScripts: '/', // URL path for JS files
      replacements: {
        // Environment-specific string replacements
        'process.env.AUTHZ_URL': JSON.stringify(process.env.AUTHZ_URL),
        'process.env.AUTHZ_CLIENT_ID': JSON.stringify(process.env.AUTHZ_CLIENT_ID)
      }
    },
    // Responsive image configuration
    images: {
      responsiveConfig: {
        'hero-*.jpg': [
          { quality: 80, width: 670, progressive: true },
          { quality: 80, width: 1024, progressive: true },
          { quality: 65, width: 1440, progressive: true },
          { quality: 65, width: 1920, progressive: true }
        ]
      }
    }
  };
}
```

## Template System

### Handlebars Template Processing (`templates.js`)

The template system uses Handlebars with a sophisticated partial system:

#### Template Structure
```
data/
├── site-data.json           # Central data configuration
├── partials/
│   ├── page/               # Page layout templates
│   │   ├── header.hbs
│   │   ├── footer.hbs
│   │   └── {page}.hbs
│   └── content/            # Page-specific content
│       ├── home/
│       │   ├── intro.hbs
│       │   └── features.hbs
│       └── about/
│           └── mission.hbs
```

#### Template Compilation Process

1. **Data Loading**: Loads `site-data.json` and caches for reuse
2. **Partial Discovery**: Automatically discovers page and content templates
3. **Inline Assets**: Compiles inline CSS and JavaScript
4. **Helper Registration**: Registers custom Handlebars helpers
5. **Template Assembly**: Combines layouts with content using the pattern:
   ```handlebars
   {{> header }}{{> {page-template} }}{{> footer}}
   ```

#### Custom Handlebars Helpers (`hb-helpers.js`)

Provides powerful template utilities:

```javascript
// String manipulation helpers
capFirst(sentence)        // Capitalize first letter of each word
subWords(sentence, start, end)  // Extract word ranges
subChars(word, start, end)      // Extract character ranges
concat(...args)           // Concatenate strings
strip(subject, ...exclusions)   // Remove specific words

// Logic helpers  
equals(value1, value2)    // Strict equality testing
or(value1, value2)        // Logical OR operations

// Asset helpers (bound with context)
imageUrl(file)            // Generate image URLs with proper root
styleUrl(file)            // Generate stylesheet URLs  
scriptUrl(file)           // Generate script URLs
svgPage(page)             // Dynamic SVG partial selection

// State management
setState(reference, value) // Store temporary template state
getState(reference)       // Retrieve template state
```

### Inline Asset Processing

The template system supports inline CSS and JavaScript:

#### Inline CSS Processing
- Sass compilation with production optimization
- Automatic CSS minification in production builds
- Load path resolution for imports and dependencies

#### Inline JavaScript Processing  
- Rollup bundling with tree-shaking
- Environment variable replacement
- Production minification with Terser

## Asset Processing

### Sass/CSS Pipeline (`styles.js`)

#### Features
- **Dart Sass Compilation**: Modern Sass processing with enhanced performance
- **Asset Functions**: Custom Sass functions for dynamic asset path resolution
- **Autoprefixer Integration**: Automatic vendor prefix handling
- **Load Path Management**: Supports node_modules and local imports
- **Data Integration**: Site data available in Sass via custom functions

#### Asset Function Integration
```scss
// Custom Sass functions provide dynamic asset paths
.hero {
  background-image: image-url('hero-1440-size.jpg');
  font-family: font-url('custom-font.woff2');
}

// Site data integration
@each $page in data('nav-pages') {
  .page-#{$page} { /* page-specific styles */ }
}
```

### JavaScript Bundling (`scripts.js`)

#### Rollup Configuration
- **Multiple Entry Points**: Supports main app, admin interface, and page-specific bundles
- **Code Splitting**: Automatic chunk generation for optimal loading
- **Tree Shaking**: Dead code elimination in production builds
- **Dynamic Imports**: Support for lazy loading with variable resolution

#### Plugin Stack
```javascript
[
  dynamicImportVariables(),    // Dynamic import with variables
  outputManifest(),           // Asset manifest generation  
  nodeResolve(),              // Node module resolution
  replace(),                  // Environment variable replacement
  alias(),                    // Path aliasing
  nodePolyfills(),            // Node.js API polyfills for browser
  istanbul(),                 // Code coverage instrumentation (dev)
  terser(),                   // Minification (production)
  visualizer()                // Bundle analysis
]
```

#### Environment Integration
- **Build-time Variables**: Injects environment variables and build metadata
- **Development/Production Modes**: Different optimization strategies
- **Source Maps**: Full source map support for debugging

### Responsive Image Processing and Metadata Generation (`images.js`)

#### Intelligent Image Processing Pipeline

The image processing system goes far beyond simple resizing - it creates a sophisticated metadata system that drives both CSS generation and HTML optimization. During the image processing phase, the build system captures detailed information about each generated image variant, including dimensions, file sizes, MIME types, and quality settings. This metadata is dynamically injected into the cached `site-data.json` object in memory, making it available to both the Sass compilation and template rendering phases.

#### Metadata Capture and Integration

As images are processed and resized, the system builds comprehensive metadata objects that include not just the basic file information, but performance-critical data like optimal breakpoints, loading priorities, and format specifications. This captured metadata becomes part of the site data structure under an `images` namespace, organized by image patterns and sizes. For example, hero images processed through the responsive pipeline generate entries that map each size variant to its corresponding breakpoint, creating a data structure that can be consumed by both CSS media queries and HTML preload tags.

#### CSS and Template Integration

The captured image metadata powers multiple aspects of the final output. In the Sass compilation phase, custom asset functions can access this metadata to generate responsive CSS with precise breakpoints that match the actual generated image sizes, ensuring perfect alignment between image variants and their corresponding media queries. During template rendering, this same metadata enables the automatic generation of optimized `<link rel="preload">` tags with accurate `media` attributes, ensuring that browsers preload exactly the right image variant for each viewport size, dramatically improving perceived performance.

#### Automated Image Optimization
- **Multiple Format Generation**: Creates responsive image sets with metadata tracking
- **Quality Optimization**: Different quality settings per size with performance metrics
- **Progressive JPEG**: Optimized loading with format specification in metadata
- **Breakpoint Intelligence**: Automatically determines optimal responsive breakpoints

#### Configuration and Metadata Example
```javascript
responsiveConfig: {
  'hero-*.jpg': [
    { quality: 80, width: 670, progressive: true, rename: { suffix: '-670-size' }},
    { quality: 80, width: 1024, progressive: true, rename: { suffix: '-1024-size' }},
    { quality: 65, width: 1440, progressive: true, rename: { suffix: '-1440-size' }},
    { quality: 65, width: 1920, progressive: true, rename: { suffix: '-1920-size' }}
  ]
}

// Generated metadata structure in site-data:
{
  "images": {
    "hero-home": {
      "670": { "basename": "hero-home-670-size.jpg", "mimeType": "image/jpeg", "width": 670 },
      "1024": { "basename": "hero-home-1024-size.jpg", "mimeType": "image/jpeg", "width": 1024 },
      "1440": { "basename": "hero-home-1440-size.jpg", "mimeType": "image/jpeg", "width": 1440 },
      "1920": { "basename": "hero-home-1920-size.jpg", "mimeType": "image/jpeg", "width": 1920 }
    }
  }
}
```

## Asset Management

### Revision System (`revision.js`)

#### Cache-Busting Strategy
1. **Asset Hashing**: Generates content-based hashes for all static assets
2. **Manifest Generation**: Creates mapping from original to hashed filenames  
3. **Reference Updates**: Updates all HTML references to use hashed versions
4. **Service Worker Integration**: Provides asset lists for service worker caching

### Service Worker Generation (`sw.js`)

#### Features
- **Automatic Asset Discovery**: Scans build output for cacheable resources
- **Version Management**: Generates versioned service worker with asset lists
- **Custom Logic Integration**: Merges with hand-written service worker code
- **Cache Strategy Configuration**: Supports different caching strategies per asset type

## Development Features

### Debug and Inspection

#### Dump Mode (`--dump` flag)
When run with `--dump`, the build system outputs:
- **site-data.json**: Processed site data
- **build-settings.json**: Complete build configuration  
- **render-templates.json**: Compiled template metadata
- **hb-partials.json**: All registered Handlebars partials

#### Bundle Analysis
- **Rollup Visualizer**: Generates interactive bundle analysis reports
- **Size Tracking**: Monitors asset sizes across builds
- **Dependency Analysis**: Visualizes module dependencies and relationships

### Performance Optimizations

#### Build Speed
- **Data Caching**: Site data loaded once and cached across build steps
- **Incremental Processing**: Only processes changed files where possible
- **Parallel Processing**: Concurrent asset processing where safe

#### Output Optimization
- **Asset Minification**: HTML, CSS, and JavaScript minification
- **Image Optimization**: Automatic image compression and format optimization
- **Code Splitting**: Optimal JavaScript bundle sizes
- **Tree Shaking**: Eliminates unused code

## Integration Points

### Environment Variables
- **Build-time Injection**: Environment variables injected into client code
- **Configuration Flexibility**: Different settings for development/production
- **Security**: Sensitive data handled at build time, not runtime

### Service Worker Integration
- **Asset Lists**: Automatic generation of cacheable asset inventories
- **Version Management**: Coordinated versioning between build and service worker
- **Offline Strategy**: Pre-caches critical resources for offline functionality

### Content Security Policy
- **Dynamic CSP Generation**: Generates CSP headers based on actual asset usage
- **Hash-based Security**: Uses asset hashes for inline script/style security
- **External Resource Management**: Configurable external resource permissions

## Usage

### Basic Build Commands
```bash
# Production build
npm run build

# Development build  
npm run build:dev

# Debug build with data dumps
npm run build -- --dump

# Development build with service worker instrumentation
npm run build:dev:sw
```

### Extending the Generator

#### Adding New Asset Types
1. Create processor module in `src/build/`
2. Add configuration to `settings.js`
3. Integrate into build sequence in `index.js`
4. Update template helpers if needed

#### Custom Handlebars Helpers
Add helpers to `hb-helpers.js` and they'll be automatically registered.

#### Template Structure Changes
Modify partial discovery logic in `templates.js` to support new template organizations.

# Site Data Configuration and Template System

## Site Data Structure (`site-data.json`)

The `site-data.json` file serves as the central configuration that drives the entire static site generation process. It defines site metadata, page structure, business information, and social media integration.

### Global Site Configuration

#### Site Metadata
```json
{
  "defaultTitle": "Business Name",           // Default page title fallback
  "defaultDescription": "This is a description.", // Default meta description
  "appHost": "domain.com",                   // Primary domain for canonical URLs
  "elevator": "This is an elevator pitch.", // Tagline/elevator pitch
  "themeColor": "#1B7BA1",                  // PWA theme color
  "backgroundColor": "#1B5A7F",             // PWA background color  
  "tileColor": "#DA532C",                   // Windows tile color
  "uaId": "UA-NNNNNNNNN-N"                 // Google Analytics ID
}
```

#### Business Information
```json
{
  "business": {
    "shortName": "Business Name",           // Short business name for PWA
    "name": "Business Name, LLC",           // Full legal business name
    "url": "https://domain.com",            // Primary business URL
    "domain": "domain.com",                 // Domain for structured data
    "logo": "https://domain.com/images/logo.svg", // Logo URL
    "phone": "123-456-7890",               // Business phone number
    "email": "info@domain.com",            // Business email
    "address": {                           // Complete business address
      "line1": "123 street st",
      "city": "cityname", 
      "state": "statename",
      "zip": "00000-0000",
      "country": "US"
    }
  }
}
```

#### Social Media and SEO
```json
{
  "social": {
    "facebook": "https://www.facebook.com/people/business",
    "linkedin": "https://www.linkedin.com/in/business", 
    "twitter": "https://x.com",
    "twitterMeta": {
      "image": "https://domain.com/images/ogimage-1200x630.png"
    },
    "og": {                                 // Open Graph metadata
      "title": "Business Name",
      "description": "This is a description.",
      "type": "website",
      "image": [                           // Multiple image formats for different platforms
        {
          "url": "https://domain.com/images/ogimage-1200x400.png",
          "type": "image/png",
          "alt": "Business Name", 
          "width": "1200",
          "height": "400"
        }
        // ... additional image variants
      ]
    }
  }
}
```

### Pages Configuration

Each page is defined with comprehensive metadata that controls generation, SEO, navigation, and behavior:

#### Page Structure
```json
{
  "pages": {
    "home": {
      "title": "Home",                     // Page title for <title> tag
      "type": "nav",                       // Page type: nav|admin|legal|none
      "name": "home",                      // Internal page identifier  
      "route": "/",                        // URL route for the page
      "label": "Home",                     // Navigation link text
      "template": "main-banner",           // Handlebars template to use
      "file": "home",                      // Output filename (becomes home.html)
      "sitemap": {                         // XML sitemap generation settings
        "changefreq": "monthly",
        "priority": 1.0
      },
      "order": 0                          // Navigation order
    }
  }
}
```

#### Page Types and Behavior

**Navigation Pages (`type: "nav"`)**
- Appear in main site navigation
- Include full SEO metadata
- Support all template features
- Examples: home, about, contact

**Admin Pages (`type: "admin"`)**  
- Special administrative pages
- May have `external-css` for additional stylesheets
- Can use `skip-all` to exclude shared content
- Example: `_admin` page

**Legal Pages (`type: "legal")`**
- Footer-linked legal documents  
- Lower sitemap priority
- Use `skip-all` to exclude shared content
- Examples: terms, privacy

**Error Pages (`type: "none")`**
- HTTP error pages
- Not included in navigation or normal sitemaps
- Use `skip-all` to exclude shared content
- Examples: 404, 500 error pages

#### Special Page Properties

```json
{
  "alt-label": "Log Out",               // Alternative label (e.g., when logged in)
  "skip-all": true,                     // Exclude shared 'all' content sections
  "external-css": "admin.css",          // Additional CSS file to load
  "description": "Custom page description" // Override default description
}
```

## Template System Integration

### Page Generation Process

1. **Template Selection**: Each page specifies its `template` (e.g., "main-banner")
2. **Content Discovery**: System looks for content partials in `data/partials/content/{page}/`
3. **Template Assembly**: Combines header + template + footer using pattern:
   ```handlebars
   {{> header }}{{> main-banner }}{{> footer}}
   ```

### Content Template Organization

#### Directory Structure
```
data/partials/content/
├── all/                    # Shared content for all pages
│   └── section-0.hbs      # Rendered on most pages
├── home/                  # Home page specific content
│   ├── hero-0.hbs         # Hero section
│   ├── section-0.hbs      # First content section
│   ├── section-1-app-dyn.hbs  # Dynamic app data section
│   └── section-2-user-dyn.hbs # Dynamic user data section
└── contact/               # Contact page specific content
    ├── hero-0.hbs
    └── section-0.hbs
```

#### Content Naming Convention
- **hero-{N}.hbs**: Hero/banner sections (typically first)
- **section-{N}.hbs**: Regular content sections
- **section-{N}-{descriptor}.hbs**: Specialized sections with descriptive names

### Template Data Flow

#### Site Data Availability
All templates have access to the complete `siteData` object:

```handlebars
<!-- Page title with fallback -->
{{#with (lookup siteData.pages page)}}
  {{#if title}}{{title}}{{else}}{{../siteData.defaultTitle}}{{/if}}
{{/with}}

<!-- Business information -->
{{siteData.business.name}}
{{siteData.business.phone}}
{{siteData.elevator}}

<!-- Navigation generation -->
{{#each siteData.pages}}
  {{#if (equals this.type 'nav')}}
    <a href="{{this.route}}">{{this.label}}</a>
  {{/if}}
{{/each}}
```

#### Dynamic Content Integration

The template system supports both static and dynamic content areas:

**Static Content**: Rendered at build time from Handlebars templates
```handlebars
<h3>Welcome</h3>
<p>This is the home page of the demo app</p>
```

**Dynamic Content Placeholders**: Containers for runtime data loading
```handlebars
<!-- Dynamic text content -->
<div class="dyn-content" id="app-public-home-content-intro">
  <div class="spinner"></div>
</div>

<!-- Dynamic editable data -->
<editable-object class="app-state" id="app-public-home-state" disable-edit="true">
  <div slot="loading" class="spinner"></div>
</editable-object>
```

### Advanced Template Features

#### Conditional Content Rendering
```handlebars
<!-- Page-specific content -->
{{#with (lookup content page)}}
  {{#each this}}
    <section class="{{this}}">
      {{> (lookup .. @key) ../..}}
    </section>
  {{/each}}
{{/with}}

<!-- Shared content (unless skip-all is set) -->
{{#unless (lookup (lookup siteData.pages page) 'skip-all')}}
  {{#with (lookup content 'all')}}
    {{#each this}}
      <section class="{{this}}">
        {{> (lookup .. @key) ../..}}
      </section>
    {{/each}}
  {{/with}}
{{/unless}}
```

#### Image Preloading and Optimization
```handlebars
<!-- Responsive image preloading based on site data -->
{{#with (lookup content page)}}
  {{#if (lookup this 'hero-0')}}
    {{#each (lookup ../siteData.images (concat 'hero-' ../page))}}
      <link rel="preload" href="{{imageUrl basename}}" as="image" 
            media="(max-width: {{@key}}px)" />
    {{/each}}
  {{/if}}
{{/with}}
```

#### SEO and Meta Tag Generation
```handlebars
<!-- Dynamic canonical URL -->
<link rel="canonical" href="https://{{siteData.appHost}}/{{page}}" />

<!-- Open Graph tags -->
{{#each siteData.social.og.image}}
  <meta property="og:image" content="{{url}}" />
  <meta property="og:image:width" content="{{width}}" />
  <meta property="og:image:height" content="{{height}}" />
{{/each}}
```

### Template Context Variables

Templates receive several context variables:

- **`page`**: Current page name (e.g., "home", "about")
- **`siteData`**: Complete site-data.json object
- **`content`**: Map of content template names by page
- **`inlineCss`**: Map of inline CSS partial names
- **`active`**: Current active page for navigation highlighting
- **`noIndex`**: Boolean for robots meta tag
- **`noNav`**: Boolean for navigation visibility
- **`htmlClasses`**: Array of CSS classes for html element

This data-driven approach allows for highly maintainable, SEO-optimized static sites with dynamic content capabilities, making it ideal for modern web applications that need both performance and flexibility.

## Template Compilation Examples

### Navigation Generation
The navigation system uses site data to generate consistent navigation across all pages:

```handlebars
{{#each siteData.pages}}
  {{#if (equals this.type 'nav')}}
    <li class="{{@key}}">
      <a class="{{#if (equals ../active @key)}}active{{/if}}" href="{{this.route}}">
        <span class="label">{{this.label}}</span>
        <span class="alt-label">{{this.alt-label}}</span>
      </a>
    </li>
  {{/if}}
{{/each}}
```

### Business Information Integration
Templates automatically incorporate business data throughout the site:

```handlebars
<!-- Header branding -->
<h1>
  <a href="{{siteData.pages.home.route}}">{{siteData.business.name}}</a>
  <p>{{siteData.elevator}}</p>
</h1>

<!-- Contact information -->
<a href="tel:+1-{{siteData.business.phone}}">{{siteData.business.phone}}</a>
```

This comprehensive site data structure enables the generation of professional, SEO-optimized, and maintainable static sites with sophisticated template composition and dynamic content integration capabilities.