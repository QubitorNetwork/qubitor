#!/usr/bin/env node

const rpcUrls = (
  process.env.QUBITOR_PEER_DIVERSITY_RPC_URLS ||
  "https://testrpc.qubitor.org/rpc,https://testrpc2.qubitor.org/rpc"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const sampleBlocks = intEnv("QUBITOR_PEER_DIVERSITY_SAMPLE_BLOCKS", 120);
const minPeerCount = intEnv("QUBITOR_MIN_PUBLIC_PEERS", 1);
const minDistinctMiners = intEnv("QUBITOR_MIN_RECENT_MINERS", 2);
const maxHeightLag = intEnv("QUBITOR_MAX_PUBLIC_RPC_HEIGHT_LAG", 24);
const finalityDepth = intEnv("QUBITOR_PUBLIC_RPC_HASH_SAMPLE_DEPTH", 12);
const expectedChainId = (process.env.QUBITOR_EXPECTED_CHAIN_ID || "0x164ca").toLowerCase();
const expectedGenesisHash = (
  process.env.QUBITOR_EXPECTED_GENESIS_HASH ||
  "0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483"
).toLowerCase();
const warnOnly = process.env.QUBITOR_PEER_DIVERSITY_WARN_ONLY === "1";

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function hexToBigInt(value) {
  if (typeof value !== "string" || !value.startsWith("0x")) return undefined;
  return BigInt(value);
}

function hexToNumber(value) {
  const parsed = hexToBigInt(value);
  if (parsed === undefined) return undefined;
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  return Number(parsed);
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
    return await rpcCall(url, method, params);
  } catch (error) {
    return { unavailable: true, error: error instanceof Error ? error.message : String(error) };
  }
}

async function readRecentMiners(url, head) {
  const miners = [];
  const from = Math.max(0, head - sampleBlocks + 1);
  for (let blockNumber = head; blockNumber >= from; blockNumber -= 1) {
    const block = await optionalRpcCall(url, "eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
    if (block && typeof block === "object" && "miner" in block && typeof block.miner === "string") {
      miners.push(block.miner.toLowerCase());
    }
  }
  return [...new Set(miners)];
}

async function readBlockHash(url, blockNumber) {
  const block = await optionalRpcCall(url, "eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
  if (block && typeof block === "object" && "hash" in block && typeof block.hash === "string") {
    return block.hash.toLowerCase();
  }
  return undefined;
}

async function inspectEndpoint(url) {
  const [chainId, genesisBlock, headHex, peerHex, hashrateHex, mining, miningStatus] = await Promise.all([
    rpcCall(url, "eth_chainId"),
    rpcCall(url, "eth_getBlockByNumber", ["0x0", false]),
    rpcCall(url, "eth_blockNumber"),
    optionalRpcCall(url, "net_peerCount"),
    optionalRpcCall(url, "eth_hashrate"),
    optionalRpcCall(url, "eth_mining"),
    optionalRpcCall(url, "qubitor_getMiningStatus"),
  ]);
  const blockNumber = hexToNumber(headHex);
  if (blockNumber === undefined) throw new Error(`${url} returned invalid eth_blockNumber`);
  const recentMiners = await readRecentMiners(url, blockNumber);
  return {
    url,
    chainId: String(chainId).toLowerCase(),
    genesisHash: String(genesisBlock?.hash || "").toLowerCase(),
    blockNumber,
    peerCount: typeof peerHex === "string" ? hexToNumber(peerHex) : undefined,
    hashrate: typeof hashrateHex === "string" ? hexToBigInt(hashrateHex)?.toString() : undefined,
    mining,
    miningStatus,
    recentMinerCount: recentMiners.length,
    recentMiners,
  };
}

const failures = [];
const warnings = [];
const endpoints = [];

for (const url of rpcUrls) {
  try {
    endpoints.push(await inspectEndpoint(url));
  } catch (error) {
    failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (endpoints.length > 0) {
  const highest = Math.max(...endpoints.map((endpoint) => endpoint.blockNumber));
  const lowest = Math.min(...endpoints.map((endpoint) => endpoint.blockNumber));
  const sampleBlock = Math.max(0, lowest - finalityDepth);
  const allMiners = new Set(endpoints.flatMap((endpoint) => endpoint.recentMiners));
  for (const endpoint of endpoints) {
    endpoint.heightLag = highest - endpoint.blockNumber;
    if (endpoint.chainId !== expectedChainId) {
      failures.push(`${endpoint.url}: chain id ${endpoint.chainId} does not match ${expectedChainId}`);
    }
    if (endpoint.genesisHash !== expectedGenesisHash) {
      failures.push(`${endpoint.url}: genesis hash ${endpoint.genesisHash} does not match ${expectedGenesisHash}`);
    }
    if (endpoint.heightLag > maxHeightLag) {
      failures.push(`${endpoint.url}: height lag ${endpoint.heightLag} exceeds ${maxHeightLag}`);
    }
    if ((endpoint.peerCount ?? 0) < minPeerCount) {
      failures.push(`${endpoint.url}: peer count ${endpoint.peerCount ?? 0} below ${minPeerCount}`);
    }
    if (endpoint.mining === true && (endpoint.peerCount ?? 0) < minPeerCount) {
      failures.push(`${endpoint.url}: mining while peer count ${endpoint.peerCount ?? 0} is below ${minPeerCount}`);
    }
    if (endpoint.recentMinerCount < minDistinctMiners) {
      warnings.push(`${endpoint.url}: only ${endpoint.recentMinerCount} recent miner(s) in ${sampleBlocks} blocks`);
    }
  }
  const hashSamples = [];
  for (const endpoint of endpoints) {
    hashSamples.push({ url: endpoint.url, blockNumber: sampleBlock, hash: await readBlockHash(endpoint.url, sampleBlock) });
  }
  const uniqueHashes = new Set(hashSamples.map((sample) => sample.hash).filter(Boolean));
  if (uniqueHashes.size !== 1) {
    failures.push(`public RPC block hash divergence at ${sampleBlock}: ${JSON.stringify(hashSamples)}`);
  }
  if (allMiners.size < minDistinctMiners) {
    failures.push(`aggregate recent miner count ${allMiners.size} below ${minDistinctMiners}`);
  }
}

const summary = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  policy: {
    sampleBlocks,
    minPeerCount,
    minDistinctMiners,
    maxHeightLag,
    finalityDepth,
    expectedChainId,
    expectedGenesisHash,
    warnOnly,
  },
  endpoints,
  warnings,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok && !warnOnly) process.exit(1);
