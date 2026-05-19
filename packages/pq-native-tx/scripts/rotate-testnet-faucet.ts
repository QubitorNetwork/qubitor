import { randomBytes } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, type Hex } from "viem";
import {
  QUBITOR_DEVNET_PQ_SEED,
  QUBITOR_ZERO_HASH,
  bytesToHex,
  deriveQubitorPQAccountAddress,
  generateMLDSA65KeyPair,
  jsonRpc,
  signQubitorPQTxV1,
} from "@qubitor/pq-native-tx";

interface RpcReceipt {
  blockNumber?: Hex;
  status?: Hex;
  transactionHash?: Hex;
}

const env = (name: string, fallback?: string) => process.env[name] ?? fallback;
const mustEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const repoPath = (value: string) => (path.isAbsolute(value) ? value : path.join(rootDir, value));
const timestamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 16);

const rpcUrl = env("QUBITOR_RPC_URL", "http://127.0.0.1:8545")!;
const oldSeed = mustEnv("QUBITOR_FAUCET_PQ_SEED") as Hex;
const salt = (env("QUBITOR_FAUCET_PQ_SALT", QUBITOR_ZERO_HASH) ?? QUBITOR_ZERO_HASH) as Hex;
const gas = BigInt(env("QUBITOR_FAUCET_ROTATE_GAS", "30000")!);
const gasTipCap = BigInt(env("QUBITOR_FAUCET_ROTATE_GAS_TIP_CAP_WEI", "1000000000")!);
const gasFeeCap = BigInt(env("QUBITOR_FAUCET_ROTATE_GAS_FEE_CAP_WEI", "2000000000")!);
const reserveWei = BigInt(env("QUBITOR_FAUCET_ROTATE_OLD_RESERVE_WEI", "10000000000000000")!);
const artifactFile = repoPath(
  env("QUBITOR_FAUCET_ROTATION_FILE", `artifacts/testnet/rotations/faucet-${timestamp}.json`)!,
);
const envFile = env("QUBITOR_ROTATE_ENV_FILE");
const serviceKeysFile = env("QUBITOR_ROTATE_PQ_SERVICE_KEYS_FILE");

if (oldSeed.toLowerCase() === QUBITOR_DEVNET_PQ_SEED) {
  throw new Error("Refusing to rotate a public testnet faucet from the deterministic devnet PQ seed.");
}

function parseHexQuantity(value: Hex): bigint {
  return BigInt(value);
}

function setEnvValue(content: string, name: string, value: string): string {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  const suffix = content.endsWith("\n") ? "" : "\n";
  return `${content}${suffix}${line}\n`;
}

function backupFile(file: string) {
  const backup = `${file}.bak-${timestamp}`;
  copyFileSync(file, backup);
  chmodSync(backup, 0o600);
  return backup;
}

function patchEnvFile(file: string, nextAddress: Hex, nextSeed: Hex) {
  const resolved = repoPath(file);
  backupFile(resolved);
  let content = readFileSync(resolved, "utf8");
  content = setEnvValue(content, "QUBITOR_FAUCET_ADDRESS", nextAddress);
  content = setEnvValue(content, "QUBITOR_FAUCET_PQ_SEED", nextSeed);
  content = setEnvValue(content, "QUBITOR_MINER_ETHERBASE", nextAddress);
  content = setEnvValue(content, "QUBITOR_FAUCET_TREASURY_VAULT", nextAddress);
  writeFileSync(resolved, content);
  chmodSync(resolved, 0o600);
}

function patchServiceKeysFile(file: string, nextAddress: Hex, nextSeed: Hex, nextPublicKey: Hex) {
  const resolved = repoPath(file);
  backupFile(resolved);
  const keys = JSON.parse(readFileSync(resolved, "utf8")) as Record<string, unknown>;
  const faucetTreasury = {
    label: "faucet-treasury-and-miner-rewards",
    seed: nextSeed,
    publicKey: nextPublicKey,
    address: nextAddress,
    salt,
  };
  keys.faucetTreasury = faucetTreasury;
  keys.minerRewards = {
    ...faucetTreasury,
    label: "miner-rewards-same-as-faucet-treasury",
    note: "Public testnet mines directly to the PQ faucet treasury so no EOA bootstrap transfer is needed.",
  };
  writeFileSync(resolved, `${JSON.stringify(keys, null, 2)}\n`);
  chmodSync(resolved, 0o600);
}

