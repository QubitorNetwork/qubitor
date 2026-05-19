import http from "node:http";
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http as viemHttp,
  isAddress,
  keccak256,
  parseAbi,
  type Hex,
} from "viem";
import {
  QUBITOR_ACCOUNT_FACTORY,
  defaultQubitorExecutionRpcUrl,
  getConfiguredQubitorNetwork,
  getQubitorNetworkName,
} from "@qubitor/chain-config";
import {
  QUBITOR_DEVNET_PQ_SEED,
  QUBITOR_ZERO_HASH,
  deriveQubitorPQAccountAddress,
  generateMLDSA65KeyPair,
  sendRawQubitorPQTxV1,
  signQubitorPQTxV1,
} from "@qubitor/pq-native-tx";
import { renderFaucetPage } from "./faucet-page.js";

const port = Number(process.env.QUBITOR_FAUCET_PORT ?? 18546);
const networkName = getQubitorNetworkName();
const network = getConfiguredQubitorNetwork(networkName);
const rpcUrl = process.env.QUBITOR_RPC_URL ?? defaultQubitorExecutionRpcUrl(network);
const treasuryMode = process.env.QUBITOR_FAUCET_TREASURY_MODE ?? "pq-native-devnet";
const treasuryVaultAddress = process.env.QUBITOR_FAUCET_TREASURY_VAULT;
const faucetPQSeed = (process.env.QUBITOR_FAUCET_PQ_SEED ?? QUBITOR_DEVNET_PQ_SEED) as Hex;
const faucetPQSalt = (process.env.QUBITOR_FAUCET_PQ_SALT ?? QUBITOR_ZERO_HASH) as Hex;
const amountWei = BigInt(process.env.QUBITOR_FAUCET_AMOUNT_WEI ?? "10000000000000000000");
const faucetGas = BigInt(process.env.QUBITOR_FAUCET_PQ_GAS ?? "30000");
const accountDeployGas = BigInt(process.env.QUBITOR_FAUCET_ACCOUNT_DEPLOY_GAS ?? "3500000");
const gasTipCap = BigInt(process.env.QUBITOR_FAUCET_PQ_GAS_TIP_CAP_WEI ?? "1000000000");
const gasFeeCap = BigInt(process.env.QUBITOR_FAUCET_PQ_GAS_FEE_CAP_WEI ?? "2000000000");
const waitForReceipt = process.env.QUBITOR_FAUCET_WAIT_FOR_RECEIPT !== "0";

if (networkName !== "devnet") {
  if (faucetPQSeed.toLowerCase() === QUBITOR_DEVNET_PQ_SEED) {
    throw new Error(`${networkName} faucet refuses the deterministic devnet PQ seed`);
  }
  if (!treasuryVaultAddress || !isAddress(treasuryVaultAddress)) {
    throw new Error(`${networkName} faucet requires QUBITOR_FAUCET_TREASURY_VAULT controlled by PQ policy`);
  }
}

const chain = {
  id: network.chainId,
  name: network.name,
  nativeCurrency: network.nativeCurrency,
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
} as const;

const faucetKeypair = generateMLDSA65KeyPair(faucetPQSeed);
const faucetAddress = deriveQubitorPQAccountAddress(faucetKeypair.publicKey, faucetPQSalt);
const publicClient = createPublicClient({ chain, transport: viemHttp(rpcUrl) });
const accountFactoryAbi = parseAbi(["function createAccount(bytes32 salt,bytes pqPublicKey) returns (address)"]);

const history = new Map<string, Array<{ hash: Hex; amountWei: string; createdAt: string; blockNumber?: string }>>();
const recentClaims = new Map<string, number>();
const claimWindowMs = 60_000;
let faucetSubmissionQueue = Promise.resolve();

interface FaucetClaimRequest {
  address?: Hex;
  publicKey?: Hex;
  salt?: Hex;
  deployAccount?: boolean;
}

