import crypto from "node:crypto";
import http from "node:http";
import {
  createDiscordAuthorizeUrl,
  normalizeBaseUrl,
  parseCookies,
  renderErrorPage,
  renderSuccessPage,
  renderVerificationPage,
  serializeCookie,
  type PortalConfig,
} from "./verification.js";

const apiBase = "https://discord.com/api/v10";
const port = Number(process.env.DISCORD_VERIFICATION_PORT ?? 18550);
const cookieName = "qubitor_discord_verify_state";
const stateTtlMs = Number(process.env.DISCORD_VERIFY_STATE_TTL_MS ?? 10 * 60 * 1000);
const publicBaseUrl = normalizeBaseUrl(process.env.DISCORD_VERIFY_PUBLIC_BASE_URL ?? "https://testrpc.qubitor.org");
const redirectUri = process.env.DISCORD_VERIFY_REDIRECT_URI ?? `${publicBaseUrl}/verify/callback`;
const roleName = process.env.DISCORD_VERIFY_ROLE_NAME ?? "Verified";
const guildName = process.env.DISCORD_GUILD_NAME ?? "Qubitor";
const serverInviteUrl = process.env.DISCORD_SERVER_INVITE_URL;
const secureCookies = process.env.DISCORD_VERIFY_SECURE_COOKIES !== "0" && redirectUri.startsWith("https://");

const botToken = requireAnyEnv("DISCORD_VERIFY_BOT_TOKEN", "DISCORD_BOT_TOKEN");
const guildId = requireAnyEnv("DISCORD_VERIFY_GUILD_ID", "DISCORD_GUILD_ID");
const clientSecret = requireAnyEnv("DISCORD_VERIFY_CLIENT_SECRET", "DISCORD_CLIENT_SECRET");
let clientId = process.env.DISCORD_VERIFY_CLIENT_ID?.trim() ?? process.env.DISCORD_CLIENT_ID?.trim();

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}

interface DiscordRole {
  id: string;
  name: string;
  color?: number;
  hoist?: boolean;
  mentionable?: boolean;
}

const states = new Map<string, number>();

function requireAnyEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`${names.join(" or ")} is required`);
}

function optionalHeaderToken(token: string): HeadersInit {
  if (!token) {
    return {};
  }
  return { authorization: token };
}

function isDiscordNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("404");
}

function isDiscordForbidden(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("403");
}

function explainRoleFailure(error: unknown): string {
  if (isDiscordNotFound(error)) {
    return "This Discord account is not a member of the Qubitor server yet.";
  }
  if (isDiscordForbidden(error)) {
    return "The verification bot cannot add the role. Move the verification bot role above the Verified role and give it Manage Roles permission.";
  }
  const value = error instanceof Error ? error.message : String(error);
  if (value.includes("Missing Permissions")) {
    return "The verification bot is missing Manage Roles permission.";
  }
  return value;
}

function portalConfig(): PortalConfig {
  if (!clientId) throw new Error("DISCORD_CLIENT_ID could not be resolved");
  return {
    clientId,
    redirectUri,
    publicBaseUrl,
    guildName,
    roleName,
    serverInviteUrl,
  };
}

function log(message: string) {
  console.log(`[discord-verification] ${message}`);
}

function sendHtml(response: http.ServerResponse, status: number, html: string, headers: http.OutgoingHttpHeaders = {}) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...headers,
  });
  response.end(html);
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function redirect(response: http.ServerResponse, location: string, headers: http.OutgoingHttpHeaders = {}) {
  response.writeHead(302, { location, "cache-control": "no-store", ...headers });
  response.end();
}

async function discordRequest<T>(method: string, route: string, token: string, body?: unknown, contentType = "application/json"): Promise<T> {
  const response = await fetch(`${apiBase}${route}`, {
    method,
    headers: {
      ...optionalHeaderToken(token),
      "content-type": contentType,
      "user-agent": "QubitorDiscordVerification/1.0",
    },
    body:
      body === undefined
        ? undefined
        : contentType === "application/x-www-form-urlencoded"
          ? (body as URLSearchParams).toString()
          : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data?.message ? `: ${data.message}` : "";
    throw new Error(`${method} ${route} failed with ${response.status}${message}`);
  }

  return data as T;
}

function botRequest<T>(method: string, route: string, body?: unknown): Promise<T> {
  return discordRequest<T>(method, route, `Bot ${botToken}`, body);
}

async function exchangeCode(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: await getClientId(),
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const payload = await discordRequest<{ access_token: string }>(
    "POST",
    "/oauth2/token",
    "",
    params,
    "application/x-www-form-urlencoded",
  );
  return payload.access_token;
}

async function getClientId(): Promise<string> {
  if (clientId) return clientId;
  const botUser = await botRequest<DiscordUser>("GET", "/users/@me");
  clientId = botUser.id;
  return clientId;
}

async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  return discordRequest<DiscordUser>("GET", "/users/@me", `Bearer ${accessToken}`);
}