async function waitReceipt(hash: Hex): Promise<RpcReceipt> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const receipt = await jsonRpc<RpcReceipt | null>(rpcUrl, "eth_getTransactionReceipt", [hash]);
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error(`rotation funding transaction reverted: ${hash}`);
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timed out waiting for rotation funding receipt ${hash}`);
}

async function main() {
  const chainId = parseHexQuantity(await jsonRpc<Hex>(rpcUrl, "eth_chainId", []));
  if (chainId !== 91338n) {
    throw new Error(`Refusing to rotate faucet on unexpected chain ID ${chainId.toString()}; expected 91338.`);
  }

  const oldKeypair = generateMLDSA65KeyPair(oldSeed);
  const oldAddress = getAddress(deriveQubitorPQAccountAddress(oldKeypair.publicKey, salt)) as Hex;
  const newSeed = bytesToHex(randomBytes(32));
  const newKeypair = generateMLDSA65KeyPair(newSeed);
  const newAddress = getAddress(deriveQubitorPQAccountAddress(newKeypair.publicKey, salt)) as Hex;
  const oldBalance = parseHexQuantity(await jsonRpc<Hex>(rpcUrl, "eth_getBalance", [oldAddress, "latest"]));
  const maxFee = gas * gasFeeCap;
  const requestedValue = env("QUBITOR_FAUCET_ROTATE_VALUE_WEI");
  const value = requestedValue ? BigInt(requestedValue) : oldBalance - maxFee - reserveWei;

  if (value <= 0n) {
    throw new Error(`old faucet balance ${oldBalance.toString()} is too low to rotate after fee/reserve.`);
  }
  if (value + maxFee > oldBalance) {
    throw new Error("rotation transfer value plus max fee exceeds old faucet balance.");
  }

  const nonce = parseHexQuantity(await jsonRpc<Hex>(rpcUrl, "eth_getTransactionCount", [oldAddress, "latest"]));
  const signed = signQubitorPQTxV1({
    chainId,
    nonce,
    gasTipCap,
    gasFeeCap,
    gas,
    factorySalt: salt,
    to: newAddress,
    value,
    data: "0x",
    pqPublicKey: oldKeypair.publicKey,
    pqPrivateKey: oldKeypair.privateKey,
  });
  const fundingTransactionHash = await jsonRpc<Hex>(rpcUrl, "qubitor_sendRawPQTransaction", [signed.rawTransaction]);
  const receipt = await waitReceipt(fundingTransactionHash);

  mkdirSync(path.dirname(artifactFile), { recursive: true });
  writeFileSync(
    artifactFile,
    `${JSON.stringify(
      {
        warning: "PRIVATE TESTNET MATERIAL. newFaucetSeed controls the Qubitor testnet faucet/miner treasury.",
        rotatedAt: new Date().toISOString(),
        chainId: chainId.toString(),
        rpcUrl,
        salt,
        oldFaucetAddress: oldAddress,
        newFaucetAddress: newAddress,
        newFaucetSeed: newSeed,
        newFaucetPublicKey: newKeypair.publicKey,
        fundingTransactionHash,
        fundingBlockNumber: receipt.blockNumber ? parseHexQuantity(receipt.blockNumber).toString() : undefined,
        fundingValueWei: value.toString(),
      },
      null,
      2,
    )}\n`,
  );
  chmodSync(artifactFile, 0o600);

  if (envFile) patchEnvFile(envFile, newAddress, newSeed);
  if (serviceKeysFile) patchServiceKeysFile(serviceKeysFile, newAddress, newSeed, newKeypair.publicKey);

  console.log(
    JSON.stringify(
      {
        ok: true,
        oldFaucetAddress: oldAddress,
        newFaucetAddress: newAddress,
        fundingTransactionHash,
        fundingValueWei: value.toString(),
        artifactFile,
        envFileUpdated: Boolean(envFile),
        serviceKeysFileUpdated: Boolean(serviceKeysFile),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
