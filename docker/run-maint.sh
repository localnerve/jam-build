#!/bin/sh

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
ENV_FILE=$SCRIPT_DIR/.env.dev
COMPOSE_FILE=$SCRIPT_DIR/docker-compose.yml

# Bring the app down for maintenance
# Start with a 2 hour maintenance window on a running container
docker compose --file $COMPOSE_FILE --env-file $ENV_FILE run --service-ports --name jam-build-maint jam-build --MAINTENANCE="`date -v+2H -u +'%a, %d %b %Y %H:%M:%S GMT'`"