async function getOrCreateRole(): Promise<DiscordRole> {
  const roles = await botRequest<DiscordRole[]>("GET", `/guilds/${guildId}/roles`);
  const existing = roles.find((role) => role.name.toLowerCase() === roleName.toLowerCase());
  if (existing) return existing;

  return botRequest<DiscordRole>("POST", `/guilds/${guildId}/roles`, {
    name: roleName,
    color: 0x49d0a8,
    hoist: false,
    mentionable: false,
  });
}

async function addRole(userId: string, roleId: string) {
  await botRequest("PUT", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
}

function createState(): string {
  pruneStates();
  const state = crypto.randomBytes(32).toString("base64url");
  states.set(state, Date.now() + stateTtlMs);
  return state;
}

function consumeState(state: string | null, cookieHeader: string | undefined): boolean {
  if (!state) return false;
  const cookieState = parseCookies(cookieHeader).get(cookieName);
  const expiresAt = states.get(state);
  states.delete(state);
  return cookieState === state && expiresAt !== undefined && expiresAt > Date.now();
}

function pruneStates() {
  const now = Date.now();
  for (const [state, expiresAt] of states.entries()) {
    if (expiresAt <= now) states.delete(state);
  }
}

async function handleStart(response: http.ServerResponse) {
  const state = createState();
  const config = { ...portalConfig(), clientId: await getClientId() };
  const authorizeUrl = createDiscordAuthorizeUrl(config, state);
  redirect(response, authorizeUrl, {
    "set-cookie": serializeCookie(cookieName, state, {
      httpOnly: true,
      maxAgeSeconds: Math.floor(stateTtlMs / 1000),
      path: "/verify",
      sameSite: "Lax",
      secure: secureCookies,
    }),
  });
}

async function handleCallback(request: http.IncomingMessage, response: http.ServerResponse, requestUrl: URL) {
  const config = { ...portalConfig(), clientId: await getClientId() };
  if (!consumeState(requestUrl.searchParams.get("state"), request.headers.cookie)) {
    sendHtml(response, 400, renderErrorPage(config, "Session expired", "Open the verification portal and try again."));
    return;
  }

  const code = requestUrl.searchParams.get("code");
  if (!code) {
    sendHtml(response, 400, renderErrorPage(config, "Missing Discord code", "Discord did not return an authorization code."));
    return;
  }

  const user = await getDiscordUser(await exchangeCode(code));
  const role = await getOrCreateRole();
  try {
    await addRole(user.id, role.id);
  } catch (error) {
    sendHtml(
      response,
      isDiscordNotFound(error) ? 403 : 500,
      renderErrorPage(config, "Could not add role", explainRoleFailure(error)),
    );
    return;
  }

  const displayName = user.global_name || user.username;
  sendHtml(response, 200, renderSuccessPage(config, displayName), {
    "set-cookie": serializeCookie(cookieName, "", {
      httpOnly: true,
      maxAgeSeconds: 0,
      path: "/verify",
      sameSite: "Lax",
      secure: secureCookies,
    }),
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname.replace(/\/+$/, "") || "/";

  (async () => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "method not allowed" });
      return;
    }

    if (pathname === "/health" || pathname === "/verify/health") {
      sendJson(response, 200, {
        ok: true,
        service: "discord-verification",
        guildId,
        roleName,
        redirectUri,
      });
      return;
    }

    if (pathname === "/") {
      redirect(response, "/verify");
      return;
    }

    if (pathname === "/verify") {
      sendHtml(response, 200, renderVerificationPage({ ...portalConfig(), clientId: await getClientId() }));
      return;
    }

    if (pathname === "/verify/start") {
      await handleStart(response);
      return;
    }

    if (pathname === "/verify/callback") {
      await handleCallback(request, response, requestUrl);
      return;
    }

    sendJson(response, 404, { error: "not found" });
  })().catch((error) => {
    const config = clientId
      ? portalConfig()
      : {
          clientId: "unknown",
          redirectUri,
          publicBaseUrl,
          guildName,
          roleName,
          serverInviteUrl,
        };
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[discord-verification] ${message}`);
    sendHtml(response, 500, renderErrorPage(config, "Verification failed", message));
  });
});

await getClientId();
server.listen(port, () => {
  log(`listening on ${port}`);
  log(`portal: ${publicBaseUrl}/verify`);
  log(`redirect uri: ${redirectUri}`);
});
