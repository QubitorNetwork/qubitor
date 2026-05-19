import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  concatHex,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
  type Hex,
} from "viem";
import {
  QUBITOR_DEVNET_PQ_SEED,
  QUBITOR_PQ_ACCOUNT_DOMAIN,
  QUBITOR_ZERO_HASH,
  bytesToHex,
  deriveQubitorPQAccountAddress,
  generateMLDSA65KeyPair,
  jsonRpc,
  signMLDSA65,
  signQubitorPQTxV1,
} from "@qubitor/pq-native-tx";

interface RpcReceipt {
  blockNumber?: Hex;
  contractAddress?: Hex | null;
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

const rpcUrl = env("QUBITOR_RPC_URL", "http://127.0.0.1:8545")!;
const faucetUrl = env("QUBITOR_FAUCET_URL", "http://127.0.0.1:18546")!;
const chainId = Number(env("QUBITOR_NETWORK_ID", env("QUBITOR_PUBLIC_TESTNET_CHAIN_ID", "91338")));
const faucetSeed = mustEnv("QUBITOR_FAUCET_PQ_SEED") as Hex;
const adminSeed = (env("QUBITOR_ADMIN_PQ_SEED") as Hex | undefined) ?? bytesToHex(randomBytes(32));
const artifactDir = env("QUBITOR_ADMIN_EVIDENCE_DIR", "artifacts/testnet/admin-evidence")!;
const artifactFile = repoPath(
  env(
    "QUBITOR_ADMIN_EVIDENCE_FILE",
    path.join(artifactDir, `${new Date().toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 16)}.json`),
  )!,
);

if (faucetSeed.toLowerCase() === QUBITOR_DEVNET_PQ_SEED) {
  throw new Error("Refusing to run testnet admin evidence with the deterministic devnet PQ seed.");
}

const chain = {
  id: chainId,
  name: "Qubitor Testnet",
  nativeCurrency: { name: "Qubitor", symbol: "QBT", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
} as const;

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const accountAbi = parseAbi([
  "function nonce() view returns (uint256)",
  "function executeMessage(uint256 nonce,address target,uint256 value,bytes data) view returns (bytes)",
  "function executePQ(address target,uint256 value,bytes data,uint256 nonce,bytes signature)",
]);
const vaultAbi = parseAbi([
  "function recordPolicy(bytes32 key,bytes32 value) returns (uint256)",
  "function transferTreasury(address target,uint256 value)",
]);

function requireHex(value: string, label: string): Hex {
  if (!/^0x[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new Error(`${label} must be 0x-prefixed even-length hex`);
  }
  return value as Hex;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `${url} failed with ${response.status}`);
  return payload;
}

async function waitReceipt(hash: Hex): Promise<RpcReceipt> {
  for (let attempt = 0; attempt < 90; attempt++) {
    const receipt = await jsonRpc<RpcReceipt | null>(rpcUrl, "eth_getTransactionReceipt", [hash]);
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error(`transaction reverted: ${hash}`);
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`timed out waiting for receipt ${hash}`);
}

async function sendSignedRaw(rawTransaction: Hex): Promise<RpcReceipt> {
  const hash = await jsonRpc<Hex>(rpcUrl, "qubitor_sendRawPQTransaction", [rawTransaction]);
  return waitReceipt(hash);
}

async function nativeNonce(address: Hex): Promise<bigint> {
  const nonceHex = await jsonRpc<Hex>(rpcUrl, "eth_getTransactionCount", [address, "latest"]);
  return BigInt(nonceHex);
}

async function deployVault(adminAccount: Hex, faucetKeypair: ReturnType<typeof generateMLDSA65KeyPair>) {
  const artifact = JSON.parse(
    readFileSync(path.join(rootDir, "contracts/out/QubitorAdminVault.sol/QubitorAdminVault.json"), "utf8"),
  ) as { bytecode?: { object?: string } };
  const bytecode = requireHex(artifact.bytecode?.object ?? "", "QubitorAdminVault bytecode");
  const constructorArgs = encodeAbiParameters([{ type: "address" }], [adminAccount]);
  const initCode = concatHex([bytecode, constructorArgs]);
  const faucetAddress = getAddress(deriveQubitorPQAccountAddress(faucetKeypair.publicKey, QUBITOR_ZERO_HASH)) as Hex;
  const signed = signQubitorPQTxV1({
    chainId,
    nonce: await nativeNonce(faucetAddress),
    gasTipCap: 1_000_000_000n,
    gasFeeCap: 2_000_000_000n,
    gas: 3_500_000n,
    factorySalt: QUBITOR_ZERO_HASH,
    value: 10_000_000_000_000_000n,
    data: initCode,
    pqPublicKey: faucetKeypair.publicKey,
    pqPrivateKey: faucetKeypair.privateKey,
  });
  const receipt = await sendSignedRaw(signed.rawTransaction);
  if (!receipt.contractAddress) throw new Error("admin vault deployment receipt did not include contractAddress");
  return { receipt, vault: getAddress(receipt.contractAddress) as Hex };
}

async function executeThroughAdminAccount(params: {
  adminKeypair: ReturnType<typeof generateMLDSA65KeyPair>;
  adminAccount: Hex;
  target: Hex;
  data: Hex;
  value?: bigint;
}) {
  const smartNonce = (await publicClient.readContract({
    address: params.adminAccount,
    abi: accountAbi,
    functionName: "nonce",
  })) as bigint;
  const message = (await publicClient.readContract({
    address: params.adminAccount,
    abi: accountAbi,
    functionName: "executeMessage",
    args: [smartNonce, params.target, params.value ?? 0n, params.data],
  })) as Hex;
  const signature = signMLDSA65(message, params.adminKeypair.privateKey, { context: QUBITOR_PQ_ACCOUNT_DOMAIN });
  const executeData = encodeFunctionData({
    abi: accountAbi,
    functionName: "executePQ",
    args: [params.target, params.value ?? 0n, params.data, smartNonce, signature],
  });
  const signed = signQubitorPQTxV1({
    chainId,
    nonce: await nativeNonce(params.adminAccount),
    gasTipCap: 1_000_000_000n,
    gasFeeCap: 2_000_000_000n,
    gas: 1_500_000n,
    factorySalt: QUBITOR_ZERO_HASH,
    to: params.adminAccount,
    value: 0n,
    data: executeData,
    pqPublicKey: params.adminKeypair.publicKey,
    pqPrivateKey: params.adminKeypair.privateKey,
  });
  return sendSignedRaw(signed.rawTransaction);
}

async function main() {
  const adminKeypair = generateMLDSA65KeyPair(adminSeed);
  const faucetKeypair = generateMLDSA65KeyPair(faucetSeed);
  const adminAccount = getAddress(deriveQubitorPQAccountAddress(adminKeypair.publicKey, QUBITOR_ZERO_HASH)) as Hex;

  await postJson(`${faucetUrl}/faucet/request`, {
    address: adminAccount,
    publicKey: adminKeypair.publicKey,
    salt: QUBITOR_ZERO_HASH,
    deployAccount: true,
  });

  const deployedCode = await jsonRpc<Hex>(rpcUrl, "eth_getCode", [adminAccount, "latest"]);
  if (!deployedCode || deployedCode === "0x") throw new Error(`admin Qubitor Account was not deployed: ${adminAccount}`);

  const { receipt: vaultDeployReceipt, vault } = await deployVault(adminAccount, faucetKeypair);
  const policyKey = keccak256("0x71756269746f722d746573746e65742d706f6c696379" as Hex);
  const policyValue = keccak256("0x70712d6e61746976652d61646d696e" as Hex);
  const policyData = encodeFunctionData({
    abi: vaultAbi,
    functionName: "recordPolicy",
    args: [policyKey, policyValue],
  });
  const policyReceipt = await executeThroughAdminAccount({
    adminKeypair,
    adminAccount,
    target: vault,
    data: policyData,
  });

  const treasuryTarget = "0x000000000000000000000000000000000000adad" as Hex;
  const transferData = encodeFunctionData({
    abi: vaultAbi,
    functionName: "transferTreasury",
    args: [treasuryTarget, 12_345n],
  });
  const transferReceipt = await executeThroughAdminAccount({
    adminKeypair,
    adminAccount,
    target: vault,
    data: transferData,
  });

  mkdirSync(path.dirname(artifactFile), { recursive: true });
  writeFileSync(
    artifactFile,
    JSON.stringify(
      {
        warning: "PRIVATE TESTNET ADMIN MATERIAL. The adminSeed controls the Qubitor admin account used for this evidence.",
        chainId,
        rpcUrl,
        adminSeed,
        adminPublicKey: adminKeypair.publicKey,
        adminAccount,
        vault,
        vaultDeployTransactionHash: vaultDeployReceipt.transactionHash,
        policyTransactionHash: policyReceipt.transactionHash,
        transferTransactionHash: transferReceipt.transactionHash,
        treasuryTarget,
      },
      null,
      2,
    ),
  );

  console.log(`[qubitor-pq-admin-evidence] admin account ${adminAccount}`);
  console.log(`[qubitor-pq-admin-evidence] vault ${vault}`);
  console.log(`[qubitor-pq-admin-evidence] deploy tx ${vaultDeployReceipt.transactionHash}`);
  console.log(`[qubitor-pq-admin-evidence] policy tx ${policyReceipt.transactionHash}`);
  console.log(`[qubitor-pq-admin-evidence] transfer tx ${transferReceipt.transactionHash}`);
  console.log(`[qubitor-pq-admin-evidence] private material ${artifactFile}`);
  console.log("[qubitor-pq-admin-evidence] ok");
}

main().catch((error) => {
  console.error(`[qubitor-pq-admin-evidence] ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
});
