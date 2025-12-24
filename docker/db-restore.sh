#!/bin/sh

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
# TODO: update with real environment
ENV_FILE=$SCRIPT_DIR/.env.dev
COMPOSE_FILE=$SCRIPT_DIR/docker-compose.yml

# Restore from latest backup
# docker compose --file $COMPOSE_FILE --env-file $ENV_FILE run --rm restore

# Restore from specific backup
docker compose --file $COMPOSE_FILE --env-file $ENV_FILE run --rm -e BACKUP_FILE=db-20251224-021601.tar.gz restore