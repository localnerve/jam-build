FROM node:22.15.0-bullseye

ARG UID=1000
ARG GID=1000
ARG AUTHZ_URL=localhost:9010
ARG AUTHZ_CLIENT_ID=E37D308D-9068-4FCC-BFFB-2AA535014B64
ARG DEV_BUILD=0
ARG TARGETARCH

USER root
RUN usermod -u $UID -g node -o node; \
groupmod -g $GID -o node

USER node
WORKDIR /home/node/app
COPY --chown=node:node ./ ./
RUN npm install --loglevel info

RUN if [ "$DEV_BUILD" = "0" ]; then \
  echo "Production build"; \
  echo "Building with AUTHZ_URL=$AUTHZ_URL, AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID"; \
  AUTHZ_URL=$AUTHZ_URL AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID npm run build; \
else \
  echo "Coverage/development build"; \
  echo "Building with AUTHZ_URL=$AUTHZ_URL, AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID"; \
  SW_INSTRUMENT=1 AUTHZ_URL=$AUTHZ_URL AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID npm run build:dev; \
fi

EXPOSE 5000

ENTRYPOINT ["npm", "start", "--", "--PORT=5000", "--ENV-PATH=/run/secrets/jam-env.json"]