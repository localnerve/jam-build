#!/bin/sh

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
PROJECT_DIR=$(readlink -f $SCRIPT_DIR/..)
DOCKER_FILE=$PROJECT_DIR/Dockerfile

# If not exist, falls back to environment
HOSTENV_FILE=$PROJECT_DIR/private/host-env.json

# Change these if building a non-demo image
export AUTHZ_URL=http://localhost:9010
export AUTHZ_CLIENT_ID=deadbeef-cafe-babe-feed-baadc0deface 

docker buildx build --tag "jam-build" --secret id=jam-build,src=$HOSTENV_FILE --file $DOCKER_FILE $PROJECT_DIR --build-arg UID=`id -u` --build-arg GID=`id -g` --build-arg AUTHZ_URL --build-arg AUTHZ_CLIENT_ID