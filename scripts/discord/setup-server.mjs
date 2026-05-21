#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const apiBase = "https://discord.com/api/v10";
const envFile = process.env.DISCORD_ENV_FILE || path.join(repoRoot, "infra", ".env.discord.local");
const dryRun = process.env.DISCORD_DRY_RUN === "1" || process.argv.includes("--dry-run");
const verificationPortalUrl =
  process.env.DISCORD_VERIFY_PORTAL_URL ??
  `${(process.env.DISCORD_VERIFY_PUBLIC_BASE_URL ?? "https://testrpc.qubitor.org").replace(/\/+$/, "")}/verify`;

const channelTypes = {
  text: 0,
  category: 4,
};

const overwriteTypes = {
  role: 0,
};

const permissions = {
  viewChannel: 1n << 10n,
  sendMessages: 1n << 11n,
  readMessageHistory: 1n << 16n,
};

function log(message) {
  console.log(`[discord-setup] ${message}`);
}

function fail(message) {
  console.error(`[discord-setup] ${message}`);
  process.exit(1);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing env file: ${path.relative(repoRoot, filePath)}`);
  }

  const envText = fs.readFileSync(filePath, "utf8");
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is required in ${path.relative(repoRoot, envFile)}`);
  }
  return value;
}

function normalizeName(name) {
  return name.toLowerCase();
}

function permissionBits(...bits) {
  return bits.reduce((total, bit) => total | bit, 0n).toString();
}

function createPrivateOverwrites(guildId, roleIds) {
  const allowed = permissionBits(
    permissions.viewChannel,
    permissions.sendMessages,
    permissions.readMessageHistory,
  );

  return [
    {
      id: guildId,
      type: overwriteTypes.role,
      allow: "0",
      deny: permissionBits(permissions.viewChannel),
    },
    ...roleIds.map((roleId) => ({
      id: roleId,
      type: overwriteTypes.role,
      allow: allowed,
      deny: "0",
    })),
  ];
}

const roleSpecs = [
  { name: "Core Team", color: 0x49d0a8, hoist: true, mentionable: false },
  { name: "Moderator", color: 0x6ea8fe, hoist: true, mentionable: false },
  { name: "Verified", color: 0x49d0a8, hoist: false, mentionable: false },
  { name: "Builder", color: 0xf1c40f, hoist: false, mentionable: true },
  { name: "Miner", color: 0xe67e22, hoist: false, mentionable: true },
  { name: "Wallet Tester", color: 0x9b59b6, hoist: false, mentionable: true },
  { name: "Bridge Tester", color: 0x1abc9c, hoist: false, mentionable: true },
  { name: "Liquidity Provider", color: 0x2ecc71, hoist: false, mentionable: true },
  { name: "Testnet User", color: 0x95a5a6, hoist: false, mentionable: true },
];

const categorySpecs = [
  { key: "start", name: "Start Here" },
  { key: "official", name: "Official" },
  { key: "testnet", name: "Testnet" },
  { key: "mining", name: "Mining" },
  { key: "wallet", name: "Wallet" },
  { key: "bridge", name: "Bridge" },
  { key: "developers", name: "Developers" },
  { key: "community", name: "Community" },
  { key: "support", name: "Support" },
  { key: "moderation", name: "Moderation" },
];

