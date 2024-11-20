# Development Notes

## Building the image

```bash
docker build -t jitsi-keycloak-adapter-v2 .
```

## Running the container

```bash
docker run \
  -p "9000:9000/TCP" \
  -e KEYCLOAK_ORIGIN=https://ucs-sso-ng.mydomain.corp \
  -e KEYCLOAK_REALM=ucs \
  -e KEYCLOAK_CLIENT_ID=jitsi \
  -e JWT_APP_ID=myappid \
  -e JWT_APP_SECRET=myappsecret \
  -e ALLOW_UNSECURE_CERT=true \
  jitsi-keycloak-adapter-v2
```