interface FaucetSubmissionResult {
  hash: Hex;
  blockNumber?: string;
  deploymentTransactionHash?: Hex;
  deploymentBlockNumber?: string;
  deployed?: boolean;
}

function enqueueFaucetSubmission<T>(action: () => Promise<T>): Promise<T> {
  const queued = faucetSubmissionQueue.then(action, action);
  faucetSubmissionQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload, (_, value) => (typeof value === "bigint" ? value.toString() : value)));
}

function sendHtml(response: http.ServerResponse, status: number, html: string, method = "GET") {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(method === "HEAD" ? undefined : html);
}

function readBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function handleClaim(body: FaucetClaimRequest, response: http.ServerResponse) {
  if (!body.address || !isAddress(body.address)) {
    sendJson(response, 400, { error: "valid 0x address required" });
    return;
  }

  const salt = body.salt ?? QUBITOR_ZERO_HASH;
  let requestedAccountAddress: Hex | undefined;
  if (body.deployAccount || body.publicKey) {
    if (!body.publicKey) {
      sendJson(response, 400, { error: "publicKey is required when deployAccount is true" });
      return;
    }
    requestedAccountAddress = deriveQubitorPQAccountAddress(body.publicKey, salt);
    if (getAddress(body.address) !== requestedAccountAddress) {
      sendJson(response, 400, {
        error: "address must match publicKey/salt Qubitor Account derivation",
        derivedAddress: requestedAccountAddress,
      });
      return;
    }
  }

  const now = Date.now();
  const normalizedAddress = getAddress(body.address) as Hex;
  const lastClaim = recentClaims.get(normalizedAddress.toLowerCase()) ?? 0;
  if (now - lastClaim < claimWindowMs) {
    sendJson(response, 429, { error: "rate limited", retryAfterMs: claimWindowMs - (now - lastClaim) });
    return;
  }

  const { hash, blockNumber, deploymentTransactionHash, deploymentBlockNumber, deployed } = await enqueueFaucetSubmission(async (): Promise<FaucetSubmissionResult> => {
    let nonce = await publicClient.getTransactionCount({ address: faucetAddress });
    const signed = signQubitorPQTxV1({
      chainId: network.chainId,
      nonce,
      gasTipCap,
      gasFeeCap,
      gas: faucetGas,
      factorySalt: faucetPQSalt,
      to: normalizedAddress,
      value: amountWei,
      data: "0x",
      pqPublicKey: faucetKeypair.publicKey,
      pqPrivateKey: faucetKeypair.privateKey,
    });
    const transactionHash = await sendRawQubitorPQTxV1(signed.rawTransaction, { rpcUrl });
    if (!waitForReceipt) return { hash: transactionHash, blockNumber: undefined };

    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") throw new Error(`native PQ faucet transfer reverted: ${transactionHash}`);
    let deploymentResult: Pick<
      FaucetSubmissionResult,
      "deploymentTransactionHash" | "deploymentBlockNumber" | "deployed"
    > = {};

    if (body.deployAccount && body.publicKey) {
      const existingCode = await publicClient.getCode({ address: normalizedAddress });
      if (existingCode && existingCode !== "0x") {
        deploymentResult = { deployed: true };
      } else {
        nonce += 1;
        const deploymentData = encodeFunctionData({
          abi: accountFactoryAbi,
          functionName: "createAccount",
          args: [salt, body.publicKey],
        });
        const deploymentSigned = signQubitorPQTxV1({
          chainId: network.chainId,
          nonce,
          gasTipCap,
          gasFeeCap,
          gas: accountDeployGas,
          factorySalt: faucetPQSalt,
          to: QUBITOR_ACCOUNT_FACTORY,
          value: 0n,
          data: deploymentData,
          pqPublicKey: faucetKeypair.publicKey,
          pqPrivateKey: faucetKeypair.privateKey,
        });
        const deployHash = await sendRawQubitorPQTxV1(deploymentSigned.rawTransaction, { rpcUrl });
        const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
        if (deployReceipt.status !== "success") throw new Error(`native PQ account deployment reverted: ${deployHash}`);
        deploymentResult = {
          deploymentTransactionHash: deployHash,
          deploymentBlockNumber: deployReceipt.blockNumber.toString(),
          deployed: true,
        };
      }
    }

    return { hash: transactionHash, blockNumber: receipt.blockNumber.toString(), ...deploymentResult };
  });

  recentClaims.set(normalizedAddress.toLowerCase(), now);
  const entry = { hash, amountWei: amountWei.toString(), createdAt: new Date(now).toISOString(), blockNumber };
  history.set(normalizedAddress.toLowerCase(), [...(history.get(normalizedAddress.toLowerCase()) ?? []), entry]);
  const explorerUrl = network.blockExplorerUrls[0] ? `${network.blockExplorerUrls[0]}/tx/${hash}` : undefined;
  sendJson(response, 200, {
    ok: true,
    address: normalizedAddress,
    faucetAddress,
    signerMode: "PQ Native",
    rawTransactionType: "QubitorPQTxV1",
    ...entry,
    deploymentTransactionHash,
    deploymentBlockNumber,
    deployed,
    accountFactory: body.deployAccount ? QUBITOR_ACCOUNT_FACTORY : undefined,
    explorerUrl,
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = requestUrl.pathname;

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && (pathname === "/faucet" || pathname === "/faucet/")) {
    sendHtml(
      response,
      200,
      renderFaucetPage({
        networkName: network.name,
        chainId: network.chainId,
        rpcUrl,
        explorerUrl: network.blockExplorerUrls[0],
        faucetAddress,
        amountWei,
        claimWindowMs,
      }),
      request.method,
    );
    return;
  }

  if (request.method === "GET" && pathname === "/faucet/status") {
    void (async () => {
      const [balance, blockNumber] = await Promise.all([
        publicClient.getBalance({ address: faucetAddress }),
        publicClient.getBlockNumber().catch(() => 0n),
      ]);
      sendJson(response, 200, {
        ok: true,
        network: networkName,
        controlSurface: "pq-native-faucet-treasury",
        signerMode: "PQ Native",
        devnetCompatibilityOnly: faucetPQSeed.toLowerCase() === QUBITOR_DEVNET_PQ_SEED,
        accountControl: "Native QubitorPQTxV1 ML-DSA-65 authorization",
        treasuryControl: {
          mode: treasuryMode,
          vaultAddress: treasuryVaultAddress && isAddress(treasuryVaultAddress) ? treasuryVaultAddress : undefined,
          hotWalletOnly: false,
          productionRequirement: "Use a non-devnet ML-DSA seed in a hardened signer or stricter PQ policy for public networks.",
        },
        faucetAddress,
        publicKeyCommitment: keccak256(faucetKeypair.publicKey),
        factorySalt: faucetPQSalt,
        balanceWei: balance,
        blockNumber,
        amountWei,
        claimWindowMs,
        chainId: network.chainId,
      });
    })();
    return;
  }

  if (request.method === "GET" && pathname.startsWith("/faucet/history/")) {
    const address = decodeURIComponent(pathname.split("/").pop() ?? "");
    sendJson(response, 200, { address, claims: history.get(address.toLowerCase()) ?? [] });
    return;
  }

  if (request.method === "POST" && pathname === "/faucet/request") {
    void (async () => {
      try {
        await handleClaim((await readBody(request)) as FaucetClaimRequest, response);
      } catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : "faucet request failed" });
      }
    })();
    return;
  }

  sendJson(response, 404, { error: "not found" });
});

server.listen(port, () => {
  console.log(`[qubitor-faucet] listening on http://127.0.0.1:${port} (${network.name}, PQ Native)`);
});
