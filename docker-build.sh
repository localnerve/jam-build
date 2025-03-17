#!/bin/sh

docker buildx build --tag "jam-build" --secret id=jam-build,src=./private/host-env.json . --build-arg UID=`id -u` --build-arg GID=`id -g`