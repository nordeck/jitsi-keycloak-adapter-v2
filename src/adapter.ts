import { STATUS_CODE } from "jsr:@std/http/status";
import { create, getNumericDate } from "jsr:@emrahcom/jwt";
import type { Algorithm } from "jsr:@emrahcom/jwt/algorithm";
import {
  DEBUG,
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
// setCryptoKey
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
// auth
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
    const target = `${KEYCLOAK_AUTH_URI}&redirect_uri=${redirectUri}`;

    return Response.redirect(target, STATUS_CODE.Found);
  } catch (e) {
    console.error(e);
    return unauthorized();
  }
}

// -----------------------------------------------------------------------------
// getAccessToken
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
// getUserInfo
// -----------------------------------------------------------------------------
async function getUserInfo(
  accessToken: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(KEYCLOAK_USERINFO_URI, {
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    method: "GET",
  });
  const userInfo = await res.json();

  // sub is the mandotary field for successful request
  if (!userInfo.sub) throw "no user info";

  return userInfo;
}

// -----------------------------------------------------------------------------
// generateJwt
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
// generateHash
// -----------------------------------------------------------------------------
function generateHash(jsonState: string): string {
  let hash = "#adapter=jitsi-keycloak-adapter-v2";

  try {
    const state = JSON.parse(jsonState) as StateType;
    for (const key in state) {
      hash = `${hash}&${encodeURIComponent(key)}`;
      hash = `${hash}=${encodeURIComponent(JSON.stringify(state[key]))}`;
    }
  } catch (e) {
    console.log(e);
  }

  return hash;
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
function getRedirectUri(
  host: string,
  tenant: string,
  room: string,
  jwt: string,
  hash: string,
): string {
  console.log(host);
  console.log(tenant);
  console.log(room);
  console.log(jwt);
  console.log(hash);
  return "url";
}

// -----------------------------------------------------------------------------
// tokenize
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
    const tenant = state.tenant;
    const sub = tenant || host;
    const room = state.room;

    // Get the access token from Keycloak using the short-term auth code.
    const accessToken = await getAccessToken(host, code, jsonState);

    // Get the user info from Keycloak using the access token.
    const userInfo = await getUserInfo(accessToken);

    // Generate Jitsi token.
    const jwt = await generateJwt(sub, room, userInfo);

    // Generate Jitsi hash.
    const hash = generateHash(jsonState);

    // Get redirectUri
    const redirectUri = getRedirectUri(host, tenant, room, jwt, hash);

    console.log(jwt);
    console.log(hash);
    console.log(redirectUri);

    return ok("tokenize");
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
  console.log(`DEBUG: ${DEBUG}`);

  await setCryptoKey();

  Deno.serve({
    hostname: HOSTNAME,
    port: PORT,
  }, handler);
}

// -----------------------------------------------------------------------------
main();
