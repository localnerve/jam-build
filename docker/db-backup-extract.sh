#!/bin/sh

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
COMPOSE_FILE=$SCRIPT_DIR/docker-compose.yml

# extract sql dumps to local folder
docker compose --file $COMPOSE_FILE run --rm backup-extract