import assert from "node:assert/strict";
import {
  createDiscordAuthorizeUrl,
  normalizeBaseUrl,
  parseCookies,
  renderErrorPage,
  renderSuccessPage,
  renderVerificationPage,
  serializeCookie,
} from "./verification.js";

const config = {
  clientId: "1506834552583225505",
  redirectUri: "https://testrpc.qubitor.org/verify/callback",
  publicBaseUrl: "https://testrpc.qubitor.org",
  guildName: "Qubitor",
  roleName: "Verified",
  serverInviteUrl: "https://discord.gg/qubitor",
};

assert.equal(normalizeBaseUrl("https://testrpc.qubitor.org///"), "https://testrpc.qubitor.org");

const authorizeUrl = new URL(createDiscordAuthorizeUrl(config, "state-123"));
assert.equal(authorizeUrl.hostname, "discord.com");
assert.equal(authorizeUrl.searchParams.get("client_id"), config.clientId);
assert.equal(authorizeUrl.searchParams.get("redirect_uri"), config.redirectUri);
assert.equal(authorizeUrl.searchParams.get("scope"), "identify");
assert.equal(authorizeUrl.searchParams.get("state"), "state-123");

const cookie = serializeCookie("verify", "abc 123", { maxAgeSeconds: 60, secure: true });
assert.match(cookie, /verify=abc%20123/);
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /Secure/);
assert.equal(parseCookies("verify=abc%20123; other=value").get("verify"), "abc 123");

assert.match(renderVerificationPage(config), /Verify your member access/);
assert.match(renderVerificationPage(config), /Verify with Discord/);
assert.match(renderSuccessPage(config, "tester"), /tester has been verified/);
assert.match(renderErrorPage(config, "Join the server first", "Not a member"), /Join Qubitor Discord/);

console.log("@qubitor/discord-verification tests passed");
