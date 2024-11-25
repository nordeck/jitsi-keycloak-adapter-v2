import { STATUS_CODE } from "jsr:@std/http/status";
import { create, getNumericDate } from "jsr:@emrahcom/jwt";
import type { Algorithm } from "jsr:@emrahcom/jwt/algorithm";
import {
  HOSTNAME,
  JWT_ALG,
  JWT_APP_ID,
  JWT_APP_SECRET,
  JWT_EXP_SECOND,
  JWT_HASH,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_MODE,
  KEYCLOAK_ORIGIN,
  KEYCLOAK_ORIGIN_INTERNAL,
  KEYCLOAK_REALM,
  PORT,
} from "./config.ts";
import { createContext } from "./context.ts";

// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------
const KEYCLOAK_AUTH_URI = `${KEYCLOAK_ORIGIN}` +
  `/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth` +
  `?client_id=${KEYCLOAK_CLIENT_ID}&response_mode=${KEYCLOAK_MODE}` +
  `&response_type=code&scope=openid&prompt=consent`;
const KEYCLOAK_TOKEN_URI = `${KEYCLOAK_ORIGIN_INTERNAL}` +
  `/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
const KEYCLOAK_USERINFO_URI = `${KEYCLOAK_ORIGIN_INTERNAL}` +
  `/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`;
let CRYPTO_KEY: CryptoKey;

interface StateType {
  [key: string]: boolean | string;
}

// -----------------------------------------------------------------------------
// HTTP response for OK
// -----------------------------------------------------------------------------
function ok(body: string): Response {
  return new Response(body, {
    status: STATUS_CODE.OK,
  });
}

// -----------------------------------------------------------------------------
// HTTP response for NotFound
// -----------------------------------------------------------------------------
function notFound(): Response {
  return new Response(null, {
    status: STATUS_CODE.NotFound,
  });
}

// -----------------------------------------------------------------------------
// HTTP response for MethodNotAllowed
// -----------------------------------------------------------------------------
function methodNotAllowed(): Response {
  return new Response(null, {
    status: STATUS_CODE.MethodNotAllowed,
  });
}

// -----------------------------------------------------------------------------
// HTTP response for Unauthorized
// -----------------------------------------------------------------------------
function unauthorized(): Response {
  return new Response(null, {
    status: STATUS_CODE.Unauthorized,
  });
}

// -----------------------------------------------------------------------------
// Generate and set the crypto key at the beginning and use the same crypto key
// during the process lifetime.
// -----------------------------------------------------------------------------
async function setCryptoKey() {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(JWT_APP_SECRET);

  CRYPTO_KEY = await crypto.subtle.importKey(
    "raw",
    keyData,
    {
      name: "HMAC",
      hash: JWT_HASH,
    },
    true,
    ["sign"],
  );
}

// -----------------------------------------------------------------------------
// Redirect the user to Keycloak's auth page to get the short-term auth code.
// -----------------------------------------------------------------------------
function auth(req: Request): Response {
  try {
    const host = req.headers.get("host");
    if (!host) throw "host not found";
    const url = new URL(req.url);
    const search = url.search.substr(1);
    const searchParams = new URLSearchParams(search);
    const jsonState = searchParams.get("state");
    if (!jsonState) throw "state not found";

    const state = encodeURIComponent(jsonState);
    const qs = encodeURIComponent(`state=${state}`);
    const redirectUri = `https://${host}/oidc/tokenize?${qs}`;
    const keycloakAuthPage = `${KEYCLOAK_AUTH_URI}&redirect_uri=${redirectUri}`;

    return Response.redirect(keycloakAuthPage, STATUS_CODE.Found);
  } catch (e) {
    console.error(e);
    return unauthorized();
  }
}

// -----------------------------------------------------------------------------
// - Sub is tenant (if exists). If not then sub is the meeting domain (host).
// - Tenant is the previous folder in Jitsi's path before the room name.
// - Path (as input) doesn't contain the room name. So, get the last folder.
// - Path doesn't exist all the times. So, it may be undefined.
// -----------------------------------------------------------------------------
function getSub(host: string, path: string | undefined): string {
  if (!path) return host;

  // trim trailing slashes
  path = path.replace(/\/+$/g, "");

  // get the latest folder from the path
  const tenant = path.split("/").reverse()[0];

  return tenant;
}

// -----------------------------------------------------------------------------
// Get the access token by using the short-term auth code.
// -----------------------------------------------------------------------------
async function getAccessToken(
  host: string,
  code: string,
  jsonState: string,
): Promise<string> {
  const state = encodeURIComponent(jsonState);

  // Dont encode qs because it will be encoded when inserted into data.
  const qs = `state=${state}`;
  const redirectUri = `https://${host}/oidc/tokenize?${qs}`;
  const data = new URLSearchParams();
  data.append("client_id", KEYCLOAK_CLIENT_ID);
  data.append("grant_type", "authorization_code");
  data.append("redirect_uri", redirectUri);
  data.append("code", code);

  // Send the request for the access token.
  const res = await fetch(KEYCLOAK_TOKEN_URI, {
    headers: {
      "Accept": "application/json",
    },
    method: "POST",
    body: data,
  });
  const json = await res.json();
  const accessToken = json.access_token;
  if (!accessToken) throw "access-token request failed";

  return accessToken;
}

// -----------------------------------------------------------------------------
// Get the user info from Keycloak by using the access token.
// -----------------------------------------------------------------------------
async function getUserInfo(
  accessToken: string,
): Promise<Record<string, unknown>> {
  // Send request for the user info.
  const res = await fetch(KEYCLOAK_USERINFO_URI, {
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    method: "GET",
  });
  const userInfo = await res.json();

  // Sub is the mandotary field in response for a successful request.
  if (!userInfo.sub) throw "no user info";

  return userInfo;
}

