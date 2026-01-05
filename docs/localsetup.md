---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: December 30, 2025
Title: Getting Started
---

# How to Run Locally

> **Note:** Safari will not work as-is, interactively, locally without using named TLS proxy hosts in the procedure described [below](#setup-for-local-tls-proxy-hosts).

## Docker Setup

### Installation Steps
1. **Install Docker Desktop**: Download and install Docker Desktop from the official website.
2. **Run Docker Compose**:
   - Execute `docker/compose-container.sh` to build and start the services.
     - Optionally, create your own `docker/.env` file.
     - Local ports 3306, 5000, 6379, and 9010 must be free prior to service start.

### Configuration Steps
1. **Remove Leftover Files**:
   - Delete any existing `src/test/.auth` folder from previous installations.
2. **Create Test Userids**:
   - Run `AUTHZ_CLIENT_ID=deadbeef-cafe-babe-feed-baadc0deface npm run test:local:api` to create test userids (credentials stored in `src/test/.auth`) and verify a successful installation and startup (all API tests should pass).
3. **Create Default App Data**:
   - Run `AUTHZ_CLIENT_ID=deadbeef-cafe-babe-feed-baadc0deface npm run test:local:_data` to create default app data.
   - Alternatively, log in as admin at [http://localhost:5000/_admin](http://localhost:5000/_admin) and create the data using the UI.

### Run and Test
* Navigate to `localhost:5000` and log in using the credentials for `admin-0@test.local` created during configuration step 2, found in `src/test/.auth`.  
* Experiment with multiple browsers/logins (duplicate login sessions in different browser contexts for conflict resolutions) and add/change/delete data to test multi-user OCC, batching, offline, three-way merges, and intra-context state and data broadcasting.
  - Admin accounts must login via http://localhost:5000/_admin to get the admin role and write access to application data.

## Native Setup

### Prerequisites
- **NodeJS**: Version 22.15.0 or higher.
- **MariaDB**: Version 11.7.2 or higher.
- **Localnerve/Authorizer** Version 1.5.3 or higher. [Standalone download](https://hub.docker.com/r/localnerve/authorizer).

### Services Setup

#### MariaDB Setup
- **Installation**: Use Homebrew on macOS (`brew install mariadb`) or a similar package manager on other platforms to install and manage MariaDB. By default, MariaDB sets up the service on port 3306.
- **Database Creation**:
  - Create databases and users using `data/database/001-mariadb-ddl-init.sh` or equivalent scripts.
  - Then, navigate to the command line, change directory to `data/database`, and run the following SQL files using the `mariadb` CLI tool:
    ```sh
    source 002-mariadb-ddl-tables.sql
    source 003-mariadb-ddl-procedures.sql
    source 004-mariadb-ddl-privileges.sql
    ```

#### Authorizer.dev Setup
- **Installation**: Use Docker to run and manage Authorizer.dev. A sample configuration file is provided in [**authorizer-dev.yml**](/docker/authorizer-dev.yml) to run Authorizer.dev standalone using the local MariaDB instance.

- Use [**authorizer-dev.yml**](/docker/authorizer-dev.yml) to run authorizer.dev locally on port 9010 using the locally installed MariaDB instance.
- Generate `ADMIN_SECRET` and `CLIENT_ID` using local CLI tools like `uuidgen` and `openssl`.
- Choose any port, but the default settings in `package.json` scripts are easiest to use.

##### Setup for Local TLS Proxy Hosts
For testing with TLS locally, I recommend using [Duckdns](https://duckdns.org) to setup domain names that refer to addresses (192.168) on your local lab network. These work because duckdns supports [DNS-01 challenge protocol](https://notthebe.ee/blog/easy-ssl-in-homelab-dns01/#how-does-it-work), so Let's Encrypt can issue certificates for your local hosts. From there, you can use a reverse proxy service locally to manage Let's Encrypt keys and map subdomains to services on local ports.

After some experimentation, I've found that [caddy](https://caddyserver.com/docs/) works best in the role of local reverse proxy service. It is performant, stable, and easy to configure and manage. Here's my [configuration repo](https://github.com/localnerve/caddy-local) for caddy if you want a working reference.

Notes:
  - Configure the reverse proxy service to use authorizer service on localhost:9010 as `yourname.duckdns.org` and the app service on localhost:5000 as `app.yourname.duckdns.org`
  - Run builds with `AUTHZ_URL=https://yourname.duckdns.org npm run build`.
    * There are many test scripts in `package.json` that model this for various tasks with `proxy` in the name.
  - Access the jam-build app in the browser as `https://app.yourname.duckdns.org`.
  - This setup is necessary to manually test with Safari on native localhost with TLS.
    * `npm run test:webkit` tests the services with safari in a local container without TLS (special config). 

#### Data Service Setup
- The data service runs in NodeJS on port 5000 by default. The main entry point is `src/application/server/index.js`.
- To start the jam-build data service and serve static artifacts, use one of the following commands:
  - `npm start` - Start the service in production mode.
  - `npm run dev` - Start the service in development mode.
  - `npm run dev:cover` - Start the service in development mode and collect coverage info in `coverage/`.
  - `npm run dev:debug` - Start the service in development mode, pausing to attach a debugger.
  - `npm run maint` - Start the service in maintenance mode.
    - To start in maintenance mode with a 2-hour window on Unix-based systems, add this flag:
      ```sh
      --MAINTENANCE="`date -v+2H -u +'%a, %d %b %Y %H:%M:%S GMT'`"
      ```

See [commands](commands.md) for a list of all developer commands and brief explanations.