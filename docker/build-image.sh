#!/bin/sh

# Get the value for $VAR_NAME from $ENV_FILE
find_envvar () {
  VAR_NAME="$1"
  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$line" ]] && continue
    # Echo the variable value if it contains an equals sign
    [[ "$line" == $VAR_NAME=* ]] && echo "${line#*=}"
  done < $ENV_FILE
}

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" &> /dev/null && pwd)
PROJECT_DIR=$(readlink -f $SCRIPT_DIR/..)
DOCKER_FILE=$PROJECT_DIR/Dockerfile

# If not exist, falls back to environment
HOSTENV_FILE=$PROJECT_DIR/private/host-env.json

# Assign AUTHZ_URL and AUTHZ_CLIENT_ID from env file identified by .env.$1 (default .env.dev)
BUILD_TYPE="$1" # $1 'proxy' or empty
IMAGE_TAG=jam-build${BUILD_TYPE:+-$BUILD_TYPE}
ENV_FILE=$SCRIPT_DIR/.env.${BUILD_TYPE:-dev}
export AUTHZ_URL=$(find_envvar AUTHZ_URL)
export AUTHZ_CLIENT_ID=$(find_envvar AUTHZ_CLIENT_ID)

echo Building "$IMAGE_TAG" image with AUTHZ_URL=$AUTHZ_URL and AUTHZ_CLIENT_ID=$AUTHZ_CLIENT_ID
docker buildx build --tag "$IMAGE_TAG" --secret id=jam-build,src=$HOSTENV_FILE --file $DOCKER_FILE $PROJECT_DIR --build-arg UID=`id -u` --build-arg GID=`id -g` --build-arg AUTHZ_URL --build-arg AUTHZ_CLIENT_ID