import http from "node:http";
import { createPublicClient, formatEther, getAddress, http as viemHttp, keccak256, parseAbi, type Hex } from "viem";
import {
  defaultQubitorExecutionRpcUrl,
  getConfiguredQubitorNetwork,
  getQubitorNetworkName,
} from "@qubitor/chain-config";
import {
  QUBITOR_ZERO_HASH,
  deriveQubitorPQAccountAddress,
  sendRawQubitorPQTxV1,
} from "@qubitor/pq-native-tx";
import {
  parseAccountRequest,
  parseRawPQTransactionRequest,
  type AccountRequest,
  type RawPQTransactionRequest,
} from "./requests.js";

const port = Number(process.env.QUBITOR_PQ_RELAYER_PORT ?? 18548);
const networkName = getQubitorNetworkName();
const network = getConfiguredQubitorNetwork(networkName);
const rpcUrl = process.env.QUBITOR_RPC_URL ?? defaultQubitorExecutionRpcUrl(network);
const defaultSalt = (process.env.QUBITOR_PQ_DEV_SALT ?? QUBITOR_ZERO_HASH) as Hex;
const waitForReceiptDefault = process.env.QUBITOR_PQ_RELAYER_WAIT_FOR_RECEIPT !== "0";

const qubitorAccountAbi = parseAbi([
  "function nonce() view returns (uint256)",
  "function pqPublicKey() view returns (bytes)",
]);

const chain = {
  id: network.chainId,
  name: network.name,
  nativeCurrency: network.nativeCurrency,
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
} as const;

const publicClient = createPublicClient({ chain, transport: viemHttp(rpcUrl) });

function saltFor(request: Pick<AccountRequest, "salt">) {
  return request.salt ?? defaultSalt;
}

async function nativeNonce(address: Hex): Promise<string> {
  const nonce = await publicClient.getTransactionCount({ address });
  return nonce.toString();
}

async function smartAccountNonce(address: Hex): Promise<string | undefined> {
  try {
    const nonce = (await publicClient.readContract({
      address,
      abi: qubitorAccountAbi,
      functionName: "nonce",
    })) as bigint;
    return nonce.toString();
  } catch {
    return undefined;
  }
}

async function accountInfo(request: AccountRequest) {
  const salt = saltFor(request);
  const address = getAddress(deriveQubitorPQAccountAddress(request.publicKey, salt)) as Hex;
  const [code, balanceWei, latestBlock, transactionNonce, accountNonce] = await Promise.all([
    publicClient.getCode({ address }),
    publicClient.getBalance({ address }),
    publicClient.getBlockNumber(),
    nativeNonce(address),
    smartAccountNonce(address),
  ]);
  const deployed = Boolean(code && code !== "0x");

  return {
    ok: true,
    network: networkName,
    chainId: network.chainId,
    accountAddress: address,
    deployed,
    nonce: accountNonce ?? transactionNonce,
    nativeTransactionNonce: transactionNonce,
    smartAccountNonce: accountNonce,
    balanceWei: balanceWei.toString(),
    balanceQbt: formatEther(balanceWei),
    publicKey: request.publicKey,
    publicKeyCommitment: keccak256(request.publicKey),
    latestBlock: latestBlock.toString(),
    salt,
    signerMode: "PQ Native",
    rawTransactionType: "QubitorPQTxV1",
    relayerAddress: undefined,
    relayerBalanceWei: undefined,
  };
}

async function submitRawPQTransaction(request: RawPQTransactionRequest) {
  const hash = await sendRawQubitorPQTxV1(request.rawTransaction, { rpcUrl });
  const shouldWait = request.waitForReceipt ?? waitForReceiptDefault;
  if (!shouldWait) {
    return {
      ok: true,
      network: networkName,
      chainId: network.chainId,
      transactionHash: hash,
      status: "submitted",
      signerMode: "PQ Native",
      rawTransactionType: "QubitorPQTxV1",
    };
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`QubitorPQTxV1 reverted: ${hash}`);
  }
  return {
    ok: true,
    network: networkName,
    chainId: network.chainId,
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status,
    signerMode: "PQ Native",
    rawTransactionType: "QubitorPQTxV1",
  };
}

function disabledEOAEndpoint(name: string): never {
  throw new Error(
    `${name} no longer uses an EOA gas payer. Submit a wallet-signed raw QubitorPQTxV1 as { "rawTransaction": "0x04..." } to /pq-dev/send-raw.`,
  );
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

function readBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function handleErrors(response: http.ServerResponse, action: () => Promise<unknown>) {
  void action()
    .then((payload) => sendJson(response, 200, payload))
    .catch((error) => {
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "pq native request failed",
      });
    });
}

const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/pq-dev/status") {
    handleErrors(response, async () => ({
      ok: true,
      network: networkName,
      chainId: network.chainId,
      controlSurface: "pq-native-raw-transaction-gateway",
      signerMode: "PQ Native",
      accountControl: "Wallet signs QubitorPQTxV1 with ML-DSA-65; service only submits raw bytes.",
      relayerAddress: undefined,
      relayerBalanceWei: undefined,
      latestBlock: (await publicClient.getBlockNumber()).toString(),
      signingModel: "wallet-owned-ml-dsa",
      acceptedTransactionType: "0x04",
      legacyGasPayer: false,
    }));
    return;
  }

  if (request.method === "POST" && request.url === "/pq-dev/account") {
    handleErrors(response, async () => {
      const body = await readBody(request);
      return accountInfo(parseAccountRequest(body));
    });
    return;
  }

  if (request.method === "POST" && request.url === "/pq-dev/send-raw") {
    handleErrors(response, async () => {
      const body = await readBody(request);
      return submitRawPQTransaction(parseRawPQTransactionRequest(body));
    });
    return;
  }

  if (request.method === "POST" && (request.url === "/pq-dev/send" || request.url === "/pq-dev/relay")) {
    handleErrors(response, async () => {
      const body = await readBody(request);
      if ("rawTransaction" in body) return submitRawPQTransaction(parseRawPQTransactionRequest(body));
      return disabledEOAEndpoint(request.url ?? "/pq-dev/relay");
    });
    return;
  }

  if (request.method === "POST" && request.url === "/pq-dev/rotate") {
    handleErrors(response, async () => {
      const body = await readBody(request);
      if ("rawTransaction" in body) return submitRawPQTransaction(parseRawPQTransactionRequest(body));
      return disabledEOAEndpoint("/pq-dev/rotate");
    });
    return;
  }

  if (request.method === "POST" && request.url === "/pq-dev/deploy") {
    handleErrors(response, async () => disabledEOAEndpoint("/pq-dev/deploy"));
    return;
  }

  sendJson(response, 404, { ok: false, error: "not found" });
});

server.listen(port, () => {
  console.log(`[qubitor-pq-relayer] listening on http://127.0.0.1:${port} (${network.name}, PQ Native raw tx gateway)`);
});
