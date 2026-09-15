FROM nginx:1.27-alpine

# Remove the default nginx site
RUN rm /etc/nginx/conf.d/default.conf

# Copy the nginx config template (envsubst fills in AMP_IP at startup)
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# Custom entrypoint: runs envsubst for AMP_IP only, then starts nginx
COPY docker/docker-entrypoint.sh /docker-entrypoint-custom.sh
RUN chmod +x /docker-entrypoint-custom.sh

# Copy the static web app (lives in the project root)
COPY index.html app.js style.css sources.md \
     manifest.json sw.js icon.svg icon-192.png icon-512.png \
     /usr/share/nginx/html/

# Default amplifier IP — override via environment variable
ENV AMP_IP=192.168.68.60

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=2 \
    CMD wget -qO- http://localhost/healthz || exit 1

ENTRYPOINT ["/docker-entrypoint-custom.sh"]
