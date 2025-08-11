# How to run locally

> Note: Safari will not work locally without using named SSL proxy hosts in the procedure described [below](#Ngnix-for-Local-SSL-Proxy-Hosts)

## Docker

### Install

1. Install Docker Desktop.
2. Run `docker compose --env-file .env.dev up` ... Wait for it to complete (optionally, make your own .env file).
3. Restart `jam-build-container` (The authorizer.dev service needs a restart to pickup its CLIENT_ID).

### Setup

1. Remove any left over `src/test/.auth` folder from a previous installation.
2. Run `AUTHZ_CLIENT_ID=deadbeef-cafe-babe-feed-baadc0deface npm run test:local:api`, to create test userids (credentials stored in `src/test/.auth`) and verify a successful installation and startup (all api tests should pass).
3. Run `AUTHZ_CLIENT_ID=deadbeef-cafe-babe-feed-baadc0deface npm run test:local:_data` to create some default app data, or login as admin at [http://localhost:5000/_admin](http://localhost:5000/_admin) and create it with the UI.

Navigate to `localhost:5000` and login. Play with multiple browsers and logins to experiment with multi-user OCC and three-way merges.

## Native

* NodeJS 22.15.0 or higher.
* Mariadb 11.7.2 or higher.
* Authorizer.dev.

### Services

Configure authorizer.dev to use the mariadb instance to create a database in the local mariadb instance. The best way to run authorizer.dev locally is to install docker and configure a docker-compose.yml to download and run authorizer.dev from hub.docker.com. A sample authorizer.dev docker-compose.yml is provided in the file [**docker-authorizer-dev.yml**](/docker-authorizer-dev.yml);

#### Mariadb

On macos, use brew to install mariadb. On other platforms, use a similar package manager to install and manage mariadb. mariadb sets up the service on port 3306 by default.

Once installed, create the databases and users using `data/database/mariadb-ddl-init.sh` or equivalent procedure for the data and authorizer service. Once the databases and users are setup, go to the command line, chdir to `data/database`, run the `mariadb` cli tool, and `source` the scripts:

1. `data/database/mariadb-ddl-tables.sql`
2. `data/database/mariadb-ddl-procedures.sql`
3. `data/database/mariadb-ddl-privileges.sql`

#### Authorizer.dev
[**docker-authorizer-dev.yml**](/docker-authorizer-dev.yml) is a sample docker compose file to run authorizer.dev standalone locally on port 9010 using the locally installed mariadb instance. Generate the ADMIN_SECRET and CLIENT_ID from local cli tools (like uuidgen and openssl). You can pick any port, but the package.json scripts defaults are easiest to get going.

##### Ngnix for Local SSL Proxy Hosts
If you want to setup behind a named proxy for local ssl [using duckdns.org and the docker nginx-proxy-mananger](https://notthebe.ee/blog/easy-ssl-in-homelab-dns01/), be sure to run builds as follows: `AUTHZ_URL=https://yourproxyhost.duckdns.org npm run build`, and run the jam-build app in the browser as `https://app.yourproxyhost.duckdns.org`. This is the only way to test Safari on localhost, and the only way to develop securely with SSL.

#### Data Service
The data service runs in NodeJS on port 5000 by default. The source for the main entry is `src/application/server/index.js`.
To start the jam-build data service, and serve the static artifacts, choose one of the following commands:

* `npm start` - Start the service in production mode
* `npm run dev` - Start the service in development mode
* `npm run dev:cover` - Start the service in development mode and collect coverage info in `coverage/`
* `npm run dev:debug` - Start the service in development mode, pause to attach debugger
* `npm run maint` - Start the service in maintenance mode
  * To start in maintenance mode with a 2 hour window on nix, add this flag: --MAINTENANCE="`date -v+2H -u +'%a, %d %b %Y %H:%M:%S GMT'`"

See [commands](docs/commands.md) for all the developer commands and a brief explanation of each.