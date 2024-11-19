import { STATUS_CODE } from "jsr:@std/http/status";
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
  host: string,
  jsonState: string,
  userInfo: Record<string, unknown>,
): Promise<string> {
  const state = JSON.parse(jsonState);

  await console.log(host);
  await console.log(state);
  await console.log(userInfo);
  await console.log(createContext(userInfo));

  return "jwt";
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

    // Get the access token from Keycloak using the short-term auth code.
    const accessToken = await getAccessToken(host, code, jsonState);

    // Get the user info from Keycloak using the access token.
    const userInfo = await getUserInfo(accessToken);

    // Generate Jitsi token.
    const jwt = await generateJwt(host, jsonState, userInfo);
    console.log(jwt);

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
function main() {
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

  Deno.serve({
    hostname: HOSTNAME,
    port: PORT,
  }, handler);
}

// -----------------------------------------------------------------------------
main();
