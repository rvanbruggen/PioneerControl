#!/bin/sh
set -e

CERT_DIR=/etc/nginx/certs

# Self-signed certificate — required for Chrome on Android to show the PWA
# install prompt. Generated once and kept in the certs volume, so users only
# have to accept the browser warning once (not after every rebuild).
if [ ! -f "$CERT_DIR/cert.pem" ] || [ ! -f "$CERT_DIR/key.pem" ]; then
    echo "Generating self-signed certificate for ${HOST_IP} (valid 10 years)..."
    mkdir -p "$CERT_DIR"
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
        -keyout "$CERT_DIR/key.pem" \
        -out "$CERT_DIR/cert.pem" \
        -subj "/CN=${HOST_IP}" \
        -addext "subjectAltName=IP:${HOST_IP},DNS:localhost" 2>/dev/null \
    || openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
        -keyout "$CERT_DIR/key.pem" \
        -out "$CERT_DIR/cert.pem" \
        -subj "/CN=${HOST_IP}" \
        -addext "subjectAltName=DNS:${HOST_IP},DNS:localhost"
else
    echo "Using existing certificate in $CERT_DIR"
fi

# Substitute only our variables in the nginx template.
# Using an explicit variable list avoids clobbering nginx variables
# like $uri, $host, $remote_addr that happen to share shell-variable syntax.
envsubst '${AMP_IP} ${HTTPS_PORT}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf

echo "Pioneer proxy starting — amplifier at ${AMP_IP}"
echo "Open https://${HOST_IP}:${HTTPS_PORT}/"

exec nginx -g 'daemon off;'
