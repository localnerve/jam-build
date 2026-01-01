#!/bin/sh

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
PROJECT_DIR=$(readlink -f $SCRIPT_DIR/..)
COMPOSE_FILE=$PROJECT_DIR/docker/docker-compose.yml
ENV_FILE=$PROJECT_DIR/docker/.env.${1:-dev} # $1 'proxy' or empty

docker compose --file $COMPOSE_FILE --env-file $ENV_FILE up -d