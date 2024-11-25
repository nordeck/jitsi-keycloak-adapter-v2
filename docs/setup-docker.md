# Dockerized setup

**NOT READY YET**

- [1. Keycloak Adapter](#1-keycloak-adapter)
- [2. Jitsi](#2-jitsi)

The setup guide to integrate `Jitsi Keycloak Adapter v2` with a Dockerized Jitsi
setup.

This guide assumes that you have already a working `Jitsi` on a Docker
environment. See
[Jitsi Meet Handbook](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker/)
for further details.

Tested with Jitsi `stable-9823` images.

## 1. Keycloak Adapter

```bash
docker run -d \
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

- `KEYCLOAK_ORIGIN` must be resolvable and accessible for users and the
  container.

- Set `KEYCLOAK_ORIGIN_INTERNAL` if `KEYCLOAK_ORIGIN` is not accessible for the
  container and the container should access `Keycloak` by using this internal
  address.

- `JWT_APP_ID` and `JWT_APP_SECRET` must be the same for both `keycloak-adapter`
  and `jitsi`.

- Set `ALLOW_UNSECURE_CERT` as `true` if `Keycloak` has not a trusted
  certificate. For the production environment, `Keycloak` should have a trusted
  certificate and this value should be `false` (_it is `false` by default_).

## 2. Jitsi
