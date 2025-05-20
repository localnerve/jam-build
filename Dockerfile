FROM node:22.15.0-bullseye

ARG UID=1000
ARG GID=1000
ARG AUTHZ_URL=localhost:9010
ARG AUTHZ_CLIENT_ID=E37D308D-9068-4FCC-BFFB-2AA535014B64
ARG TARGETARCH

USER root
RUN usermod -u $UID -g node -o node; \
groupmod -g $GID -o node
RUN apt-get update; \
apt-get install -y autoconf automake libtool nasm zlib1g-dev
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
RUN if [ "$TARGETARCH" = "arm64" ]; then \
  ln -s -f /usr/lib/aarch64-linux-gnu/libpng16.a /usr/local/lib/libpng16.a; \
fi

USER node
WORKDIR /home/node/app
COPY --chown=node:node ./ ./
RUN if [ "$TARGETARCH" = "arm64" ]; then \
  echo "INSTALL ARM64"; \
  CPPFLAGS=-DPNG_ARM_NEON_OPT=0 npm install --arch=arm64 --loglevel info; \
else \
  npm install; \
fi
RUN AUTHZ_URL=$AUTHZ_URL AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID npm run build

EXPOSE 5000

ENTRYPOINT ["npm", "start", "--", "--PORT=5000", "--ENV-PATH=/run/secrets/jam-env.json"]