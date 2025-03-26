# 2 hour maintenance window
docker-compose run --service-ports jam-build --MAINTENANCE="`date -v+2H -u +'%a, %d %b %Y %H:%M:%S GMT'`"