const channelSpecs = [
  {
    name: "welcome",
    category: "start",
    topic: "Start here for Qubitor links, network details, and community basics.",
    seed: [
      "Welcome to Qubitor.",
      "",
      "Qubitor is a mineable EVM-compatible Layer 1 with QBT as the native gas coin and Qubitor Accounts designed for the post-quantum transition.",
      "",
      "Start here:",
      "- RPC: https://testrpc.qubitor.org/rpc",
      "- Explorer: https://testexplorer.qubitor.org",
      "- Faucet: https://testrpc.qubitor.org/faucet",
      "- GitHub: https://github.com/QubitorNetwork/qubitor",
      `- Member verification: ${verificationPortalUrl}`,
    ],
  },
  {
    name: "rules",
    category: "start",
    topic: "Community rules.",
    seed: [
      "Qubitor community rules:",
      "",
      "1. Never share seed phrases, private keys, PQ seeds, or server credentials.",
      "2. No impersonation, phishing, fake airdrops, or unofficial support DMs.",
      "3. Keep testnet support in public channels so answers help everyone.",
      "4. Be direct, useful, and respectful.",
      "5. Testnet assets have no mainnet value.",
    ],
  },
  {
    name: "verify",
    category: "start",
    topic: "Verify your Discord member access.",
    seed: [
      "Verify your Qubitor Discord access here:",
      "",
      verificationPortalUrl,
      "",
      "The portal signs you in with Discord and adds the Verified role after confirming you are in this server.",
    ],
  },
  {
    name: "announcements",
    category: "official",
    topic: "Official Qubitor announcements.",
    seed: [
      "Official Qubitor announcements will be posted here.",
      "",
      "Treat links outside this channel as community-shared unless confirmed by the team.",
    ],
  },
  {
    name: "status",
    category: "official",
    topic: "Network, RPC, explorer, faucet, and bridge status.",
    seed: [
      "Status links:",
      "",
      "- RPC: https://testrpc.qubitor.org/rpc",
      "- Explorer: https://testexplorer.qubitor.org",
      "- Faucet: https://testrpc.qubitor.org/faucet",
      "- Faucet API status: https://testrpc.qubitor.org/faucet/status",
    ],
  },
  {
    name: "testnet-status",
    category: "testnet",
    topic: "Qubitor testnet chain details.",
    seed: [
      "Qubitor Testnet",
      "",
      "- Chain ID: 91338",
      "- Native gas coin: QBT",
      "- RPC: https://testrpc.qubitor.org/rpc",
      "- Explorer: https://testexplorer.qubitor.org",
      "- Faucet: https://testrpc.qubitor.org/faucet",
      "- Bootnode 1: bootnode-1.testnet.qubitor.org",
      "- Bootnode 2: bootnode-2.testnet.qubitor.org",
      "- P2P: 30303/tcp and 30303/udp",
    ],
  },
  {
    name: "faucet",
    category: "testnet",
    topic: "QBT testnet faucet help.",
    seed: [
      "Use the faucet page to request testnet QBT:",
      "",
      "https://testrpc.qubitor.org/faucet",
      "",
      "If the faucet is empty or delayed, post your address and the error you see.",
    ],
  },
  {
    name: "testnet-help",
    category: "testnet",
    topic: "Help connecting to and using the Qubitor testnet.",
    seed: [
      "Use this channel for testnet connection issues, failed transactions, RPC problems, and faucet questions.",
      "",
      "When asking for help, include your wallet address, transaction hash if you have one, and what you expected to happen.",
    ],
  },
  {
    name: "mining",
    category: "mining",
    topic: "Mining QBT on the Qubitor testnet.",
    seed: [
      "Mining Qubitor testnet QBT:",
      "",
      "1. Run a Qubitor node synced to chain ID 91338.",
      "2. Point the miner reward address at your Qubitor wallet address.",
      "3. Keep the node connected to the testnet bootnodes.",
      "4. Watch block height and rewards in the explorer.",
      "",
      "Mining docs will be expanded as public miner tooling stabilizes.",
    ],
  },
  {
    name: "mining-support",
    category: "mining",
    topic: "Help with mining setup and node sync.",
    seed: [
      "Post mining setup issues here.",
      "",
      "Useful details: OS, node version, peer count, current block, miner command, and any error logs.",
    ],
  },
  {
    name: "wallet",
    category: "wallet",
    topic: "Qubitor Wallet and Qubitor Account discussion.",
    seed: [
      "Qubitor Wallet is built around Qubitor Accounts, live QBT balances, and post-quantum-aware account control.",
      "",
      "Use this channel for wallet setup, QBT send/receive, and account deployment questions.",
    ],
  },
  {
    name: "recovery-kit",
    category: "wallet",
    topic: "Qubitor Recovery Kit and account recovery discussion.",
    seed: [
      "Use this channel for Qubitor Recovery Kit questions.",
      "",
      "Never post private keys, seed phrases, PQ private material, recovery files, or screenshots containing secrets.",
    ],
  },
  {
    name: "bridge",
    category: "bridge",
    topic: "Sepolia QBT and native Qubitor QBT bridge discussion.",
    seed: [
      "Bridge directions:",
      "",
      "- Sepolia QBT -> Qubitor native QBT",
      "- Qubitor native QBT -> Sepolia QBT",
      "",
      "Use this channel for transfer status, confirmation windows, and bridge questions.",
    ],
  },
  {
    name: "liquidity",
    category: "bridge",
    topic: "Bridge liquidity provider discussion.",
    seed: [
      "Liquidity providers supply Sepolia QBT liquidity for bridge releases and can participate in ETH epoch reward testing.",
      "",
      "Use this channel for vault deposits, withdrawals, liquidity status, and LP questions.",
    ],
  },
  {
    name: "rewards",
    category: "bridge",
    topic: "ETH epoch rewards for bridge liquidity.",
    seed: [
      "Use this channel for ETH epoch reward testing, claims, reward accounting, and LP reward questions.",
    ],
  },
  {
    name: "developers",
    category: "developers",
    topic: "Developer discussion for Qubitor apps and integrations.",
    seed: [
      "Developer resources:",
      "",
      "- npm: @qubitor/chain-config",
      "- npm: @qubitor/pq-native-tx",
      "- npm: @qubitor/sdk",
      "- GitHub: https://github.com/QubitorNetwork/qubitor",
      "- RPC: https://testrpc.qubitor.org/rpc",
    ],
  },
  {
    name: "sdk",
    category: "developers",
    topic: "Qubitor npm SDK packages.",
    seed: [
      "Install the SDK:",
      "",
      "```bash",
      "npm install @qubitor/sdk",
      "```",
      "",
      "The SDK uses the public Qubitor testnet RPC by default for testnet clients.",
    ],
  },
  {
    name: "rpc-and-api",
    category: "developers",
    topic: "RPC, API, and integration support.",
    seed: [
      "Public testnet RPC:",
      "",
      "```text",
      "https://testrpc.qubitor.org/rpc",
      "```",
      "",
      "Use this RPC for apps, wallets, and simple scripts. Node/admin endpoints stay on operator machines.",
    ],
  },
  {
    name: "github",
    category: "developers",
    topic: "Repository links and contribution discussion.",
    seed: [
      "Qubitor GitHub:",
      "",
      "https://github.com/QubitorNetwork/qubitor",
      "",
      "Use this channel for repo questions, issues, and contribution coordination.",
    ],
  },
  {
    name: "general",
    category: "community",
    topic: "General Qubitor community discussion.",
    seed: [
      "General Qubitor discussion goes here.",
      "",
      "For support, use the specific testnet, wallet, bridge, mining, or developer channels.",
    ],
  },
  {
    name: "introductions",
    category: "community",
    topic: "Introduce yourself to the Qubitor community.",
    seed: [
      "Say hello and tell the community what you are building, mining, testing, or learning.",
    ],
  },
  {
    name: "bug-reports",
    category: "support",
    topic: "Bug reports for wallet, RPC, explorer, faucet, mining, and bridge.",
    seed: [
      "Bug report format:",
      "",
      "- Area: wallet / RPC / explorer / faucet / mining / bridge / docs",
      "- What happened:",
      "- What you expected:",
      "- Address or tx hash if relevant:",
      "- Screenshot or logs with secrets removed:",
    ],
  },
  {
    name: "support",
    category: "support",
    topic: "General Qubitor support.",
    seed: [
      "Ask for help here if your issue does not fit another channel.",
      "",
      "Never accept private support DMs asking for keys, seeds, or remote access.",
    ],
  },
  {
    name: "mod-log",
    category: "moderation",
    topic: "Private moderation log.",
    private: true,
    seed: [
      "Private moderation log for Qubitor server staff.",
    ],
  },
  {
    name: "admin-room",
    category: "moderation",
    topic: "Private admin coordination.",
    private: true,
    seed: [
      "Private admin coordination channel.",
      "",
      "Do not post production secrets here. Use the proper secret manager or deployment environment.",
    ],
  },
];

