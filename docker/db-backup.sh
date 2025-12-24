#!/bin/sh

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
# TODO: update with real environment
ENV_FILE=$SCRIPT_DIR/.env.dev
COMPOSE_FILE=$SCRIPT_DIR/docker-compose.yml

docker compose  --file $COMPOSE_FILE --env-file $ENV_FILE run --rm backup