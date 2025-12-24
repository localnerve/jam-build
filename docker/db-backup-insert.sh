#!/bin/sh

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
COMPOSE_FILE=$SCRIPT_DIR/docker-compose.yml

# insert local sql dumps into container volume (for hydration)
docker compose --file $COMPOSE_FILE run --rm backup-insert