#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bridgeDir = process.env.QUBITOR_BRIDGE_DIR || path.resolve(rootDir, "../qubitor-bridge");
const dashboardDate = process.env.QUBITOR_DASHBOARD_DATE || new Date().toISOString().slice(0, 10);
const outputFile =
  process.env.QUBITOR_DASHBOARD_OUT ||
  path.join(rootDir, "audits", `mainnet-readiness-dashboard-${dashboardDate}.md`);

const primaryRpcUrl = process.env.QUBITOR_DASHBOARD_PRIMARY_RPC_URL || "https://testrpc.qubitor.org/rpc";
const secondaryRpcUrl = process.env.QUBITOR_DASHBOARD_SECONDARY_RPC_URL || "https://testrpc2.qubitor.org/rpc";
const bridgeApiBase = process.env.QUBITOR_DASHBOARD_BRIDGE_API_URL || "https://api.0xq.app";

const blockedMethods = [
  "admin_nodeInfo",
  "debug_verbosity",
  "personal_listAccounts",
  "miner_start",
  "txpool_status",
  "engine_exchangeCapabilities",
];

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function statusIcon(status) {
  if (status === "green") return "Green";
  if (status === "yellow") return "Yellow";
  return "Red";
}

function mdEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function hexToNumber(value) {
  if (typeof value !== "string" || !value.startsWith("0x")) return undefined;
  const parsed = BigInt(value);
  return parsed > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(parsed);
}

async function rpcCall(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${url} ${method} returned HTTP ${response.status}`);
  return response.json();
}

async function rpcSummary(url) {
  const chainId = await rpcCall(url, "eth_chainId");
  const blockNumber = await rpcCall(url, "eth_blockNumber");
  const genesis = await rpcCall(url, "eth_getBlockByNumber", ["0x0", false]);
  const blocked = [];
  for (const method of blockedMethods) {
    const payload = await rpcCall(url, method, []);
    blocked.push({ method, blocked: payload?.error?.code === -32601 });
  }
  const healthResponse = await fetch(url.replace(/\/rpc$/, "/health"));
  const health = await healthResponse.json();
  return {
    url,
    chainId: chainId?.result,
    blockNumber: hexToNumber(blockNumber?.result),
    genesisHash: genesis?.result?.hash,
    blocked,
    health,
    ok:
      chainId?.result === "0x164ca" &&
      health?.ok === true &&
      !("upstreamRpcUrl" in health) &&
      blocked.every((item) => item.blocked),
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function latestSoakArtifact() {
  const dir = path.join(bridgeDir, "artifacts/testnet/bridge-soak");
  if (!fs.existsSync(dir)) return undefined;
  const latest = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const fullPath = path.join(dir, file);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!latest) return undefined;
  return {
    path: latest.fullPath,
    summary: JSON.parse(fs.readFileSync(latest.fullPath, "utf8")),
  };
}

function peerDiversitySummary() {
  const result = spawnSync("node", ["scripts/testnet/peer-miner-diversity.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, QUBITOR_PEER_DIVERSITY_WARN_ONLY: "1" },
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return {
      ok: false,
      failures: [`peer/miner diversity script did not return JSON: ${result.stderr || result.stdout}`],
    };
  }
}

function ownerProofSummary() {
  const env = {
    ...readEnvFile(path.join(bridgeDir, ".env.testnet.example")),
    ...readEnvFile(path.join(bridgeDir, ".env.testnet.local")),
    ...process.env,
  };
  const safeAddress = env.SEPOLIA_SAFE_ADDRESS || env.SEPOLIA_BRIDGE_ADMIN_ADDRESS || "";
  const deployer = env.ETHEREUM_DEPLOYER_ADDRESS || "";
  const owners = (env.SEPOLIA_SAFE_OWNER_ADDRESSES || "")
    .split(",")
    .map((owner) => owner.trim())
    .filter(Boolean);
  const threshold = Number(env.SEPOLIA_SAFE_THRESHOLD || "0");
  const placeholder = (value) => !value || /replace-with|example|your-|owner\d/i.test(value);
  const failures = [];
  if (placeholder(safeAddress)) failures.push("missing Sepolia Safe/admin address");
  if (safeAddress && deployer && safeAddress.toLowerCase() === deployer.toLowerCase()) {
    failures.push("Sepolia admin matches deployer EOA");
  }
  if (!Number.isInteger(threshold) || threshold < 2) failures.push("Safe threshold below 2");
  if (owners.length < 3) failures.push("fewer than 3 Safe owners configured");
  return { ok: failures.length === 0, safeAddress, ownerCount: owners.length, threshold, failures };
}

function bridgeSoakStatus(soak) {
  if (!soak) return { status: "red", detail: "No soak artifact found" };
  const summary = soak.summary;
  if (summary?.ok && summary.passedRuns >= 20 && summary.failedRuns === 0 && summary.uniqueAmounts >= 20) {
    return { status: "green", detail: `${summary.passedRuns}/20 runs passed, ${summary.failedRuns} failures` };
  }
  return {
    status: "red",
    detail: `${summary?.passedRuns ?? 0} passed, ${summary?.failedRuns ?? "unknown"} failures`,
  };
}

const checks = [];
const evidence = [];

const [primary, secondary] = await Promise.all([rpcSummary(primaryRpcUrl), rpcSummary(secondaryRpcUrl)]);
checks.push({
  area: "Public RPC",
  status: primary.ok && secondary.ok && primary.genesisHash === secondary.genesisHash ? "green" : "red",
  detail: `Primary block ${primary.blockNumber}, secondary block ${secondary.blockNumber}, privileged namespaces blocked`,
});
evidence.push(`Primary genesis: \`${primary.genesisHash}\``);
evidence.push(`Secondary genesis: \`${secondary.genesisHash}\``);

