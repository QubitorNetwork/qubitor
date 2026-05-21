export interface PortalConfig {
  clientId: string;
  redirectUri: string;
  publicBaseUrl: string;
  guildName: string;
  roleName: string;
  serverInviteUrl?: string;
}

export interface CookieOptions {
  httpOnly?: boolean;
  maxAgeSeconds?: number;
  path?: string;
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function createDiscordAuthorizeUrl(config: Pick<PortalConfig, "clientId" | "redirectUri">, state: string): string {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  return url.toString();
}

export function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;

  for (const rawCookie of cookieHeader.split(";")) {
    const separator = rawCookie.indexOf("=");
    if (separator === -1) continue;
    const name = rawCookie.slice(0, separator).trim();
    const value = rawCookie.slice(separator + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }

  return cookies;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  parts.push(`Path=${options.path ?? "/verify"}`);
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (options.httpOnly ?? true) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --background: #07090d;
        --panel: #10141c;
        --text: #f5f7fb;
        --muted: #aab2c3;
        --line: #252b38;
        --accent: #49d0a8;
        --accent-2: #6ea8fe;
        --danger: #ff6b6b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(73, 208, 168, 0.16), transparent 34rem),
          radial-gradient(circle at bottom right, rgba(110, 168, 254, 0.12), transparent 30rem),
          var(--background);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(42rem, calc(100vw - 2rem));
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(16, 20, 28, 0.86);
        padding: clamp(1.25rem, 4vw, 2.5rem);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
      }
      .eyebrow {
        color: var(--accent);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.75rem;
      }
      h1 {
        margin: 0.75rem 0 1rem;
        font-size: clamp(2rem, 7vw, 4.25rem);
        line-height: 0.95;
        letter-spacing: 0;
      }
      p {
        color: var(--muted);
        font-size: 1.03rem;
        line-height: 1.65;
        margin: 0 0 1rem;
      }
      a.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 3rem;
        margin-top: 1rem;
        border-radius: 10px;
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        color: #061016;
        text-decoration: none;
        font-weight: 800;
      }
      .meta {
        display: grid;
        gap: 0.65rem;
        margin-top: 1.25rem;
        padding-top: 1.25rem;
        border-top: 1px solid var(--line);
      }
      .meta div {
        color: var(--muted);
        overflow-wrap: anywhere;
      }
      .meta strong { color: var(--text); }
      .error { color: var(--danger); }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

export function renderVerificationPage(config: PortalConfig): string {
  return renderShell(
    "Qubitor Discord Verification",
    `<div class="eyebrow">Qubitor Discord</div>
    <h1>Verify your member access.</h1>
    <p>Sign in with Discord to verify you are a member of ${escapeHtml(config.guildName)}. The Qubitor bot will add the ${escapeHtml(config.roleName)} role after verification.</p>
    <p>This portal only uses Discord identity for server verification. It does not ask for wallet seeds, private keys, or recovery files.</p>
    <a class="button" href="/verify/start">Verify with Discord</a>
    <div class="meta">
      <div><strong>Role:</strong> ${escapeHtml(config.roleName)}</div>
      <div><strong>Server:</strong> ${escapeHtml(config.guildName)}</div>
    </div>`,
  );
}

export function renderSuccessPage(config: PortalConfig, username: string): string {
  return renderShell(
    "Qubitor Discord Verified",
    `<div class="eyebrow">Verified</div>
    <h1>You are in.</h1>
    <p>${escapeHtml(username)} has been verified for ${escapeHtml(config.guildName)}.</p>
    <p>The ${escapeHtml(config.roleName)} role is now attached to your Discord account.</p>
    <a class="button" href="${escapeHtml(config.serverInviteUrl ?? "https://discord.com/channels/@me")}">Return to Discord</a>`,
  );
}

export function renderErrorPage(config: PortalConfig, title: string, message: string): string {
  const inviteLink = config.serverInviteUrl
    ? `<p><a class="button" href="${escapeHtml(config.serverInviteUrl)}">Join Qubitor Discord</a></p>`
    : "";
  return renderShell(
    `Qubitor Discord Verification - ${title}`,
    `<div class="eyebrow error">Verification blocked</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${inviteLink}
    <p><a class="button" href="/verify">Try again</a></p>`,
  );
}
