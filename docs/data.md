# High-Level Data Design Notes

This project design is different from most web apps. This project builds an offline, service worker first, multi-page application. There is no client side router, all navigation requests render directly from the service worker cache with a stale-while-revalidate strategy that offers an update prompt system for the user to receive updates to static pages and the app itself.

## Application Dynamic Data

User and application dynamic data is network-first with local fallback. The data stores the application subscribes to are vanillajs persistent nanostores (implemented as plain proxied Objects) backed by IndexedDB. All data mutations are staged in IndexedDB and committed to the API in a batch process in the service worker for optimal resource usage. Batches are automatically committed to the API on user inactivity, page navigation, page close, or logout (user data is also purged from IndexedDB on logout).

The data service API is also versioned, and uses optimistic concurrency control (OCC). Any conflicts are resolved automatically in the client service worker by a three way merge favoring the latest local changes using a merge-based conflict resolution strategy. n.b. This version DOES NOT implement an exponential backoff retry strategy, it just immediately (and continually) tries to commit resolved conflicts.

The data service uses role based access control, this reference demonstrates two roles [user, admin], allows for multi-user usage and multiple application and user level data scopes (public, shared-user, private-user, etc).

### Application State Storage

Each navigation starts and runs the minimal javascript application statelessly. If a page is required to participate in application state, it loads an optional page module for a given page. Application data is retrieved from and stored to IndexedDB. The application login module uses sessionStorage to keep a bare-bones logged in user profile (stores email address). For data retrieval, the application maintains a request seed with a page's documents and collections in localStorage.
