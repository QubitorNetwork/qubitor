export {
  QUBITOR_ACCOUNT_FACTORY,
  QUBITOR_ACCOUNT_READINESS_REGISTRY,
  QUBITOR_MLDSA65_PRECOMPILE,
  QUBITOR_SECURITY_MODE_REGISTRY,
  QUBITOR_TESTNET_EXPLORER_URL,
  QUBITOR_TESTNET_FAUCET_URL,
  QUBITOR_TESTNET_RPC_URL,
  defaultQubitorExecutionRpcUrl,
  defaultQubitorRpcUrl,
  getConfiguredQubitorNetwork,
  getQubitorNetwork,
  getQubitorNetworkByChainId,
  qubitorDevnet,
  qubitorMainnet,
  qubitorNetworks,
  qubitorSystemContracts,
  qubitorTestnet,
  walletAddEthereumChainParams,
  type Hex,
  type NativeCurrency,
  type QubitorContracts,
  type QubitorNetworkConfig,
  type QubitorNetworkName,
} from "@qubitor/chain-config";
export {
  ML_DSA_65_PUBLIC_KEY_BYTES,
  ML_DSA_65_SECRET_KEY_BYTES,
  ML_DSA_65_SIGNATURE_BYTES,
  QUBITOR_PQ_ACCOUNT_DOMAIN,
  QUBITOR_PQ_TX_CONTEXT,
  QUBITOR_PQ_TX_TYPE,
  QUBITOR_PQ_TX_TYPE_HEX,
  QUBITOR_DEVNET_PQ_SEED,
  QUBITOR_ZERO_HASH,
  bytesToHex,
  createViemTransport,
  deriveQubitorPQAccountAddress,
  generateMLDSA65KeyPair,
  hashQubitorPQTxV1,
  hexToBytes,
  sendRawQubitorPQTxV1,
  serializeQubitorPQTxV1,
  signMLDSA65,
  signQubitorPQTxV1,
  type Hex as PQHex,
  type MLDSA65KeyPair,
  type MLDSA65SignOptions,
  type QubitorPQAccessListEntry,
  type QubitorPQNumberish,
  type QubitorPQTxV1SignRequest,
  type QubitorPQTxV1SignResult,
  type QubitorPQTxV1Signed,
  type QubitorPQTxV1Unsigned,
} from "@qubitor/pq-native-tx";

import {
  defaultQubitorRpcUrl,
  qubitorDevnet,
  qubitorMainnet,
  qubitorTestnet,
  type Hex,
  type QubitorNetworkConfig,
  type QubitorNetworkName,
} from "@qubitor/chain-config";
import {
  QUBITOR_ZERO_HASH,
  deriveQubitorPQAccountAddress,
  generateMLDSA65KeyPair,
  signQubitorPQTxV1,
  type MLDSA65KeyPair,
  type QubitorPQTxV1SignRequest,
  type QubitorPQTxV1SignResult,
} from "@qubitor/pq-native-tx";

export type QubitorBlockTag = "latest" | "pending" | "earliest" | "safe" | "finalized" | Hex;
export type QubitorQuantity = bigint | number | string;
export type QubitorRpcTransport = typeof fetch;

export interface QubitorClientOptions {
  network?: QubitorNetworkConfig;
  networkName?: QubitorNetworkName;
  rpcUrl?: string;
  fetch?: QubitorRpcTransport;
}

export interface QubitorCallRequest {
  from?: Hex;
  to: Hex;
  gas?: QubitorQuantity;
  gasPrice?: QubitorQuantity;
  value?: QubitorQuantity;
  data?: Hex;
}

export interface WaitForTransactionReceiptOptions {
  pollingIntervalMs?: number;
  timeoutMs?: number;
}

export interface QubitorTransactionReceipt {
  transactionHash: Hex;
  transactionIndex?: Hex;
  blockHash?: Hex;
  blockNumber?: Hex;
  from?: Hex;
  to?: Hex | null;
  cumulativeGasUsed?: Hex;
  gasUsed?: Hex;
  contractAddress?: Hex | null;
  logs?: unknown[];
  logsBloom?: Hex;
  status?: Hex;
  type?: Hex;
  [key: string]: unknown;
}

export interface QubitorPQAccount extends MLDSA65KeyPair {
  address: Hex;
  factorySalt: Hex;
}

export interface CreatePQAccountOptions {
  seed?: Uint8Array | Hex;
  factorySalt?: Hex;
}

