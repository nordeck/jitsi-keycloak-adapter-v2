# Standalone setup

- [1. Token authentication](#1-token-authentication)
  - [1.1 jitsi-meet-tokens package](#11-jitsi-meet-tokens-package)
  - [1.2 Testing](#12-testing)
- [2. Deno](#2-deno)
- [3. Keycloak adapter](#3-keycloak-adapter)
  - [3.1 Cloning the repository](#31-cloning-the-repository)
  - [3.2 Adapter service](#32-adapter-service)
    - [3.2.1 Adapter user](#321-adapter-user)
    - [3.2.2 Adapter application](#322-adapter-application)
    - [3.2.3 Adapter settings](#323-adapter-settings)
    - [3.2.4 Production notes](#324-production-notes)
    - [3.2.5 Systemd unit](#325-systemd-unit)
- [4. Nginx](#4-nginx)
- [5. Jitsi-meet](#5-jitsi-meet)
- [6. Guest users](#6-guest-users)
  - [6.1 Wait for host](#61-wait-for-host)
  - [6.2 Allow empty token](#62-allow-empty-token)
  - [6.3 Guest domain](#63-guest-domain)
  - [6.4 Restart Prosody](#64-restart-prosody)
  - [6.5 Jitsi-meet](#65-jitsi-meet)

The setup guide to install `Jitsi Keycloak Adapter v2` on a standalone Jitsi
server.

Tested on `Debian 12 Bookworm` with `Jitsi v2.0.9823`. Use `root` account while
running the commands.

## 1. Token authentication

Enable the token authentication for `prosody`.

### 1.1 jitsi-meet-tokens package

```bash
apt-get install jitsi-meet-tokens
```

Check related parameters in your `/etc/prosody/conf.d/YOUR-DOMAIN.cfg.lua`. They
should be already set by `apt-get` command.

```lua
VirtualHost "<YOUR-DOMAIN>"
    authentication = "token";
    app_id="<YOUR_APP_ID>"
    app_secret="<YOUR_APP_SECRET>"
```

### 1.2 Testing

Test the JWT authentication with a valid token. You may generate the token on
[Jitok](https://jitok.emrah.com/). The meeting link should be like the
following:

```bash
https://jitsi.mydomain.tld/myroom?jwt=<PASTE_TOKEN_HERE>
```

## 2. Deno

Install `deno`:

```bash
apt-get install unzip

cd /tmp
wget -T 30 -O deno.zip https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip
unzip -o deno.zip
cp /tmp/deno /usr/local/bin/

deno --version
```

## 3. Keycloak adapter

### 3.1 Cloning the repository

Clone the repository:

```bash
apt-get install git

git clone https://github.com/nordeck/jitsi-keycloak-adapter-v2.git
cd jitsi-keycloak-adapter-v2
```

_As an alternative way, you may download the released package from
[Releases](https://github.com/nordeck/jitsi-keycloak-adapter-v2/releases)._

### 3.2 Adapter service

Setup the adapter service.

#### 3.2.1 Adapter user

```bash
adduser adapter --system --group --disabled-password --shell /bin/bash --home /home/adapter
```

#### 3.2.2 Adapter application

```bash
mkdir -p /home/adapter/app
cp src/config.ts /home/adapter/app/
cp src/adapter.ts /home/adapter/app/
cp src/context.ts /home/adapter/app/
cp templates/home/adapter/app/adapter.sh /home/adapter/app/
chown adapter: /home/adapter/app -R
```

#### 3.2.3 Adapter settings

Update the adapter settings according to your environment. Edit
[/home/adapter/app/config.ts](../src/config.ts).

You may also use environment variables instead of updating this config file.

- `KEYCLOAK_ORIGIN`

  Keycloak address

- `KEYCLOAK_ORIGIN_INTERNAL`

  Internal Keycloak address if `KEYCLOAK_ORIGIN` is not accessible for the
  adapter service.

- `KEYCLOAK_REALM`

  Keycloak realm

- `KEYCLOAK_CLIENT_ID`

  Keycloak client ID

- `JWT_APP_ID`

  The token `app_id`. It must be the same with Prosody `app_id`.

- `JWT_APP_SECRET`

  The token `app_secret`. It must be the same with Prosody `app_secret`.

- `JWT_EXP_SECOND`

  The token expire time

- `HOSTNAME`

  The IP address for the adapter service. Don't update its default value since
  it is on the same server with `Nginx`.

#### 3.2.4 Production notes

Disable the `testing` line and enable the `prod` line in
[/home/adapter/app/adapter.sh](../templates/home/adapter/app/adapter.sh) if
`keycloak` has a trusted certificate. It should be for the production
environment.

```bash
# testing: allow self-signed certificate for Keycloak
#deno run --allow-net --allow-env --unsafely-ignore-certificate-errors $BASEDIR/adapter.ts

# prod
deno run --allow-net --allow-env $BASEDIR/adapter.ts
```

#### 3.2.5 Systemd unit

```bash
cp templates/etc/systemd/system/oidc-adapter.service /etc/systemd/system/

systemctl daemon-reload
systemctl enable oidc-adapter.service
systemctl start oidc-adapter.service
systemctl status oidc-adapter.service
```

## 4. Nginx

Add OIDC config:

```bash
cp templates/etc/jitsi/meet/jaas/oidc.conf /etc/jitsi/meet/jaas/
```

And restart the `nginx` service:

```bash
systemctl restart nginx
```

## 5. Jitsi-meet

Set `tokenAuthUrl` and `tokenAuthUrlAutoRedirect` in `config.js`:

```bash
DOMAIN=$(hocon -f /etc/jitsi/jicofo/jicofo.conf get jicofo.xmpp.client.xmpp-domain | tr -d '"')

echo "config.tokenAuthUrl = 'https://${DOMAIN}/oidc/auth?state={state}';" >> /etc/jitsi/meet/*-config.js
echo "config.tokenAuthUrlAutoRedirect = true;" >> /etc/jitsi/meet/*-config.js
```

## 6. Guest users

If you want to allow guest users to join the meeting after it's created by a
moderator then apply the followings.

### 6.1 Wait for host

Enable `persistent_lobby` and `muc_wait_for_host` in your
`/etc/prosody/conf.d/<YOUR-DOMAIN>.cfg.lua`.

Put `persistent_lobby` into `VirtualHost`'s `modules_enabled`:

```lua
VirtualHost "<YOUR-DOMAIN>"
    ...
    ...
    modules_enabled = {
        ...
        ...
        "muc_lobby_rooms";
        "persistent_lobby";
        ...
```

Put `muc_wait_for_host` into `Component`'s `modules_enabled`:

```lua
Component "conference.<YOUR-DOMAIN>" "muc"
    ...
    ...
    modules_enabled = {
        ...
        ...
        "token_verification";
        "muc_wait_for_host";
        ...
```

### 6.2 Allow empty token

Set `allow_empty_token` in your `/etc/prosody/conf.d/<YOUR-DOMAIN>.cfg.lua`:

```lua
VirtualHost "<YOUR-DOMAIN>"
    authentication = "token";
    app_id="<YOUR_APP_ID>"
    app_secret="<YOUR_APP_SECRET>"
    allow_empty_token=true
```

### 6.3 Guest domain

Add the guest domain for `prosody`. Create
_/etc/prosody/conf.avail/guest.cfg.lua_ file with the following contents.

```lua
VirtualHost "guest.domain.loc"
    authentication = "jitsi-anonymous"
    c2s_require_encryption = false
```

Create a symbolic link for this config file.

```bash
ln -s ../conf.avail/guest.cfg.lua /etc/prosody/conf.d/
```

### 6.4 Restart Prosody

Restart the `prosody` service

```bash
systemctl restart prosody.service
```

### 6.5 Jitsi-meet

Set `anonymousdomain` in `config.js`

```bash
echo "config.hosts.anonymousdomain = 'guest.domain.loc';" >> /etc/jitsi/meet/*-config.js
```
