---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: August 12, 2025
Title: Design Points
---

# Design Points

## Front End

This project design differs from most web apps. It builds an offline-first, service worker-based, multi-page application. There is no client-side router; all navigation requests are rendered directly from the service worker cache using a stale-while-revalidate strategy. An update prompt system allows users to receive updates to static pages and the app itself.

## Application Data

### Data Architecture

* **Network-First with Local Fallback:** User and application dynamic data is fetched first from the network, with local fallback provided by IndexedDB.
* **Data Stores:** The application subscribes to vanillajs persistent nanostores (implemented as plain proxied Objects) backed by IndexedDB.
* **Data Mutations:** All data mutations are staged in IndexedDB and committed to the API in batch processes within the service worker for optimal resource usage. Batches are automatically committed when the user is inactive, navigates pages, closes a page, or logs out. User data is also purged from IndexedDB upon logout.

### Conflict Resolution

* **Optimistic Concurrency Control (OCC):** The data service API uses OCC to handle conflicts.
* **Conflict Resolution Strategy:** Conflicts are resolved automatically in the Service Worker using a three-way merge strategy that favors the latest local changes. **Note:** This version does not implement an exponential backoff retry strategy; it immediately and continually attempts to commit resolved conflicts.

### Role-Based Access Control

* **Roles:** The data service supports two data-tier roles: user and admin.
* **Multi-User Usage:** The design allows for multi-user usage with multiple application and user data scopes (e.g., public, shared-user, private-user).

### Application State Storage

* **Stateless Navigation:** Each navigation starts and runs the minimal JavaScript application statelessly.
* **Page Modules:** If a page requires application state, it loads an optional page module.
* **Data Retrieval:** All application and user state is retrieved from and stored in IndexedDB.
* **Login Module:** The application login module uses sessionStorage to store a basic logged-in user profile (e.g., email address).
* **Request Seed:** The application maintains a persistent request seed with a page's documents and collections in localStorage.
* **Persistent Nanostores:** The application sends and recieves data updates through plain, proxied Javascript objects that emit events, and load/store updates.