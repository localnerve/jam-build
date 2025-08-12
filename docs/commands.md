# Commands

The commands in package.json that are typically developer-useful, and a brief explanation of what they are intended to do.

> All local commands require the data service `npm run dev` and the authorizer.dev service (and mariadb) to be running locally.

| Command | Explanation |
| :--- | :--- |
| ### Build The App ### | #################### |
| `npm run build` | The production build. Builds all application assets for production, outputs to `dist/` |
| `npm run build:debug` | Debug the production build. Starts the production build, pause for debugger attachment |
| `npm run build:dev` | The development build. Builds all application for development and inspection, outputs to `dist/` |
| `npm run build:dev:debug` | Debug the development build. Starts the development build, pause for debugger attachment |
| `npm run build:dev:sw` | The development build with service worker coverage instrumentation, outputs to `dist/` |
| ### Run The App ### | #################### |
| `npm run dev` | Start the application in development mode. Starts on port 5000 |
| `npm run dev:debug` | Debug the application in development mode, pause for debugger attachment |
| `npm run dev:cover` | Start the application in development mode, collect c8 coverage information for the data service, outputs to `coverage/` |
| `npm run maint` | Start the application in maintenance mode, sets a 2 hour maintenance window |
| `npm start` | Start the application in production mode |
| ##### Utilities ##### | #################### |
| `npm run install-arm` | Install the image processing tools for ARM architectures. Required for Apple Silicon |
| `npm run lint` | Run eslint and stylelint linters |
| `npm run lint:js` | Run eslint only |
| `npm run lint:css` | Run stylelint only |
| ####### Test ####### | #################### |
| `npm test` | Run the full test suite against the application in self-contained docker |
| `npm run test:build` | Force rebuild the application testcontainer |
| `npm run test:debug` | Run the full test suite against the application in self-contained docker in headed debug mode |
| #### Local Test #### | #################### |
| `npm run test:local` | Run the full test suite against the native application locally, requires localhost:5000 (data) and localhost:9010 (authz) to be running |
| `npm run test:local:api` | Run the api test suite against the native application locally, requires local data and authz to be running |
| `npm run test:local:debug` | Run the full test suite against the native application locally with huge timeouts, detailed output, and headed browsers |
| `npm run test:local:_data` | Create dummy test data for the native application locally |
| `npm run test:local:_clean` | Clean dummy test data for the native application locally |
