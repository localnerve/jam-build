FROM node:24.18.0-alpine AS builder
ARG AUTHZ_URL=http://localhost:9010
ARG AUTHZ_CLIENT_ID=E37D308D-9068-4FCC-BFFB-2AA535014B64
ARG DEV_BUILD=0
# TEST_BUILD=prod (prod test image only): instrument the service worker for
# coverage (SW_INSTRUMENT) so c8 can collect SW-side coverage from a
# production build. Real deployments never set it -> clean, uninstrumented SW.
ARG TEST_BUILD=
ENV TEST_BUILD=$TEST_BUILD

USER root
RUN apk --no-cache add shadow
WORKDIR /home/node/app

# Install all deps (including devDeps for the build step)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN if [ "$DEV_BUILD" = "0" ]; then \
  echo "Production build"; \
  echo "Building with AUTHZ_URL=$AUTHZ_URL, AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID TEST_BUILD=$TEST_BUILD"; \
  SW_INSTRUMENT=${TEST_BUILD:+1} AUTHZ_URL=$AUTHZ_URL AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID npm run build; \
else \
  echo "Coverage/development build"; \
  echo "Building with AUTHZ_URL=$AUTHZ_URL, AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID"; \
  SW_INSTRUMENT=1 AUTHZ_URL=$AUTHZ_URL AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID npm run build:dev; \
fi

# Production runtime stage - minimal size with only production dependencies
FROM node:24.18.0-alpine AS runtime-prod
WORKDIR /home/node/app

ARG UID=1000
ARG GID=1000

USER root

RUN apk --no-cache add shadow && \
  usermod -u $UID -g node -o node && \
  groupmod -g $GID -o node && \
  mkdir -p /home/node/app && \
  chown -R node:node /home/node/app

USER node

# Fresh install of production dependencies only for minimal size
COPY --from=builder --chown=node:node /home/node/app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the specific folders required for your start script
COPY --from=builder --chown=node:node /home/node/app/dist ./dist
COPY --from=builder --chown=node:node /home/node/app/src/application/server ./src/application/server

# Set runtime environment
ENV NODE_ENV=production

EXPOSE 5000

ENTRYPOINT ["npm", "start", "--", "--PORT=5000", "--ENV-PATH=/run/secrets/jam-env.json"]

# Production runtime with coverage stage - production build (fingerprinted,
# minified, hashed CSP) plus devDependencies so the server can run under c8
# and tests collect server-side coverage from a production-like app
FROM node:24.18.0-alpine AS runtime-prod-cover
WORKDIR /home/node/app

ARG UID=1000
ARG GID=1000

USER root

RUN apk --no-cache add shadow && \
  usermod -u $UID -g node -o node && \
  groupmod -g $GID -o node && \
  mkdir -p /home/node/app && \
  chown -R node:node /home/node/app

USER node

# Copy all dependencies from builder (includes c8 and other devDependencies)
COPY --from=builder --chown=node:node /home/node/app/package*.json ./
COPY --from=builder --chown=node:node /home/node/app/node_modules ./node_modules

# Copy c8 configuration for coverage reporting
COPY --from=builder --chown=node:node /home/node/app/.c8rc.json ./

# Copy the specific folders required for your start script
COPY --from=builder --chown=node:node /home/node/app/dist ./dist
COPY --from=builder --chown=node:node /home/node/app/src/application/server ./src/application/server

# Create coverage directory for c8 output
RUN mkdir -p coverage && chown node:node coverage

# Set runtime environment
ENV NODE_ENV=production

EXPOSE 5000

ENTRYPOINT ["npm", "start", "--", "--PORT=5000", "--ENV-PATH=/run/secrets/jam-env.json"]

# Development runtime stage - includes all dependencies (c8, etc.) for testing
FROM node:24.18.0-alpine AS runtime-dev
WORKDIR /home/node/app

ARG UID=1000
ARG GID=1000

USER root

RUN apk --no-cache add shadow && \
  usermod -u $UID -g node -o node && \
  groupmod -g $GID -o node && \
  mkdir -p /home/node/app && \
  chown -R node:node /home/node/app

USER node

# Copy all dependencies from builder (includes c8 and other devDependencies)
COPY --from=builder --chown=node:node /home/node/app/package*.json ./
COPY --from=builder --chown=node:node /home/node/app/node_modules ./node_modules

# Copy c8 configuration for coverage reporting
COPY --from=builder --chown=node:node /home/node/app/.c8rc.json ./

# Copy the specific folders required for your start script
COPY --from=builder --chown=node:node /home/node/app/dist ./dist
COPY --from=builder --chown=node:node /home/node/app/src/application/server ./src/application/server

# Create coverage directory for c8 output
RUN mkdir -p coverage && chown node:node coverage

# Set runtime environment
ENV NODE_ENV=production

EXPOSE 5000

ENTRYPOINT ["npm", "start", "--", "--PORT=5000", "--ENV-PATH=/run/secrets/jam-env.json"]