export interface SendPQTransactionRequest extends Omit<QubitorPQTxV1SignRequest, "chainId"> {
  chainId?: QubitorPQTxV1SignRequest["chainId"];
}

export interface SendPQTransactionResult extends QubitorPQTxV1SignResult {
  transactionHash: Hex;
}

export interface QubitorClient {
  readonly network: QubitorNetworkConfig;
  readonly rpcUrl: string;
  request<T>(method: string, params?: readonly unknown[]): Promise<T>;
  getChainId(): Promise<number>;
  assertChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBalance(address: Hex, blockTag?: QubitorBlockTag): Promise<bigint>;
  getTransactionCount(address: Hex, blockTag?: QubitorBlockTag): Promise<bigint>;
  getCode(address: Hex, blockTag?: QubitorBlockTag): Promise<Hex>;
  call(request: QubitorCallRequest, blockTag?: QubitorBlockTag): Promise<Hex>;
  estimateGas(request: QubitorCallRequest): Promise<bigint>;
  sendRawTransaction(rawTransaction: Hex): Promise<Hex>;
  sendRawPQTransaction(rawTransaction: Hex): Promise<Hex>;
  getTransactionReceipt(transactionHash: Hex): Promise<QubitorTransactionReceipt | null>;
  waitForTransactionReceipt(
    transactionHash: Hex,
    options?: WaitForTransactionReceiptOptions,
  ): Promise<QubitorTransactionReceipt>;
  getAccountSecurityMode(address: Hex): Promise<unknown>;
  getAccountReadiness(address: Hex): Promise<unknown>;
  getSmartAccountDeploymentState(address: Hex): Promise<unknown>;
  getMiningStatus(): Promise<unknown>;
  getDifficulty(): Promise<unknown>;
  getHashrate(): Promise<unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHex(value: Hex, label: string): Hex {
  if (!/^0x[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new Error(`${label} must be even-length 0x hex`);
  }
  return value.toLowerCase() as Hex;
}

function quantityToBigInt(value: Hex | null | undefined, label: string): bigint {
  if (value === null || value === undefined) throw new Error(`${label} missing JSON-RPC result`);
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`${label} must be a JSON-RPC hex quantity`);
  return BigInt(value);
}

function quantityToHex(value: QubitorQuantity | undefined): Hex | undefined {
  if (value === undefined) return undefined;
  let next: bigint;
  if (typeof value === "bigint") next = value;
  else if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("quantity number must be a non-negative safe integer");
    next = BigInt(value);
  } else if (/^0x[0-9a-fA-F]+$/.test(value)) {
    next = BigInt(value);
  } else if (/^[0-9]+$/.test(value)) {
    next = BigInt(value);
  } else {
    throw new Error("quantity must be bigint, safe integer, decimal string, or hex quantity");
  }
  if (next < 0n) throw new Error("quantity must be non-negative");
  return `0x${next.toString(16)}` as Hex;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function callRequestToRpc(request: QubitorCallRequest): Record<string, unknown> {
  return omitUndefined({
    from: request.from,
    to: request.to,
    gas: quantityToHex(request.gas),
    gasPrice: quantityToHex(request.gasPrice),
    value: quantityToHex(request.value),
    data: request.data ?? "0x",
  });
}

export function createQubitorClient(options: QubitorClientOptions = {}): QubitorClient {
  const network =
    options.network ??
    (options.networkName === "devnet" ? qubitorDevnet : options.networkName === "mainnet" ? qubitorMainnet : qubitorTestnet);
  const rpcUrl = options.rpcUrl ?? defaultQubitorRpcUrl(network);
  const fetchImpl = options.fetch ?? fetch;
  let requestId = 1;

  const request = async <T>(method: string, params: readonly unknown[] = []): Promise<T> => {
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId++, method, params }),
    });
    if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
    const payload = (await response.json()) as { result?: T; error?: { code?: number; message?: string; data?: unknown } };
    if (payload.error) throw new Error(payload.error.message ?? `${method} failed`);
    return payload.result as T;
  };

  const client: QubitorClient = {
    network,
    rpcUrl,
    request,
    async getChainId() {
      return Number(quantityToBigInt(await request<Hex>("eth_chainId"), "eth_chainId"));
    },
    async assertChainId() {
      const chainId = await client.getChainId();
      if (chainId !== network.chainId) {
        throw new Error(`Qubitor chain ID mismatch: expected ${network.chainId}, got ${chainId}`);
      }
      return chainId;
    },
    async getBlockNumber() {
      return quantityToBigInt(await request<Hex>("eth_blockNumber"), "eth_blockNumber");
    },
    async getBalance(address, blockTag = "latest") {
      return quantityToBigInt(await request<Hex>("eth_getBalance", [address, blockTag]), "eth_getBalance");
    },
    async getTransactionCount(address, blockTag = "latest") {
      return quantityToBigInt(
        await request<Hex>("eth_getTransactionCount", [address, blockTag]),
        "eth_getTransactionCount",
      );
    },
    async getCode(address, blockTag = "latest") {
      return normalizeHex(await request<Hex>("eth_getCode", [address, blockTag]), "eth_getCode");
    },
    async call(callRequest, blockTag = "latest") {
      return normalizeHex(await request<Hex>("eth_call", [callRequestToRpc(callRequest), blockTag]), "eth_call");
    },
    async estimateGas(callRequest) {
      return quantityToBigInt(await request<Hex>("eth_estimateGas", [callRequestToRpc(callRequest)]), "eth_estimateGas");
    },
    async sendRawTransaction(rawTransaction) {
      return request<Hex>("eth_sendRawTransaction", [normalizeHex(rawTransaction, "rawTransaction")]);
    },
    async sendRawPQTransaction(rawTransaction) {
      return request<Hex>("qubitor_sendRawPQTransaction", [normalizeHex(rawTransaction, "rawTransaction")]);
    },
    async getTransactionReceipt(transactionHash) {
      return request<QubitorTransactionReceipt | null>("eth_getTransactionReceipt", [
        normalizeHex(transactionHash, "transactionHash"),
      ]);
    },
    async waitForTransactionReceipt(transactionHash, waitOptions = {}) {
      const pollingIntervalMs = waitOptions.pollingIntervalMs ?? 2_000;
      const timeoutMs = waitOptions.timeoutMs ?? 120_000;
      const started = Date.now();
      while (Date.now() - started <= timeoutMs) {
        const receipt = await client.getTransactionReceipt(transactionHash);
        if (receipt) return receipt;
        await sleep(pollingIntervalMs);
      }
      throw new Error(`timed out waiting for transaction receipt ${transactionHash}`);
    },
    async getAccountSecurityMode(address) {
      return request("qubitor_getAccountSecurityMode", [address]);
    },
    async getAccountReadiness(address) {
      return request("qubitor_getAccountReadiness", [address]);
    },
    async getSmartAccountDeploymentState(address) {
      return request("qubitor_getSmartAccountDeploymentState", [address]);
    },
    async getMiningStatus() {
      return request("qubitor_getMiningStatus");
    },
    async getDifficulty() {
      return request("qubitor_getDifficulty");
    },
    async getHashrate() {
      return request("qubitor_getHashrate");
    },
  };

  return client;
}

