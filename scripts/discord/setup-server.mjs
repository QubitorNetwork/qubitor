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
  forum: 15,
};

const overwriteTypes = {
  role: 0,
  member: 1,
};

const permissions = {
  addReactions: 1n << 6n,
  viewChannel: 1n << 10n,
  sendMessages: 1n << 11n,
  manageMessages: 1n << 13n,
  embedLinks: 1n << 14n,
  attachFiles: 1n << 15n,
  readMessageHistory: 1n << 16n,
  useApplicationCommands: 1n << 31n,
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

function createRoleOverwrite(roleId, allow, deny = 0n) {
  return {
    id: roleId,
    type: overwriteTypes.role,
    allow: allow.toString(),
    deny: deny.toString(),
  };
}

function createMemberOverwrite(memberId, allow, deny = 0n) {
  return {
    id: memberId,
    type: overwriteTypes.member,
    allow: allow.toString(),
    deny: deny.toString(),
  };
}

function createOverwriteContext(roleByName) {
  const staffRoleIds = [roleByName.get("Core Team")?.id, roleByName.get("Moderator")?.id].filter(Boolean);
  const verifiedRoleId = roleByName.get("Verified")?.id;
  return { staffRoleIds, verifiedRoleId };
}

function createStaffOverwrites(roleByName) {
  const { staffRoleIds } = createOverwriteContext(roleByName);
  const staffAllowed =
    permissions.viewChannel |
    permissions.sendMessages |
    permissions.readMessageHistory |
    permissions.addReactions |
    permissions.embedLinks |
    permissions.attachFiles |
    permissions.manageMessages |
    permissions.useApplicationCommands;

  return [
    ...staffRoleIds.map((roleId) => createRoleOverwrite(roleId, staffAllowed)),
    createMemberOverwrite(botUser.id, staffAllowed),
  ];
}

function createEntryReadOnlyOverwrites(guildId, roleByName) {
  const readOnlyAllowed =
    permissions.viewChannel |
    permissions.readMessageHistory |
    permissions.addReactions |
    permissions.useApplicationCommands;
  return [
    createRoleOverwrite(guildId, readOnlyAllowed, permissions.sendMessages),
    ...createStaffOverwrites(roleByName),
    ...createAutomationOverwrites(roleByName),
  ];
}

function createAutomationOverwrites(roleByName) {
  const automationAllowed =
    permissions.viewChannel |
    permissions.sendMessages |
    permissions.readMessageHistory |
    permissions.embedLinks |
    permissions.addReactions;
  return ["AuthGG"].flatMap((roleName) => {
    const role = roleByName.get(roleName);
    return role ? [createRoleOverwrite(role.id, automationAllowed)] : [];
  });
}

function createVerifiedOverwrites(guildId, roleByName, readOnly = false) {
  const { verifiedRoleId } = createOverwriteContext(roleByName);
  const readAllowed =
    permissions.viewChannel |
    permissions.readMessageHistory |
    permissions.addReactions |
    permissions.useApplicationCommands;
  const writeAllowed =
    readAllowed |
    permissions.sendMessages |
    permissions.embedLinks |
    permissions.attachFiles;
  const overwrites = [
    createRoleOverwrite(guildId, 0n, permissions.viewChannel),
    ...createStaffOverwrites(roleByName),
  ];

  if (verifiedRoleId) {
    overwrites.push(createRoleOverwrite(verifiedRoleId, readOnly ? readAllowed : writeAllowed, readOnly ? permissions.sendMessages : 0n));
  }

  return overwrites;
}

function createPrivateOverwrites(guildId, roleByName) {
  return [
    createRoleOverwrite(guildId, 0n, permissions.viewChannel),
    ...createStaffOverwrites(roleByName),
  ];
}

function createPrivateAutomationOverwrites(guildId, roleByName) {
  return [
    ...createPrivateOverwrites(guildId, roleByName),
    ...createAutomationOverwrites(roleByName),
  ];
}

function overwritesForAccess(access, guildId, roleByName) {
  if (access === "private") {
    return createPrivateOverwrites(guildId, roleByName);
  }

  if (access === "private-automation") {
    return createPrivateAutomationOverwrites(guildId, roleByName);
  }

  if (access === "verified") {
    return createVerifiedOverwrites(guildId, roleByName);
  }

  if (access === "verified-readonly") {
    return createVerifiedOverwrites(guildId, roleByName, true);
  }

  return createEntryReadOnlyOverwrites(guildId, roleByName);
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
  { key: "start", name: "Start Here", access: "entry" },
  { key: "official", name: "Official", access: "official" },
  { key: "testnet", name: "Testnet", access: "verified" },
  { key: "mining", name: "Mining", access: "verified" },
  { key: "wallet", name: "Wallet", access: "verified" },
  { key: "bridge", name: "Bridge", access: "verified" },
  { key: "developers", name: "Developers", access: "verified" },
  { key: "community", name: "Community", access: "verified" },
  { key: "support", name: "Support", access: "verified" },
  { key: "moderation", name: "Moderation", access: "private" },
];

const channelSpecs = [
  {
    name: "welcome",
    category: "start",
    access: "entry-readonly",
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
    name: "faq",
    category: "start",
    access: "entry-readonly",
    topic: "Short answers for new Qubitor members.",
    seed: [
      "Qubitor quick FAQ",
      "",
      "What is Qubitor?",
      "A mineable EVM-compatible Layer 1 with QBT as the native gas coin.",
      "",
      "What can I do today?",
      "Join the testnet, use the faucet, mine QBT, test the wallet, and follow bridge work.",
      "",
      "Where do I start?",
      "Verify in this server, then check #testnet-status and #faucet.",
    ],
  },
  {
    name: "rules",
    category: "start",
    access: "entry-readonly",
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
    access: "entry-readonly",
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
    access: "entry-readonly",
    topic: "Official Qubitor announcements.",
    seed: [
      "Official Qubitor announcements will be posted here.",
      "",
      "Treat links outside this channel as community-shared unless confirmed by the team.",
    ],
  },
  {
    name: "quick-links",
    category: "official",
    access: "entry-readonly",
    topic: "Core Qubitor links.",
    seed: [
      "Qubitor links",
      "",
      "- RPC: https://testrpc.qubitor.org/rpc",
      "- Explorer: https://testexplorer.qubitor.org",
      "- Faucet: https://testrpc.qubitor.org/faucet",
      "- GitHub: https://github.com/QubitorNetwork/qubitor",
      "- npm: @qubitor/sdk",
    ],
  },
  {
    name: "status",
    category: "official",
    access: "entry-readonly",
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
    access: "verified-readonly",
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
    name: "node-operators",
    category: "mining",
    topic: "Node operation, bootnodes, sync, and uptime.",
    seed: [
      "Node operator discussion lives here.",
      "",
      "Good details to include: node version, host OS, peer count, block height, public IP/NAT setup, and logs with secrets removed.",
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
    name: "contracts",
    category: "developers",
    topic: "Qubitor contracts, system addresses, and contract integration.",
    seed: [
      "Use this channel for Qubitor contracts, system addresses, ABIs, deployment questions, and integration notes.",
      "",
      "For wallet/app work, include the chain ID, RPC URL, contract address, and transaction hash when possible.",
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
    name: "forum",
    type: "forum",
    category: "community",
    topic: "Longer Qubitor discussions, questions, proposals, and testnet writeups.",
    tags: ["Question", "Idea", "Build", "Mining", "Wallet", "Bridge", "Docs"],
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
    name: "showcase",
    category: "community",
    topic: "Share Qubitor builds, dashboards, tools, and experiments.",
    seed: [
      "Share what you are building around Qubitor.",
      "",
      "Tools, dashboards, miner setups, wallet experiments, and testnet writeups are welcome.",
    ],
  },
  {
    name: "feedback",
    category: "community",
    topic: "Product, docs, wallet, bridge, and testnet feedback.",
    seed: [
      "Drop Qubitor feedback here.",
      "",
      "Clear examples help most: what you tried, what felt confusing, and what would make it easier.",
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
    access: "private-automation",
    topic: "Private moderation log.",
    private: true,
    seed: [
      "Private moderation log for Qubitor server staff.",
    ],
  },
  {
    name: "admin-room",
    category: "moderation",
    access: "private",
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

async function tuneGuildDefaults(guild) {
  try {
    await discordRequest("PATCH", `/guilds/${guildId}`, {
      default_message_notifications: 1,
      explicit_content_filter: 2,
    });
    log(`guild defaults tuned: ${guild.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`guild defaults skipped: ${message}`);
  }
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

async function tuneChannel(channel, patch, label) {
  await discordRequest("PATCH", `/channels/${channel.id}`, patch);
  log(`${label} tuned`);
  return { ...channel, ...patch };
}

async function ensureCategory(existingChannels, spec, roleByName, position) {
  const existing = existingChannels.find(
    (channel) =>
      channel.type === channelTypes.category &&
      normalizeName(channel.name) === normalizeName(spec.name),
  );
  const permission_overwrites = overwritesForAccess(spec.access, guildId, roleByName);
  if (existing) {
    log(`category exists: ${spec.name}`);
    return tuneChannel(existing, { position, permission_overwrites }, `category ${spec.name}`);
  }

  const created = await discordRequest("POST", `/guilds/${guildId}/channels`, {
    name: spec.name,
    type: channelTypes.category,
    position,
    permission_overwrites,
  });
  log(`category created: ${spec.name}`);
  existingChannels.push(created);
  return created;
}

function createChannelPatch(spec, category, categorySpec, roleByName) {
  const channelAccess = spec.access ?? categorySpec.access;
  const patch = {
    parent_id: category.id,
    topic: spec.topic,
    permission_overwrites: overwritesForAccess(channelAccess, guildId, roleByName),
  };

  if (spec.type === "forum") {
    patch.available_tags = spec.tags.map((name) => ({ name, moderated: false }));
    patch.default_sort_order = 0;
    patch.default_forum_layout = 1;
  }

  return patch;
}

async function ensureManagedChannel(existingChannels, spec, category, categorySpec, roleByName, position) {
  const type = spec.type === "forum" ? channelTypes.forum : channelTypes.text;
  const existing = existingChannels.find(
    (channel) =>
      channel.type === type &&
      normalizeName(channel.name) === normalizeName(spec.name),
  );
  const patch = createChannelPatch(spec, category, categorySpec, roleByName);

  if (existing) {
    log(`${spec.type === "forum" ? "forum" : "channel"} exists: #${spec.name}`);
    return tuneChannel(existing, patch, `channel #${spec.name}`);
  }

  const body = {
    name: spec.name,
    type,
    parent_id: category.id,
    position,
    topic: spec.topic,
    ...patch,
  };

  const created = await discordRequest("POST", `/guilds/${guildId}/channels`, body);
  log(`${spec.type === "forum" ? "forum" : "channel"} created: #${spec.name}`);
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
  await tuneGuildDefaults(guild);

  const roles = await listRoles();
  for (const spec of roleSpecs) {
    await ensureRole(roles, spec);
  }

  const roleByName = new Map(roles.map((role) => [role.name, role]));
  let channels = await listChannels();
  const categoryByKey = new Map();
  const categorySpecByKey = new Map(categorySpecs.map((spec) => [spec.key, spec]));

  for (const [index, spec] of categorySpecs.entries()) {
    const category = await ensureCategory(channels, spec, roleByName, index);
    categoryByKey.set(spec.key, category);
  }

  channels = await listChannels();
  const createdChannels = [];

  for (const [index, spec] of channelSpecs.entries()) {
    const category = categoryByKey.get(spec.category);
    const categorySpec = categorySpecByKey.get(spec.category);
    if (!category) {
      throw new Error(`missing category for ${spec.name}: ${spec.category}`);
    }
    if (!categorySpec) {
      throw new Error(`missing category spec for ${spec.name}: ${spec.category}`);
    }

    const channel = await ensureManagedChannel(channels, spec, category, categorySpec, roleByName, index);
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
