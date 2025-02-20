# Dockerized setup

**NOT READY YET**

- [1. Keycloak Adapter](#1-keycloak-adapter)
- [2. Jitsi](#2-jitsi)
  - [2.1 Keycloak adapter as a proxy](#21-keycloak-adapter-as-a-proxy)
  - [2.2 Token authentication](#22-token-authentication)
  - [2.3 Guest participants](#23-guest-participants)

The setup guide to integrate `Jitsi Keycloak Adapter v2` with a Dockerized Jitsi
setup.

This guide assumes that you have already a working `Jitsi` on a Docker
environment. See
[Jitsi Meet Handbook](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker/)
for further details.

Tested with Jitsi `stable-10008` images.

## 1. Keycloak Adapter

```bash
docker run -d \
  --name adapter \
  -p "9000:9000/TCP" \
  -e KEYCLOAK_ORIGIN=https://my.keycloak.tld \
  -e KEYCLOAK_ORIGIN_INTERNAL= \
  -e KEYCLOAK_REALM=myrealm \
  -e KEYCLOAK_CLIENT_ID=myclientid \
  -e JWT_APP_ID=myappid \
  -e JWT_APP_SECRET=myappsecret \
  -e ALLOW_UNSECURE_CERT=true \
  ghcr.io/nordeck/jitsi-keycloak-adapter-v2
```

- `KEYCLOAK_ORIGIN` must be resolvable and accessible for participants and the
  container.

- Set `KEYCLOAK_ORIGIN_INTERNAL` if `KEYCLOAK_ORIGIN` is not accessible for the
  container and the container should access `Keycloak` by using an internal
  address.

- `JWT_APP_ID` and `JWT_APP_SECRET` must be the same for both
  `jitsi-keycloak-adapter-v2` and Jitsi containers.

- Set `ALLOW_UNSECURE_CERT` to `true` if `Keycloak` has not a trusted
  certificate. For the production environment, `Keycloak` should have a trusted
  certificate and this value should be `false` (_it is `false` by default_).

## 2. Jitsi

### 2.1 Keycloak adapter as a proxy

Create a proxy config for Jitsi's `web` container. If you have a docker-compose
environment, this file should be `~/.jitsi-meet-cfg/web/nginx-custom/oidc.conf`.
Update the address of `proxy_pass` according to your environment.

```config
location ~ /oidc/ {
    proxy_pass http://172.17.17.1:9000;
    proxy_http_version 1.1;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $http_host;
}
```

I use `172.17.17.1` in this example because this is the IP address of my host
machine and Jitsi's `web` container can access my `jitsi-keycloak-adapter-v2`
container using this IP and port.

### 2.2 Token authentication

Set the following environment variables to enable the token authentication for
`Jitsi`:

- Enable authentication

  `ENABLE_AUTH=true`

- But not for `jicofo`

  `JICOFO_ENABLE_AUTH=false`

- Select the authentication type

  `AUTH_TYPE=jwt`

- Application identifier

  `JWT_APP_ID=myappid`

- Application secret known only to your token generators (_such as_
  `jitsi-keycloak-adapter-v2`)

  `JWT_APP_SECRET=myappsecret`

- Set `tokenAuthUrl` according to your domain

  `TOKEN_AUTH_URL=https://my.jitsi.tld/oidc/auth?state={state}`

### 2.3 Guest participants

Set the following environment variables to allow guest participants and to
activate "wait for host" feature:

- Enable guest participants

  `ENABLE_GUESTS=true`

- Enable the persistent lobby module

  `XMPP_MODULES=persistent_lobby`

- Enable the wait for host module

  `XMPP_MUC_MODULES=muc_wait_for_host`