export function createPQAccount(options: CreatePQAccountOptions = {}): QubitorPQAccount {
  const factorySalt = options.factorySalt ?? QUBITOR_ZERO_HASH;
  const keypair = generateMLDSA65KeyPair(options.seed);
  return {
    ...keypair,
    factorySalt,
    address: deriveQubitorPQAccountAddress(keypair.publicKey, factorySalt),
  };
}

export function signPQTransaction(
  client: Pick<QubitorClient, "network">,
  request: SendPQTransactionRequest,
): QubitorPQTxV1SignResult {
  return signQubitorPQTxV1({
    ...request,
    chainId: request.chainId ?? client.network.chainId,
  });
}

export async function sendPQTransaction(
  client: Pick<QubitorClient, "network" | "sendRawPQTransaction">,
  request: SendPQTransactionRequest,
): Promise<SendPQTransactionResult> {
  const signed = signPQTransaction(client, request);
  return {
    ...signed,
    transactionHash: await client.sendRawPQTransaction(signed.rawTransaction),
  };
}

export async function getQbtBalance(client: Pick<QubitorClient, "getBalance">, address: Hex): Promise<bigint> {
  return client.getBalance(address);
}

export async function getAccountSecurityMode(
  client: Pick<QubitorClient, "getAccountSecurityMode">,
  address: Hex,
): Promise<unknown> {
  return client.getAccountSecurityMode(address);
}

export async function getAccountReadiness(
  client: Pick<QubitorClient, "getAccountReadiness">,
  address: Hex,
): Promise<unknown> {
  return client.getAccountReadiness(address);
}

export async function getSmartAccountDeploymentState(
  client: Pick<QubitorClient, "getSmartAccountDeploymentState">,
  address: Hex,
): Promise<unknown> {
  return client.getSmartAccountDeploymentState(address);
}
