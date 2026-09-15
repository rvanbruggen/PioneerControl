FROM nginx:1.27-alpine

# openssl generates the self-signed TLS certificate on first start
RUN apk add --no-cache openssl \
    && rm /etc/nginx/conf.d/default.conf

# Copy the nginx config template (envsubst fills in variables at startup)
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# Custom entrypoint: creates the certificate if needed, renders the config,
# then starts nginx
COPY docker/docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

# Copy the static web app (lives in the project root)
COPY index.html app.js style.css sources.md \
     manifest.json sw.js icon.svg icon-192.png icon-512.png \
     /usr/share/nginx/html/

# Defaults — override via environment variables in docker-compose.yml
#   AMP_IP     : Pioneer amplifier address
#   HOST_IP    : address users type in the browser (put in the certificate)
#   HTTPS_PORT : host port mapped to 443 (used for the HTTP → HTTPS redirect)
ENV AMP_IP=192.168.68.60 \
    HOST_IP=localhost \
    HTTPS_PORT=443

# Certificate is stored here; mount a volume so it survives rebuilds
VOLUME /etc/nginx/certs

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=2 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1

ENTRYPOINT ["/docker-entrypoint-custom.sh"]
