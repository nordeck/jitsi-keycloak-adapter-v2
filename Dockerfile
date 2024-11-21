FROM denoland/deno
LABEL version="v20241120"

WORKDIR /app

COPY src/config.ts src/context.ts src/adapter.ts /app/
RUN deno cache /app/adapter.ts

ENV KEYCLOAK_ORIGIN "https://ucs-sso-ng.mydomain.corp"
ENV KEYCLOAK_ORIGIN_INTERNAL ""
ENV KEYCLOAK_REALM "ucs"
ENV KEYCLOAK_CLIENT_ID "jitsi"
ENV JWT_ALG "HS256"
ENV JWT_HASH "SHA-256"
ENV JWT_APP_ID "myappid"
ENV JWT_APP_SECRET "myappsecret"
ENV JWT_EXP_SECOND 10800
ENV ALLOW_UNSECURE_CERT false
ENV HOSTNAME "0.0.0.0"
ENV PORT 9000

USER deno
EXPOSE 9000

CMD \
  [ "$(echo $ALLOW_UNSECURE_CERT | tr '[:upper:]' '[:lower:]')" = true ] && \
    IGNORE_CERT_ERRORS="--unsafely-ignore-certificate-errors"; \
\
  deno run --allow-net --allow-env $IGNORE_CERT_ERRORS /app/adapter.ts