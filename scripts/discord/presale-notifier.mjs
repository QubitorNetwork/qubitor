#!/usr/bin/env node
// Posts a Discord message for each QBT presale contribution on Base.
// Watches the QubitorPresale contract's ContributionAccepted logs (eth_getLogs
// polling, no deps) and posts an embed to #presale via the bot.
//
//   node scripts/discord/presale-notifier.mjs            # run the live feed
//   node scripts/discord/presale-notifier.mjs --hello    # ensure #presale + post a status line
//   node scripts/discord/presale-notifier.mjs --test     # post a clearly-labeled sample embed
//   DISCORD_DRY_RUN=1 ... --test                         # print, don't post
//
// Env (infra/.env.discord.local): DISCORD_BOT_TOKEN, DISCORD_GUILD_ID (required);
// optional BASE_RPC_URL, PRESALE_ADDRESS, DISCORD_PRESALE_CHANNEL_ID, PRESALE_POLL_MS.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envFile = process.env.DISCORD_ENV_FILE || path.join(repoRoot, "infra", ".env.discord.local");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(envFile);

const DISCORD_API = "https://discord.com/api/v10";
const DRY_RUN = process.env.DISCORD_DRY_RUN === "1";
const TOKEN = requireEnv("DISCORD_BOT_TOKEN");
const GUILD = requireEnv("DISCORD_GUILD_ID");
const BASE_RPC = (process.env.BASE_RPC_URL || "https://mainnet.base.org").trim();
const PRESALE = (process.env.PRESALE_ADDRESS || "0x21117BAc2FE181f8bEa2378B3B4A0ab903bEA688").trim();
const POLL_MS = Number(process.env.PRESALE_POLL_MS || 12000);
const STEP = 2000n; // max block range per eth_getLogs chunk
let CHANNEL_ID = (process.env.DISCORD_PRESALE_CHANNEL_ID || "").trim();
const STATE_FILE = path.join(repoRoot, "scripts", "discord", ".presale-notifier-state.json");

// precomputed (Node has no keccak)
const TOPIC0 = "0x12d65a10e63dbe40ddef59e5a12c50e6bd74ea0dfaa7f52e022add8c73af36d1"; // ContributionAccepted(address,uint256,uint256,uint256,uint256,uint256)
const SEL_TOTAL_RAISED = "0xc5c4744c"; // totalRaised()
const SEL_HARD_CAP = "0x3a03171c"; // HARD_CAP()

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`Missing required env: ${name} (set it in ${envFile})`);
    process.exit(1);
  }
  return v.trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------- RPC ---------------------------------- */
let rpcId = 1;
async function rpc(method, params) {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
const blockNumber = async () => BigInt(await rpc("eth_blockNumber", []));
const ethCall = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const getLogs = (from, to) =>
  rpc("eth_getLogs", [{ address: PRESALE, topics: [TOPIC0], fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) }]);

/* ------------------------------- formatting ------------------------------ */
function fmtUnits(wei, dp = 18, maxFrac = 5) {
  const s = wei.toString().padStart(dp + 1, "0");
  const whole = BigInt(s.slice(0, -dp)).toLocaleString("en-US");
  const frac = s.slice(-dp).replace(/0+$/, "").slice(0, maxFrac);
  return frac ? `${whole}.${frac}` : whole;
}
const trunc = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const word = (dataNo0x, i) => "0x" + dataNo0x.slice(i * 64, i * 64 + 64);

function decodeLog(log) {
  const d = log.data.slice(2);
  return {
    contributor: "0x" + log.topics[1].slice(26),
    acceptedEth: BigInt(word(d, 0)),
    refundedEth: BigInt(word(d, 1)),
    allocation: BigInt(word(d, 2)),
    totalContribution: BigInt(word(d, 3)),
    totalAllocation: BigInt(word(d, 4)),
    tx: log.transactionHash,
    block: BigInt(log.blockNumber),
  };
}

