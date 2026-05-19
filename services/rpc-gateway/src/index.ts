import http from "node:http";
import { readFileSync } from "node:fs";
import {
  QUBITOR_MLDSA65_PRECOMPILE,
  defaultQubitorExecutionRpcUrl,
  getConfiguredQubitorNetwork,
  getQubitorNetworkName,
  qubitorAdminControlSurfaces,
} from "@qubitor/chain-config";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: unknown[];
}

interface JsonRpcError {
  code: number;
  message: string;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

const networkName = getQubitorNetworkName();
const network = getConfiguredQubitorNetwork(networkName);
const upstreamRpcUrl = process.env.QUBITOR_RPC_URL ?? defaultQubitorExecutionRpcUrl(network);
const port = Number(process.env.QUBITOR_RPC_GATEWAY_PORT ?? 18545);
const faucetStatusUrl =
  process.env.QUBITOR_FAUCET_STATUS_URL ?? `${network.faucetUrls[0] ?? "http://127.0.0.1:18546"}/faucet/status`;
const deploymentsFile =
  process.env.QUBITOR_DEPLOYMENTS_FILE ??
  new URL(`../../../contracts/deployments/${networkName}/deployments.json`, import.meta.url).pathname;

interface DevnetDeployments {
  securityModeRegistry?: string;
  accountReadinessRegistry?: string;
  qubitorAccountFactory?: string;
  mldsa65Precompile?: string;
}

interface ReadinessRecord {
  isQubitorAccount: boolean;
  securityMode: number;
  pqPublicKeyCommitment: string;
  lastKeyRotation: string;
  updatedAt: string;
}

interface FaucetStatus {
  ok?: boolean;
  controlSurface?: string;
  signerMode?: string;
  devnetCompatibilityOnly?: boolean;
  treasuryControl?: {
    mode?: string;
    vaultAddress?: string;
    hotWalletOnly?: boolean;
    productionRequirement?: string;
  };
  faucetAddress?: string;
  balanceWei?: string;
  amountWei?: string;
  claimWindowMs?: number;
}

const securityModeLabels = ["Legacy", "Smart Account Ready", "Hybrid Protected", "PQ Ready", "PQ Native"];

function rpcResult(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function callUpstream(method: string, params: unknown[] = []) {
  const response = await fetch(upstreamRpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = (await response.json()) as { result?: unknown; error?: JsonRpcError };
  if (payload.error) throw new Error(payload.error.message);
  return payload.result;
}

async function optionalUpstream(method: string, params: unknown[] = []) {
  try {
    return await callUpstream(method, params);
  } catch {
    return null;
  }
}

async function optionalJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function readDeployments(): DevnetDeployments | undefined {
  try {
    return JSON.parse(readFileSync(deploymentsFile, "utf8")) as DevnetDeployments;
  } catch {
    return {
      securityModeRegistry: network.contracts.securityModeRegistry,
      accountReadinessRegistry: network.contracts.accountReadinessRegistry,
      qubitorAccountFactory: network.contracts.accountFactory,
      mldsa65Precompile: network.contracts.mldsa65Precompile,
    };
  }
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function encodeAddressCall(selector: string, address: string): string {
  return `${selector}${address.slice(2).padStart(64, "0")}`;
}

async function ethCall(to: string, data: string) {
  const result = await optionalUpstream("eth_call", [{ to, data }, "latest"]);
  return typeof result === "string" && result.startsWith("0x") ? result : undefined;
}

function decodeWord(result: string, index: number): bigint | undefined {
  const start = 2 + index * 64;
  const word = result.slice(start, start + 64);
  if (word.length !== 64) return undefined;
  return BigInt(`0x${word}`);
}

function decodeBytes32(result: string, index: number): string | undefined {
  const start = 2 + index * 64;
  const word = result.slice(start, start + 64);
  return word.length === 64 ? `0x${word}` : undefined;
}

async function readSecurityMode(address: string): Promise<number | undefined> {
  const registry = readDeployments()?.securityModeRegistry;
  if (!isAddress(registry)) return undefined;
  const result = await ethCall(registry, encodeAddressCall("0xf7aebeaa", address));
  const mode = result ? decodeWord(result, 0) : undefined;
  return mode === undefined ? undefined : Number(mode);
}

async function readReadiness(address: string): Promise<ReadinessRecord | undefined> {
  const registry = readDeployments()?.accountReadinessRegistry;
  if (!isAddress(registry)) return undefined;
  const result = await ethCall(registry, encodeAddressCall("0x8f2e04f5", address));
  if (!result) return undefined;

  const isQubitorAccount = decodeWord(result, 0);
  const securityMode = decodeWord(result, 1);
  const pqPublicKeyCommitment = decodeBytes32(result, 2);
  const lastKeyRotation = decodeWord(result, 3);
  const updatedAt = decodeWord(result, 4);
  if (
    isQubitorAccount === undefined ||
    securityMode === undefined ||
    !pqPublicKeyCommitment ||
    lastKeyRotation === undefined ||
    updatedAt === undefined
  ) {
    return undefined;
  }

  return {
    isQubitorAccount: isQubitorAccount !== 0n,
    securityMode: Number(securityMode),
    pqPublicKeyCommitment,
    lastKeyRotation: lastKeyRotation.toString(),
    updatedAt: updatedAt.toString(),
  };
}

async function readNetworkSecurityStatus() {
  const [blockNumber, mining, hashrate, peerCount, faucet] = await Promise.all([
    optionalUpstream("eth_blockNumber"),
    optionalUpstream("eth_mining"),
    optionalUpstream("eth_hashrate"),
    optionalUpstream("net_peerCount"),
    optionalJson<FaucetStatus>(faucetStatusUrl),
  ]);

  return {
    profile: networkName,
    network: network.name,
    chainId: network.chainId,
    nativeCurrency: network.nativeCurrency,
    targetBlockTimeSeconds: network.targetBlockTimeSeconds,
    defaultAccountModel: "QubitorAccount",
    defaultSecurityMode: "PQ Native",
    pqRequired: true,
    ecdsaControl: false,
    exactClaim:
      "Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.",
    compatibilityBoundary:
      "Legacy Ethereum transaction types are disabled when QUBITOR_EOA_TXS=0; system contracts are installed at genesis and wallet flows use QubitorPQTxV1.",
    precompile: {
      name: "QBT_ML_DSA_65_VERIFY",
      address: QUBITOR_MLDSA65_PRECOMPILE,
      primitive: "ML-DSA-65",
    },
    deployments: readDeployments() ?? {},
    adminControlSurfaces: qubitorAdminControlSurfaces,
    mining: {
      blockNumber,
      mining,
      hashrate,
      peerCount,
    },
    faucet: faucet
      ? {
          ok: faucet.ok === true,
          controlSurface: faucet.controlSurface,
          signerMode: faucet.signerMode,
          devnetCompatibilityOnly: faucet.devnetCompatibilityOnly,
          faucetAddress: faucet.faucetAddress,
          balanceWei: faucet.balanceWei,
          amountWei: faucet.amountWei,
          claimWindowMs: faucet.claimWindowMs,
          treasuryControl: faucet.treasuryControl,
        }
      : {
          ok: false,
          statusUrl: faucetStatusUrl,
          unavailable: true,
        },
  };
}

async function handleQubitorMethod(request: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
  const params = request.params ?? [];

  switch (request.method) {
    case "qubitor_getMiningStatus": {
      const [blockNumber, mining, hashrate, peerCount] = await Promise.all([
        optionalUpstream("eth_blockNumber"),
        optionalUpstream("eth_mining"),
        optionalUpstream("eth_hashrate"),
        optionalUpstream("net_peerCount"),
      ]);
      return rpcResult(request.id, {
        profile: networkName,
        network: network.name,
        chainId: network.chainId,
        targetBlockTimeSeconds: network.targetBlockTimeSeconds,
        blockNumber,
        mining,
        hashrate,
        peerCount,
      });
    }
    case "qubitor_getDifficulty": {
      const block = await callUpstream("eth_getBlockByNumber", ["latest", false]);
      return rpcResult(request.id, (block as { difficulty?: unknown }).difficulty ?? null);
    }
    case "qubitor_getHashrate": {
      return rpcResult(request.id, await optionalUpstream("eth_hashrate"));
    }
    case "qubitor_getNetworkSecurityStatus": {
      return rpcResult(request.id, await readNetworkSecurityStatus());
    }
    case "qubitor_getSmartAccountDeploymentState": {
      const address = params[0];
      if (!isAddress(address)) {
        return rpcError(request.id, -32602, "address parameter required");
      }
      const code = await callUpstream("eth_getCode", [address, "latest"]);
      return rpcResult(request.id, {
        address,
        deployed: typeof code === "string" && code !== "0x",
        code,
      });
    }
    case "qubitor_getAccountSecurityMode": {
      const address = params[0];
      if (!isAddress(address)) {
        return rpcError(request.id, -32602, "address parameter required");
      }
      const code = await callUpstream("eth_getCode", [address, "latest"]);
      const deployed = typeof code === "string" && code !== "0x";
      const rawRegistryMode = await readSecurityMode(address);
      const registryMode = deployed || rawRegistryMode !== 0 ? rawRegistryMode : undefined;
      const mode = registryMode === undefined ? undefined : securityModeLabels[registryMode] ?? `Unknown (${registryMode})`;
      return rpcResult(request.id, {
        address,
        mode: mode ?? (deployed ? "PQ Native" : "PQ Native Pending Deployment"),
        registryMode,
        deployed,
        verifiedQubitorAccount: deployed || registryMode !== undefined,
        evidence:
          registryMode !== undefined
            ? "registry"
            : deployed
              ? "contract-code"
              : "counterfactual-assumed",
        legacyCompatibilityPossible: !deployed && registryMode === undefined,
        claim: "Default Qubitor Accounts require ML-DSA authorization; EOA transactions are compatibility-only.",
      });
    }
    case "qubitor_getAccountReadiness": {
      const address = params[0];
      if (!isAddress(address)) {
        return rpcError(request.id, -32602, "address parameter required");
      }
      const code = await callUpstream("eth_getCode", [address, "latest"]);
      const readiness = await readReadiness(address);
      const deployed = typeof code === "string" && code !== "0x";
      const hasReadiness = readiness?.isQubitorAccount === true;
      const registryMode = hasReadiness ? readiness.securityMode : undefined;
      return rpcResult(request.id, {
        address,
        accountType: hasReadiness || deployed ? "Qubitor Smart Account" : "Counterfactual Qubitor Account",
        deployed,
        verifiedQubitorAccount: hasReadiness || deployed,
        evidence: hasReadiness ? "readiness-registry" : deployed ? "contract-code" : "counterfactual-assumed",
        legacyCompatibilityPossible: !hasReadiness && !deployed,
        securityMode:
          registryMode === undefined
            ? deployed
              ? "PQ Native"
              : "PQ Native Pending Deployment"
            : securityModeLabels[registryMode] ?? `Unknown (${registryMode})`,
        registryMode,
        readiness: hasReadiness ? readiness : undefined,
        pqRequired: true,
        ecdsaControl: false,
      });
    }
    default:
      return undefined;
  }
}

async function handleRpc(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const qubitorResponse = await handleQubitorMethod(request);
  if (qubitorResponse) return qubitorResponse;

  const response = await fetch(upstreamRpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, jsonrpc: "2.0" }),
  });
  return (await response.json()) as JsonRpcResponse;
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload));
}

const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, network: networkName, upstreamRpcUrl, chainId: network.chainId });
    return;
  }

  if (request.method === "GET" && request.url === "/chain") {
    sendJson(response, 200, { network: networkName, ...network });
    return;
  }

  if (request.method !== "POST" || request.url !== "/rpc") {
    sendJson(response, 404, { error: "not found" });
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    void (async () => {
      try {
        const payload = JSON.parse(body) as JsonRpcRequest | JsonRpcRequest[];
        if (Array.isArray(payload)) {
          sendJson(response, 200, await Promise.all(payload.map(handleRpc)));
          return;
        }
        sendJson(response, 200, await handleRpc(payload));
      } catch (error) {
        sendJson(response, 200, rpcError(null, -32603, error instanceof Error ? error.message : "internal error"));
      }
    })();
  });
});

server.listen(port, () => {
  console.log(`[qubitor-rpc-gateway] listening on http://127.0.0.1:${port}`);
});
