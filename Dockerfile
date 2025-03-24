FROM node:20.19

ARG UID=1000
ARG GID=1000
ARG TARGETARCH

USER root
RUN <<EOF
apt-get update
apt-get install -y autoconf automake libtool nasm zlib1g-dev
mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
ln -s -f /usr/lib/aarch64-linux-gnu/libpng16.a /usr/local/lib/libpng16.a
EOF

RUN <<EOF
usermod -u $UID -g node -o node
groupmod -g $GID -o node
EOF

USER node
WORKDIR /home/node/app
COPY --chown=node:node ./ ./
RUN if [ "$TARGETARCH" = "arm64" ]; then \
  echo "INSTALL ARM64"; \
  CPPFLAGS=-DPNG_ARM_NEON_OPT=0 npm install --arch=arm64 --loglevel info; \
else \
  npm install; \
fi

# Must be built with secret source id=jam-build
RUN --mount=type=secret,id=jam-build,target=/home/node/app/private/host-env.json,uid=$UID,gid=$GID \
  npm run build
EXPOSE 8088

CMD ["node", "src/application/server", "--PORT=8088", "--ENV-PATH=/run/secrets/jam-env.json"]