/* -------------------------------- Discord -------------------------------- */
async function discord(method, route, body) {
  if (DRY_RUN && method !== "GET") {
    console.log(`[dry-run] ${method} ${route}`, body ? JSON.stringify(body).slice(0, 200) : "");
    return { id: "dry-run" };
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${DISCORD_API}${route}`, {
      method,
      headers: { Authorization: `Bot ${TOKEN}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      await sleep((j.retry_after || 1) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Discord ${method} ${route} -> ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`Discord ${method} ${route} rate-limited`);
}
const postMessage = (payload) => discord("POST", `/channels/${CHANNEL_ID}/messages`, payload);

async function ensureChannel() {
  if (CHANNEL_ID) return;
  const chans = await discord("GET", `/guilds/${GUILD}/channels`);
  const existing = chans.find((c) => c.type === 0 && c.name === "presale");
  if (existing) {
    CHANNEL_ID = existing.id;
    console.log(`Using existing #presale (${CHANNEL_ID})`);
    return;
  }
  const official = chans.find((c) => c.type === 4 && /official/i.test(c.name));
  const created = await discord("POST", `/guilds/${GUILD}/channels`, {
    name: "presale",
    type: 0,
    parent_id: official?.id,
    topic: "Live QBT presale contributions (Base) — automated feed.",
    permission_overwrites: [{ id: GUILD, type: 0, deny: "2048" }], // @everyone: deny SEND_MESSAGES (read-only feed)
  });
  CHANNEL_ID = created.id;
  console.log(`Created #presale (${CHANNEL_ID}) — set DISCORD_PRESALE_CHANNEL_ID=${CHANNEL_ID} to pin it`);
  await postMessage({
    content:
      "**QBT Presale — live contribution feed**\nEvery contribution to the presale contract on Base is posted here automatically.",
  });
}

/* ----------------------------- announce a tx ----------------------------- */
let HARD_CAP = null;
async function announce(ev, { sample = false } = {}) {
  if (HARD_CAP === null) {
    try { HARD_CAP = BigInt(await ethCall(PRESALE, SEL_HARD_CAP)); } catch { HARD_CAP = 0n; }
  }
  let raised = null;
  try { raised = BigInt(await ethCall(PRESALE, SEL_TOTAL_RAISED)); } catch {}
  const pct = raised !== null && HARD_CAP > 0n ? (Number((raised * 10000n) / HARD_CAP) / 100).toFixed(1) : null;

  const fields = [
    { name: "Contributed", value: `${fmtUnits(ev.acceptedEth)} ETH`, inline: true },
    { name: "Allocation", value: `${fmtUnits(ev.allocation)} QBT`, inline: true },
    { name: "Contributor", value: `[${trunc(ev.contributor)}](https://basescan.org/address/${ev.contributor})`, inline: true },
  ];
  if (raised !== null) {
    fields.push({ name: "Raised", value: `${fmtUnits(raised)} / ${fmtUnits(HARD_CAP)} ETH${pct !== null ? ` · ${pct}%` : ""}`, inline: false });
  }
  if (ev.refundedEth > 0n) fields.push({ name: "Refunded (over cap)", value: `${fmtUnits(ev.refundedEth)} ETH`, inline: true });

  const embed = {
    title: sample ? "🧪 Sample contribution (test — safe to delete)" : "● New presale contribution",
    url: sample ? undefined : `https://basescan.org/tx/${ev.tx}`,
    color: 0xe5e5e5,
    fields,
    footer: { text: "Qubitor Presale · Base" },
    timestamp: new Date().toISOString(),
  };
  await postMessage({ embeds: [embed] });
  console.log(`${sample ? "Posted sample" : "Posted contribution " + ev.tx} (${fmtUnits(ev.acceptedEth)} ETH)`);
}

/* -------------------------------- state ---------------------------------- */
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return null; } };
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s));

/* --------------------------------- main ---------------------------------- */
async function main() {
  const args = process.argv.slice(2);
  await ensureChannel();

  if (args.includes("--hello")) {
    await postMessage({ content: "✅ Presale notifier connected — live contribution feed is online." });
    console.log("Posted status message.");
    return;
  }
  if (args.includes("--test")) {
    await announce(
      { contributor: "0x000000000000000000000000000000000000dEaD", acceptedEth: 5n * 10n ** 17n, refundedEth: 0n, allocation: 5000n * 10n ** 18n, totalContribution: 5n * 10n ** 17n, totalAllocation: 5000n * 10n ** 18n, tx: "0x" + "0".repeat(64), block: 0n },
      { sample: true },
    );
    return;
  }

  let cursor;
  const state = loadState();
  if (state?.lastBlock) {
    cursor = BigInt(state.lastBlock);
  } else {
    cursor = await blockNumber();
    saveState({ lastBlock: cursor.toString() });
    console.log(`No state — starting from current block ${cursor} (only new contributions are posted).`);
  }
  console.log(`Watching ${PRESALE} on Base via ${BASE_RPC} (poll ${POLL_MS}ms).`);

  for (;;) {
    try {
      const latest = await blockNumber();
      while (cursor < latest) {
        const to = cursor + STEP < latest ? cursor + STEP : latest;
        const logs = await getLogs(cursor + 1n, to);
        logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16));
        for (const log of logs) {
          try { await announce(decodeLog(log)); } catch (e) { console.error("announce error:", e.message); }
        }
        cursor = to;
        saveState({ lastBlock: cursor.toString() });
      }
    } catch (e) {
      console.error("poll error:", e.message);
    }
    await sleep(POLL_MS);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
