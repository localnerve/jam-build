---
Author: Alex Grant <alex@localnerve.com> (https://www.localnerve.com)
Date: August 12, 2025
Title: Getting Started
---

# How to Run Locally

> **Note:** Safari will not work locally without using named SSL proxy hosts in the procedure described [below](#ngnix-for-Local-ssl-proxy-hosts).

## Docker Setup

### Installation Steps
1. **Install Docker Desktop**: Download and install Docker Desktop from the official website.
2. **Run Docker Compose**:
   - Execute `docker compose --env-file .env.dev up` to start the services. Wait for it to complete.
   - Optionally, create your own `.env` file if needed.
3. **Restart `jam-build-container`**: Restart the `jam-build-container` (The authorizer.dev service needs a restart to pickup its CLIENT_ID).

### Configuration Steps
1. **Remove Leftover Files**:
   - Delete any existing `src/test/.auth` folder from previous installations.
2. **Create Test Userids**:
   - Run `AUTHZ_CLIENT_ID=deadbeef-cafe-babe-feed-baadc0deface npm run test:local:api` to create test userids (credentials stored in `src/test/.auth`) and verify a successful installation and startup (all API tests should pass).
3. **Create Default App Data**:
   - Run `AUTHZ_CLIENT_ID=deadbeef-cafe-babe-feed-baadc0deface npm run test:local:_data` to create default app data.
   - Alternatively, log in as admin at [http://localhost:5000/_admin](http://localhost:5000/_admin) and create the data using the UI.

Navigate to `localhost:5000` and log in. Experiment with multiple browsers and logins to test multi-user OCC and three-way merges.

## Native Setup

### Prerequisites
- **NodeJS**: Version 22.15.0 or higher.
- **MariaDB**: Version 11.7.2 or higher.
- **Authorizer.dev**.

### Services Setup

#### MariaDB Setup
- **Installation**: Use Homebrew on macOS (`brew install mariadb`) or a similar package manager on other platforms to install and manage MariaDB. By default, MariaDB sets up the service on port 3306.
- **Database Creation**:
  - Create databases and users using `data/database/mariadb-ddl-init.sh` or equivalent scripts.
  - Then, navigate to the command line, change directory to `data/database`, and run the following SQL files using the `mariadb` CLI tool:
    ```sh
    source mariadb-ddl-tables.sql
    source mariadb-ddl-procedures.sql
    source mariadb-ddl-privileges.sql
    ```

#### Authorizer.dev Setup
- **Installation**: Use Docker to run and manage Authorizer.dev. A sample configuration file is provided in [**docker-authorizer-dev.yml**](/docker-authorizer-dev.yml) to run Authorizer.dev standalone using the local MariaDB instance.

- Use [**docker-authorizer-dev.yml**](/docker-authorizer-dev.yml) to run authorizer.dev locally on port 9010 using the locally installed MariaDB instance.
- Generate `ADMIN_SECRET` and `CLIENT_ID` using local CLI tools like `uuidgen` and `openssl`.
- Choose any port, but the default settings in `package.json` scripts are easiest to use.

##### Ngnix for Local SSL Proxy Hosts
- To set up a named proxy for local SSL using [DuckDNS](https://notthebe.ee/blog/easy-ssl-in-homelab-dns01/) and the Docker Nginx Proxy Manager:
  > Presuming you setup localhost:9010 to point to `yourproxyhost.duckdns.org` and localhost:5000 to point to `app.yourproxyhost.duckdns.org`

  - Run builds with `AUTHZ_URL=https://yourproxyhost.duckdns.org npm run build`.
  - Access the jam-build app in the browser as `https://app.yourproxyhost.duckdns.org`.
  - This setup is necessary to test Safari on localhost and for secure development with SSL.

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

See [commands](docs/commands.md) for a list of all developer commands and brief explanations.