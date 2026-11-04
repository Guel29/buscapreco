FROM php:8.3-apache
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export APT_CA=/run/secrets/proxy_ca; else export APT_CA=/etc/ssl/certs/ca-certificates.crt; fi; \
    apt-get -o Acquire::https::CaInfo="$APT_CA" update && \
    apt-get -o Acquire::https::CaInfo="$APT_CA" install -y --no-install-recommends libonig-dev && \
    docker-php-ext-install -j2 pdo_mysql mbstring && a2enmod rewrite headers
