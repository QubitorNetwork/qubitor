#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const expected = {
  chainId: 91338,
  registry: "0x0000000000000000000000000000000000000301",
  guardianVerifier: "0x0000000000000000000000000000000000000302",
  nativeBridgeVault: "0x0000000000000000000000000000000000000303",
  bridgeAdmin: "0x7DeB434c79bD02A5E8AAA8f1929064f01aFC2aE9",
  initialNativeLiquidityWei: 1_000_000_000_000_000_000_000_000n,
  guardianGasBalanceWei: 1_000_000_000_000_000_000_000n,
  guardianOperationalGasWei: 1_000_000_000_000_000_000n,
};

function parseArgs(argv) {
  const args = {
    genesis: resolve(rootDir, "clients/qubitor-node/config/testnet/genesis.json"),
    deployments: resolve(rootDir, "contracts/deployments/testnet/deployments.json"),
    bridgeDeployments: resolve(rootDir, "contracts/deployments/testnet/bridge-deployments.json"),
    rpcUrl: process.env.QUBITOR_TESTNET_VERIFY_RPC_URL ?? process.env.QUBITOR_RPC_URL,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--genesis") args.genesis = resolve(argv[++i]);
    else if (arg.startsWith("--genesis=")) args.genesis = resolve(arg.slice("--genesis=".length));
    else if (arg === "--deployments") args.deployments = resolve(argv[++i]);
    else if (arg.startsWith("--deployments=")) args.deployments = resolve(arg.slice("--deployments=".length));
    else if (arg === "--bridge-deployments") args.bridgeDeployments = resolve(argv[++i]);
    else if (arg.startsWith("--bridge-deployments=")) args.bridgeDeployments = resolve(arg.slice("--bridge-deployments=".length));
    else if (arg === "--rpc") args.rpcUrl = argv[++i];
    else if (arg.startsWith("--rpc=")) args.rpcUrl = arg.slice("--rpc=".length);
    else throw new Error(`unsupported argument: ${arg}`);
  }
  return args;
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`missing file: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function allocKey(address) {
  return address.toLowerCase().replace(/^0x/, "");
}

function assertNonEmptyCode(genesis, name, address) {
  const alloc = genesis.alloc?.[allocKey(address)];
  if (!alloc) throw new Error(`genesis alloc missing ${name} at ${address}`);
  if (!alloc.code || alloc.code === "0x") throw new Error(`genesis alloc ${name} has empty code`);
  if (!alloc.storage || Object.keys(alloc.storage).length === 0) {
    throw new Error(`genesis alloc ${name} has no initialized storage`);
  }
}

function bigintFromGenesisQuantity(value) {
  if (!value) return 0n;
  return BigInt(value);
}

function sameAddress(a, b) {
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
}

function verifyFiles(args) {
  const genesis = readJson(args.genesis);
  const deployments = readJson(args.deployments);
  const bridgeDeployments = readJson(args.bridgeDeployments);

  if (genesis.config?.chainId !== expected.chainId) {
    throw new Error(`testnet genesis chainId must be ${expected.chainId}`);
  }
  assertNonEmptyCode(genesis, "QubitorBridgeMessageRegistry", expected.registry);
  assertNonEmptyCode(genesis, "QubitorBridgeGuardianVerifier", expected.guardianVerifier);
  assertNonEmptyCode(genesis, "QubitorNativeBridgeVault", expected.nativeBridgeVault);
  const nativeVaultAlloc = genesis.alloc?.[allocKey(expected.nativeBridgeVault)];
  if (bigintFromGenesisQuantity(nativeVaultAlloc?.balance) < expected.initialNativeLiquidityWei) {
    throw new Error("genesis native bridge vault liquidity is below expected testnet seed");
  }
  const guardianAlloc = genesis.alloc?.[allocKey(expected.bridgeAdmin)];
  if (bigintFromGenesisQuantity(guardianAlloc?.balance) < expected.guardianGasBalanceWei) {
    throw new Error("genesis PQ bridge guardian gas balance is below expected testnet seed");
  }

  const metadata = deployments.qubitorNativeBridge;
  if (!metadata) throw new Error("deployments.json is missing qubitorNativeBridge metadata");
  if (!sameAddress(metadata.registry, expected.registry)) throw new Error("deployments registry mismatch");
  if (!sameAddress(metadata.guardianVerifier, expected.guardianVerifier)) {
    throw new Error("deployments guardian verifier mismatch");
  }
  if (!sameAddress(metadata.nativeBridgeVault, expected.nativeBridgeVault)) {
    throw new Error("deployments native bridge vault mismatch");
  }
  if (!sameAddress(metadata.bridgeAdmin, expected.bridgeAdmin)) throw new Error("deployments bridge admin mismatch");
  if (BigInt(metadata.initialNativeLiquidityWei ?? 0) !== expected.initialNativeLiquidityWei) {
    throw new Error("deployments initial native liquidity mismatch");
  }
  if (BigInt(metadata.guardianGasBalanceWei ?? 0) !== expected.guardianGasBalanceWei) {
    throw new Error("deployments guardian gas balance mismatch");
  }

  const bridgeContracts = bridgeDeployments.qubitorBridgeContracts;
  if (!bridgeContracts) throw new Error("bridge-deployments.json missing qubitorBridgeContracts");
  if (!sameAddress(bridgeContracts.registry, expected.registry)) throw new Error("bridge registry mismatch");
  if (!sameAddress(bridgeContracts.guardianVerifier, expected.guardianVerifier)) {
    throw new Error("bridge guardian verifier mismatch");
  }
  if (!sameAddress(bridgeContracts.nativeBridgeVault, expected.nativeBridgeVault)) {
    throw new Error("bridge native vault mismatch");
  }
  if (!sameAddress(bridgeDeployments.bridgeAdmin, expected.bridgeAdmin)) {
    throw new Error("bridge admin mismatch");
  }
  if (BigInt(bridgeDeployments.config?.initialNativeLiquidityWei ?? 0) !== expected.initialNativeLiquidityWei) {
    throw new Error("bridge-deployments initial native liquidity mismatch");
  }
  if (BigInt(bridgeDeployments.config?.guardianGasBalanceWei ?? 0) !== expected.guardianGasBalanceWei) {
    throw new Error("bridge-deployments guardian gas balance mismatch");
  }
}

async function rpcCall(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`${method}: ${payload.error.message ?? JSON.stringify(payload.error)}`);
  return payload.result;
}

async function verifyRpc(rpcUrl) {
  if (!rpcUrl) return;
  const chainId = await rpcCall(rpcUrl, "eth_chainId");
  if (BigInt(chainId) !== BigInt(expected.chainId)) throw new Error(`RPC chainId mismatch: ${chainId}`);
  for (const [name, address] of [
    ["registry", expected.registry],
    ["guardianVerifier", expected.guardianVerifier],
    ["nativeBridgeVault", expected.nativeBridgeVault],
  ]) {
    const code = await rpcCall(rpcUrl, "eth_getCode", [address, "latest"]);
    if (!code || code === "0x") throw new Error(`RPC ${name} code is empty at ${address}`);
  }
  const nativeVaultBalance = await rpcCall(rpcUrl, "eth_getBalance", [expected.nativeBridgeVault, "latest"]);
  if (BigInt(nativeVaultBalance) < expected.initialNativeLiquidityWei) {
    throw new Error("RPC native bridge vault liquidity is below expected testnet seed");
  }
  const guardianBalance = await rpcCall(rpcUrl, "eth_getBalance", [expected.bridgeAdmin, "latest"]);
  if (BigInt(guardianBalance) < expected.guardianOperationalGasWei) {
    throw new Error("RPC PQ bridge guardian gas balance is below operational minimum");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  verifyFiles(args);
  await verifyRpc(args.rpcUrl);
  console.log("[qubitor-testnet-bridge-genesis] ok");
}

main().catch((error) => {
  console.error(`[qubitor-testnet-bridge-genesis] ${error.message}`);
  process.exit(1);
});