const peerSummary = peerDiversitySummary();
checks.push({
  area: "Peer and miner diversity",
  status: peerSummary.ok ? "green" : "red",
  detail: (peerSummary.failures ?? []).length
    ? peerSummary.failures.join("; ")
    : `Policy satisfied across ${peerSummary.endpoints?.length ?? 0} endpoint(s)`,
});

let bridgeHealth;
let bridgeStatus;
let bridgeLiquidity;
try {
  [bridgeHealth, bridgeStatus, bridgeLiquidity] = await Promise.all([
    fetchJson(`${bridgeApiBase}/health`),
    fetchJson(`${bridgeApiBase}/bridge/status`),
    fetchJson(`${bridgeApiBase}/bridge/liquidity`),
  ]);
  checks.push({
    area: "Bridge API",
    status: bridgeHealth?.ok && bridgeStatus?.online ? "green" : "red",
    detail: `API online=${Boolean(bridgeStatus?.online)}, noWQBT=${Boolean(bridgeStatus?.noWQBT)}`,
  });
} catch (error) {
  checks.push({
    area: "Bridge API",
    status: "red",
    detail: error instanceof Error ? error.message : String(error),
  });
}

const soak = latestSoakArtifact();
const soakStatus = bridgeSoakStatus(soak);
checks.push({
  area: "Bridge soak",
  status: soakStatus.status,
  detail: soakStatus.detail,
});
if (soak?.path) evidence.push(`Latest bridge soak: \`${soak.path}\``);

const ownerProof = ownerProofSummary();
checks.push({
  area: "Sepolia ownership proof",
  status: ownerProof.ok ? "green" : "red",
  detail: ownerProof.ok
    ? `Safe ${ownerProof.safeAddress}, ${ownerProof.threshold}-of-${ownerProof.ownerCount}`
    : ownerProof.failures.join("; "),
});

const refundRunbook = fs.existsSync(path.join(bridgeDir, "docs/refund-runbook.md"));
checks.push({
  area: "Refund operations",
  status: refundRunbook ? "green" : "red",
  detail: refundRunbook ? "Refund runbook exists" : "Missing bridge refund runbook",
});

const firewallDoc = fs.existsSync(path.join(rootDir, "docs/testnet/firewall-and-public-surface.md"));
checks.push({
  area: "Firewall/public surface",
  status: firewallDoc ? "green" : "red",
  detail: firewallDoc ? "Public surface doc exists" : "Missing firewall/public surface doc",
});

checks.push({
  area: "External audits",
  status: "red",
  detail: "External audit closure is deferred until the report or attestation is added",
});

const reds = checks.filter((check) => check.status === "red");
const yellows = checks.filter((check) => check.status === "yellow");
const launchStatus = reds.length === 0 ? (yellows.length === 0 ? "green" : "yellow") : "red";

const lines = [
  "# Qubitor Mainnet Readiness Dashboard",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "Hard rule: no live chain deletion, reset, rewrite, genesis replacement, or node-data wipe was performed by this dashboard.",
  "",
  `Overall status: **${statusIcon(launchStatus)}**`,
  "",
  "| Area | Status | Detail |",
  "| --- | --- | --- |",
  ...checks.map((check) => `| ${mdEscape(check.area)} | ${statusIcon(check.status)} | ${mdEscape(check.detail)} |`),
  "",
  "## Evidence",
  "",
  ...evidence.map((item) => `- ${item}`),
  `- Bridge API: \`${bridgeApiBase}\``,
  `- Sepolia liquidity available: \`${bridgeLiquidity?.ethereumQBTAvailable ?? "unavailable"}\``,
  "",
  "## Peer And Miner Snapshot",
  "",
  "```json",
  JSON.stringify(peerSummary, null, 2),
  "```",
  "",
  "## Remaining Launch Blockers",
  "",
  ...reds.map((check) => `- ${check.area}: ${check.detail}`),
  "",
];

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${lines.join("\n")}\n`);
console.log(`[qubitor-mainnet-dashboard] wrote ${outputFile}`);
console.log(JSON.stringify({ ok: reds.length === 0, outputFile, red: reds.length, yellow: yellows.length }, null, 2));
