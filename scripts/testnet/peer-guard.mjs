#!/usr/bin/env node

const localRpcUrl = process.env.QUBITOR_LOCAL_ADMIN_RPC_URL || "http://qubitor-node:8545";
const expectedChainId = normalizeHex(process.env.QUBITOR_EXPECTED_CHAIN_ID || "0x164ca");
const expectedGenesisHash = (
  process.env.QUBITOR_EXPECTED_GENESIS_HASH ||
  "0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483"
).toLowerCase();
const requiredPeers = splitCsv(process.env.QUBITOR_REQUIRED_PEERS || process.env.QUBITOR_BOOTNODES || "");
const minPeers = intEnv("QUBITOR_MIN_PEERS_BEFORE_MINE", 1);
const minerThreads = intEnv("QUBITOR_MINER_THREADS", 1);
const intervalMs = intEnv("QUBITOR_PEER_GUARD_INTERVAL_MS", 15_000);
const finalityDepth = intEnv("QUBITOR_PEER_GUARD_FINALITY_DEPTH", 12);
const maxHeightLag = intEnv("QUBITOR_PEER_GUARD_MAX_HEIGHT_LAG", 24);
const publicRpcUrls = splitCsv(
  process.env.QUBITOR_PEER_GUARD_PUBLIC_RPC_URLS ||
    "https://testrpc.qubitor.org/rpc,https://testrpc2.qubitor.org/rpc",
);
const once = process.argv.includes("--once") || process.env.QUBITOR_PEER_GUARD_ONCE === "1";

function splitCsv(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeHex(value) {
  if (typeof value !== "string") return value;
  return value.toLowerCase();
}

function hexToNumber(value) {
  if (typeof value !== "string" || !value.startsWith("0x")) return undefined;
  const parsed = BigInt(value);
  return parsed > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(parsed);
}

function nodeIdFromEnode(enode) {
  const match = /^enode:\/\/([^@]+)/i.exec(enode);
  return match?.[1]?.toLowerCase();
}

async function rpcCall(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${url} ${method} returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(`${url} ${method} error ${payload.error.code}: ${payload.error.message}`);
  return payload?.result;
}

async function optionalRpcCall(url, method, params = []) {
  try {
    return { ok: true, result: await rpcCall(url, method, params) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function localStatus() {
  const [nodeInfo, chainId, genesis, headHex, peerHex, mining, peers] = await Promise.all([
    rpcCall(localRpcUrl, "admin_nodeInfo"),
    rpcCall(localRpcUrl, "eth_chainId"),
    rpcCall(localRpcUrl, "eth_getBlockByNumber", ["0x0", false]),
    rpcCall(localRpcUrl, "eth_blockNumber"),
    rpcCall(localRpcUrl, "net_peerCount"),
    rpcCall(localRpcUrl, "eth_mining"),
    optionalRpcCall(localRpcUrl, "admin_peers"),
  ]);

  return {
    nodeId: String(nodeInfo?.id || "").toLowerCase(),
    enode: nodeInfo?.enode,
    chainId: normalizeHex(chainId),
    genesisHash: String(genesis?.hash || "").toLowerCase(),
    head: hexToNumber(headHex) ?? 0,
    peerCount: hexToNumber(peerHex) ?? 0,
    mining: Boolean(mining),
    peers: peers.ok && Array.isArray(peers.result) ? peers.result : [],
  };
}

async function addRequiredPeers(status) {
  const ownIds = new Set([status.nodeId, nodeIdFromEnode(status.enode)].filter(Boolean));
  const attempts = [];
  for (const enode of requiredPeers) {
    if (ownIds.has(nodeIdFromEnode(enode))) continue;
    const addPeer = await optionalRpcCall(localRpcUrl, "admin_addPeer", [enode]);
    const addTrustedPeer = await optionalRpcCall(localRpcUrl, "admin_addTrustedPeer", [enode]);
    attempts.push({ enode, addPeer, addTrustedPeer });
  }
  return attempts;
}

async function publicHeadAgreement(localHead) {
  if (publicRpcUrls.length < 2) return { ok: true, reason: "single-or-no-public-rpc" };

  const heads = [];
  for (const url of publicRpcUrls) {
    const head = await optionalRpcCall(url, "eth_blockNumber");
    const genesis = await optionalRpcCall(url, "eth_getBlockByNumber", ["0x0", false]);
    if (!head.ok || !genesis.ok) return { ok: false, reason: "public-rpc-unavailable", url, head, genesis };
    if (String(genesis.result?.hash || "").toLowerCase() !== expectedGenesisHash) {
      return { ok: false, reason: "public-genesis-mismatch", url, genesisHash: genesis.result?.hash };
    }
    heads.push({ url, head: hexToNumber(head.result) ?? 0 });
  }

  const highest = Math.max(...heads.map((entry) => entry.head), localHead);
  const lowest = Math.min(...heads.map((entry) => entry.head), localHead);
  if (highest - lowest > maxHeightLag) return { ok: false, reason: "height-lag", heads, localHead, highest, lowest };

  const sample = Math.max(0, Math.min(...heads.map((entry) => entry.head), localHead) - finalityDepth);
  const hashes = [];
  for (const entry of heads) {
    const block = await optionalRpcCall(entry.url, "eth_getBlockByNumber", [`0x${sample.toString(16)}`, false]);
    if (!block.ok) return { ok: false, reason: "public-sample-unavailable", sample, url: entry.url, block };
    hashes.push({ url: entry.url, hash: String(block.result?.hash || "").toLowerCase() });
  }
  const uniqueHashes = new Set(hashes.map((entry) => entry.hash));
  if (uniqueHashes.size > 1) return { ok: false, reason: "public-head-divergence", sample, hashes };
  return { ok: true, heads, sample, hash: hashes[0]?.hash };
}

async function enforceOnce() {
  const status = await localStatus();
  const peerAttempts = await addRequiredPeers(status);
  const publicAgreement = await publicHeadAgreement(status.head);
  const failures = [];

  if (status.chainId !== expectedChainId) failures.push(`chain id ${status.chainId} != ${expectedChainId}`);
  if (status.genesisHash !== expectedGenesisHash) failures.push(`genesis ${status.genesisHash} != ${expectedGenesisHash}`);
  if (status.peerCount < minPeers) failures.push(`peer count ${status.peerCount} < ${minPeers}`);
  if (!publicAgreement.ok) failures.push(`public head check failed: ${publicAgreement.reason}`);

  const shouldMine = failures.length === 0;
  let miningAction = "unchanged";
  if (!shouldMine && status.mining) {
    await rpcCall(localRpcUrl, "miner_stop");
    miningAction = "stopped";
  } else if (shouldMine && !status.mining) {
    await rpcCall(localRpcUrl, "miner_start", [minerThreads]);
    miningAction = "started";
  }

  const result = {
    ok: shouldMine,
    checkedAt: new Date().toISOString(),
    localRpcUrl,
    status,
    policy: { requiredPeerCount: peerAttempts.length, minPeers, finalityDepth, maxHeightLag },
    peerAttempts,
    publicAgreement,
    failures,
    miningAction,
  };
  console.log(JSON.stringify(result));
  return result;
}

async function main() {
  do {
    try {
      await enforceOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ ok: false, checkedAt: new Date().toISOString(), error: message }));
      try {
        await rpcCall(localRpcUrl, "miner_stop");
      } catch {
        // If local RPC is down, there is nothing safe to do except try again later.
      }
    }
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