loadEnv(envFile);

const token = requireEnv("DISCORD_BOT_TOKEN");
let guildId = requireEnv("DISCORD_GUILD_ID");

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function discordRequest(method, route, body, attempt = 1) {
  if (dryRun && ["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    log(`dry-run ${method} ${route}`);
    return body ?? {};
  }

  const response = await fetch(`${apiBase}${route}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "QubitorDiscordSetup/1.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (response.status === 429 && attempt <= 5) {
    const retryAfterSeconds = Number(data?.retry_after ?? 1);
    await sleep(Math.ceil(retryAfterSeconds * 1000));
    return discordRequest(method, route, body, attempt + 1);
  }

  if (!response.ok) {
    const discordMessage = data?.message ? `: ${data.message}` : "";
    throw new Error(`${method} ${route} failed with ${response.status}${discordMessage}`);
  }

  return data;
}

async function listRoles() {
  return discordRequest("GET", `/guilds/${guildId}/roles`);
}

async function listChannels() {
  return discordRequest("GET", `/guilds/${guildId}/channels`);
}

async function ensureRole(existingRoles, spec) {
  const existing = existingRoles.find((role) => normalizeName(role.name) === normalizeName(spec.name));
  if (existing) {
    log(`role exists: ${spec.name}`);
    return existing;
  }

  const created = await discordRequest("POST", `/guilds/${guildId}/roles`, spec);
  log(`role created: ${spec.name}`);
  existingRoles.push(created);
  return created;
}

async function ensureCategory(existingChannels, spec, position) {
  const existing = existingChannels.find(
    (channel) =>
      channel.type === channelTypes.category &&
      normalizeName(channel.name) === normalizeName(spec.name),
  );
  if (existing) {
    log(`category exists: ${spec.name}`);
    return existing;
  }

  const created = await discordRequest("POST", `/guilds/${guildId}/channels`, {
    name: spec.name,
    type: channelTypes.category,
    position,
  });
  log(`category created: ${spec.name}`);
  existingChannels.push(created);
  return created;
}

async function ensureTextChannel(existingChannels, spec, category, roleByName, position) {
  const existing = existingChannels.find(
    (channel) =>
      channel.type === channelTypes.text &&
      normalizeName(channel.name) === normalizeName(spec.name),
  );
  if (existing) {
    log(`channel exists: #${spec.name}`);
    return existing;
  }

  const privateRoleIds = [roleByName.get("Core Team")?.id, roleByName.get("Moderator")?.id].filter(Boolean);
  const body = {
    name: spec.name,
    type: channelTypes.text,
    parent_id: category.id,
    position,
    topic: spec.topic,
  };

  if (spec.private) {
    body.permission_overwrites = createPrivateOverwrites(guildId, privateRoleIds);
  }

  const created = await discordRequest("POST", `/guilds/${guildId}/channels`, body);
  log(`channel created: #${spec.name}`);
  existingChannels.push(created);
  return created;
}

async function findSeedMessage(channelId, spec) {
  const messages = await discordRequest("GET", `/channels/${channelId}/messages?limit=25`);
  const expectedContent = spec.seed.join("\n").trim();
  const legacyMarker = `[setup:qubitor-discord:v1:${spec.name}]`;
  const firstLine = spec.seed.find((line) => line.trim())?.trim();

  return messages.find((message) => {
    if (message.author?.id !== botUser.id) {
      return false;
    }

    const content = message.content.trim();
    return (
      content === expectedContent ||
      content.includes(legacyMarker) ||
      (firstLine ? content.startsWith(firstLine) : false)
    );
  });
}

async function seedChannel(channel, spec) {
  if (!spec.seed?.length) {
    return;
  }

  const expectedContent = spec.seed.join("\n");
  const existing = await findSeedMessage(channel.id, spec);
  if (existing) {
    if (existing.content.trim() !== expectedContent.trim()) {
      await discordRequest("PATCH", `/channels/${channel.id}/messages/${existing.id}`, {
        content: expectedContent,
      });
      log(`seed updated: #${spec.name}`);
      return;
    }

    log(`seed exists: #${spec.name}`);
    return;
  }

  await discordRequest("POST", `/channels/${channel.id}/messages`, { content: expectedContent });
  log(`seeded: #${spec.name}`);
}

let botUser;

async function resolveGuild() {
  try {
    return await discordRequest("GET", `/guilds/${guildId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("404")) {
      throw error;
    }
  }

  const joinedGuilds = await discordRequest("GET", "/users/@me/guilds");
  if (joinedGuilds.length === 0) {
    throw new Error(
      "the bot token is valid, but the bot is not installed in any Discord server",
    );
  }

  if (joinedGuilds.length > 1) {
    const guildList = joinedGuilds
      .map((guild) => `${guild.name} (${guild.id})`)
      .join(", ");
    throw new Error(
      `DISCORD_GUILD_ID is not reachable. Set it to one of the bot's server IDs: ${guildList}`,
    );
  }

  const [onlyGuild] = joinedGuilds;
  guildId = onlyGuild.id;
  log(`configured DISCORD_GUILD_ID was not reachable; using bot's only server: ${onlyGuild.name} (${onlyGuild.id})`);
  return onlyGuild;
}

async function main() {
  log(`using env file: ${path.relative(repoRoot, envFile)}`);
  if (dryRun) {
    log("dry-run mode enabled");
  }

  botUser = await discordRequest("GET", "/users/@me");
  log(`connected bot: ${botUser.username} (${botUser.id})`);

  const guild = await resolveGuild();
  log(`guild: ${guild.name} (${guild.id})`);

  const roles = await listRoles();
  for (const spec of roleSpecs) {
    await ensureRole(roles, spec);
  }

  const roleByName = new Map(roles.map((role) => [role.name, role]));
  let channels = await listChannels();
  const categoryByKey = new Map();

  for (const [index, spec] of categorySpecs.entries()) {
    const category = await ensureCategory(channels, spec, index);
    categoryByKey.set(spec.key, category);
  }

  channels = await listChannels();
  const createdChannels = [];

  for (const [index, spec] of channelSpecs.entries()) {
    const category = categoryByKey.get(spec.category);
    if (!category) {
      throw new Error(`missing category for ${spec.name}: ${spec.category}`);
    }

    const channel = await ensureTextChannel(channels, spec, category, roleByName, index);
    createdChannels.push({ channel, spec });
  }

  for (const { channel, spec } of createdChannels) {
    await seedChannel(channel, spec);
  }

  log(`complete: ${roleSpecs.length} roles checked, ${categorySpecs.length} categories checked, ${channelSpecs.length} channels checked`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
