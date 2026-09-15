#!/bin/sh
set -e

# Substitute only AMP_IP in the nginx template.
# Using an explicit variable list avoids clobbering nginx variables
# like $uri, $host, $remote_addr that happen to share shell-variable syntax.
envsubst '${AMP_IP}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

echo "Pioneer proxy starting — amplifier at ${AMP_IP}"

exec nginx -g 'daemon off;'