// -----------------------------------------------------------------------------
// Generate Jitsi's token (jwt).
// -----------------------------------------------------------------------------
async function generateJwt(
  sub: string,
  room: string,
  userInfo: Record<string, unknown>,
): Promise<string> {
  const header = { typ: "JWT", alg: JWT_ALG as Algorithm };
  const payload = {
    aud: JWT_APP_ID,
    iss: JWT_APP_ID,
    sub: sub,
    room: room,
    iat: getNumericDate(0),
    nbf: getNumericDate(0),
    exp: getNumericDate(JWT_EXP_SECOND),
    context: createContext(userInfo),
  };

  return await create(header, payload, CRYPTO_KEY);
}

// -----------------------------------------------------------------------------
// Generate hashes for Jitsi session.
// -----------------------------------------------------------------------------
function generateHash(jsonState: string): string {
  let hash = "adapter=true";

  try {
    const state = JSON.parse(jsonState) as StateType;

    for (const key in state) {
      // See https://github.com/jitsi/jitsi-meet for allowed hashes.
      // react/features/authentication/functions.any.ts
      if (
        !key.startsWith("config.") &&
        !key.startsWith("interfaceConfig.") &&
        !key.startsWith("iceServers.")
      ) continue;

      hash = `${hash}&${encodeURIComponent(key)}`;
      hash = `${hash}=${encodeURIComponent(JSON.stringify(state[key]))}`;
    }
  } catch (e) {
    console.error(e);
  }

  return hash;
}

// -----------------------------------------------------------------------------
// Create URI of the Jitsi meeting with a token and hashes.
// -----------------------------------------------------------------------------
function getMeetingUri(
  host: string,
  path: string,
  room: string,
  jwt: string,
  hash: string,
): string {
  path = path || "";

  let uri = `${host}/${path}/${room}`;
  uri = uri.replace(/\/+/g, "/");
  uri = `https://${uri}?jwt=${jwt}#${hash}`;

  return uri;
}

// -----------------------------------------------------------------------------
// - User comes here after redirected by the auth page with a short-term code
// - Get Keycloak's access token by using this short-term auth code
// - Get the user info from Keycloak by using the access code
// - Generate Jitsi's token by using the user info
// - Redirect the user to Jitsi's meeting page with a token and hashes
// -----------------------------------------------------------------------------
async function tokenize(req: Request): Promise<Response> {
  try {
    const host = req.headers.get("host");
    if (!host) throw "host not found";
    const url = new URL(req.url);
    const search = url.search.substr(1);
    const searchParams = new URLSearchParams(search);
    const code = searchParams.get("code");
    if (!code) throw "code not found";
    const jsonState = searchParams.get("state");
    if (!jsonState) throw "state not found";
    const state = JSON.parse(jsonState);
    const sub = getSub(host, state.tenant);
    const room = state.room;

    // Get the access token from Keycloak using the short-term auth code.
    const accessToken = await getAccessToken(host, code, jsonState);

    // Get the user info from Keycloak using the access token.
    const userInfo = await getUserInfo(accessToken);

    // Generate Jitsi token.
    const jwt = await generateJwt(sub, room, userInfo);

    // Generate Jitsi hash.
    const hash = generateHash(jsonState);

    // Get URI of the Jitsi meeting.
    // Use unmodified path (state.tenant) which is different than the tenant in
    // JWT context.
    const meetingPage = getMeetingUri(host, state.tenant, room, jwt, hash);

    return Response.redirect(meetingPage, STATUS_CODE.Found);
  } catch (e) {
    console.error(e);
    return unauthorized();
  }
}

// -----------------------------------------------------------------------------
// handler
// -----------------------------------------------------------------------------
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method !== "GET") return methodNotAllowed();

  if (path === "/health") {
    return ok("healthy");
  } else if (path === "/oidc/health") {
    return ok("healthy");
  } else if (path === "/oidc/auth") {
    return auth(req);
  } else if (path === "/oidc/tokenize") {
    return await tokenize(req);
  } else {
    return notFound();
  }
}

// -----------------------------------------------------------------------------
// main
// -----------------------------------------------------------------------------
async function main() {
  console.log(`KEYCLOAK_ORIGIN: ${KEYCLOAK_ORIGIN}`);
  console.log(`KEYCLOAK_ORIGIN_INTERNAL: ${KEYCLOAK_ORIGIN_INTERNAL}`);
  console.log(`KEYCLOAK_REALM: ${KEYCLOAK_REALM}`);
  console.log(`KEYCLOAK_CLIENT_ID: ${KEYCLOAK_CLIENT_ID}`);
  console.log(`KEYCLOAK_MODE: ${KEYCLOAK_MODE}`);
  console.log(`JWT_ALG: ${JWT_ALG}`);
  console.log(`JWT_HASH: ${JWT_HASH}`);
  console.log(`JWT_APP_ID: ${JWT_APP_ID}`);
  console.log(`JWT_APP_SECRET: *** masked ***`);
  console.log(`JWT_EXP_SECOND: ${JWT_EXP_SECOND}`);
  console.log(`HOSTNAME: ${HOSTNAME}`);
  console.log(`PORT: ${PORT}`);

  // Generate and set the crypto key once at the beginning and use the same key
  // during the process lifetime.
  await setCryptoKey();

  Deno.serve({
    hostname: HOSTNAME,
    port: PORT,
  }, handler);
}

// -----------------------------------------------------------------------------
main();
