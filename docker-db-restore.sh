#!/bin/sh

# TODO: update with real environment
docker compose --env-file .env.dev run --rm hydrate

# Example: Restore from specific backup
# docker compose run --env-file .env.dev --rm -e BACKUP_FILE=db-20250116-143052.tar.gz hydrate