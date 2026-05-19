import { getQubitorNetworkByChainId } from "@qubitor/chain-config";

export const PROOF_BUNDLE_VERSION = "qbt-devnet-proof-v1";
export function proofBundleVersionForChainId(chainId: number | undefined) {
  const network = chainId === undefined ? undefined : getQubitorNetworkByChainId(chainId);
  const profile = network?.shortName === "qbt" ? "mainnet" : network?.shortName.replace(/^qbt-/, "");
  return `qbt-${profile ?? "unknown"}-proof-v1`;
}
export const QUBITOR_EXACT_CLAIM =
  "Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.";
export const QUBITOR_COMPATIBILITY_BOUNDARY =
  "Legacy Ethereum transaction types are disabled when QUBITOR_EOA_TXS=0; system contracts are installed at genesis and wallet flows use QubitorPQTxV1.";

export const QUBITOR_EVENT_TOPICS = {
  AccountCreated: "0x934abbffb6906db60a85b076f1e41da9667dfa53c7724f4fe2333298d7b1db8c",
  ExecutedPQ: "0x191b0fcd7394ababe50b44fd8160c07e20f21ff5ca2955a00d771a2f5c2cd5bf",
  PQKeyRotated: "0x014bfaa875b999063943994efbfefb77a52027329c6ea80da9439fd4f6790221",
  TreasuryTransferred: "0x5d287c3dbdf588d1732266ef7326b39714c9ba6e9a0deff4adf5df6798ed41be",
  PolicyRecorded: "0x648773e3481db1ba1bae6fd6b463587a1e1d7add09423854b62d81c91848be54",
  TreasuryReceived: "0xf6f3bf9d00b52384d77c0b88440f0c216676d7ff221073342ec0606c43ccc40c",
} as const;

export type QubitorEventType = keyof typeof QUBITOR_EVENT_TOPICS;
export type RpcClient = <T>(method: string, params?: unknown[]) => Promise<T>;

export interface ProofBundle {
  proofBundleVersion: string;
  generatedAt?: string;
  chain?: {
    name?: string;
    chainId?: number;
    nativeCurrency?: {
      name?: string;
      symbol?: string;
      decimals?: number;
    };
  };
  exactClaim?: string;
  compatibilityBoundary?: string;
  proofType?: string;
  subject?: string;
  summary?: Record<string, unknown>;
  evidence?: {
    blocks?: BlockEvidence[];
    transactions?: TransactionEvidence[];
    events?: EventEvidence[];
  };
}

export interface BlockEvidence {
  number?: number;
  hash?: string;
  parentHash?: string;
  timestamp?: string;
  miner?: string;
  transactionCount?: number;
}

export interface TransactionEvidence {
  hash?: string;
  blockNumber?: number;
  blockHash?: string;
  transactionIndex?: number;
  from?: string;
  to?: string | null;
  value?: string;
  input?: string;
  status?: string;
  gasUsed?: string;
  contractAddress?: string | null;
  tags?: string[];
}

export interface EventEvidence {
  id?: string;
  type?: string;
  emitter?: string;
  blockNumber?: number;
  blockHash?: string;
  transactionHash?: string;
  transactionIndex?: number;
  logIndex?: number;
  eventTopic?: string;
  topics?: string[];
  data?: string;
  decoded?: Record<string, string>;
  tags?: string[];
}

export interface ProofVerificationReport {
  ok: true;
  proofType: string;
  subject: string;
  chainId: number;
  blockCount: number;
  transactionCount: number;
  eventCount: number;
  checkCount: number;
}

export interface VerifyProofBundleOptions {
  rpc: RpcClient;
}

interface RpcBlock {
  number?: string;
  hash?: string;
  parentHash?: string;
  timestamp?: string;
  miner?: string;
  transactions?: Array<string | { hash?: string }>;
}

interface RpcTransaction {
  hash?: string;
  blockHash?: string;
  blockNumber?: string;
  transactionIndex?: string;
  from?: string;
  to?: string | null;
  value?: string;
  input?: string;
}

interface RpcLog {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
  transactionIndex?: string;
  blockHash?: string;
  logIndex?: string;
  removed?: boolean;
}

interface RpcReceipt {
  transactionHash?: string;
  transactionIndex?: string;
  blockHash?: string;
  blockNumber?: string;
  from?: string;
  to?: string | null;
  contractAddress?: string | null;
  status?: string;
  gasUsed?: string;
  logs?: RpcLog[];
}

export class ProofVerificationError extends Error {
  readonly failures: string[];

  constructor(failures: string[]) {
    super(`Qubitor proof verification failed with ${failures.length} issue(s).`);
    this.name = "ProofVerificationError";
    this.failures = failures;
  }
}

export function createHttpRpcClient(rpcUrl: string): RpcClient {
  return async <T>(method: string, params: unknown[] = []) => {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) {
      throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { result?: T; error?: { message?: string } };
    if (payload.error) {
      throw new Error(`RPC ${method} failed: ${payload.error.message ?? "unknown error"}`);
    }
    return payload.result as T;
  };
}

export async function verifyProofBundle(
  bundle: ProofBundle,
  options: VerifyProofBundleOptions,
): Promise<ProofVerificationReport> {
  const failures: string[] = [];
  let checkCount = 0;
  const check = (condition: unknown, message: string) => {
    checkCount++;
    if (!condition) failures.push(message);
  };

  const proofType = stringValue(bundle.proofType) ?? "";
  const subject = stringValue(bundle.subject) ?? "";
  const blocks = Array.isArray(bundle.evidence?.blocks) ? bundle.evidence.blocks : [];
  const transactions = Array.isArray(bundle.evidence?.transactions) ? bundle.evidence.transactions : [];
  const events = Array.isArray(bundle.evidence?.events) ? bundle.evidence.events : [];

  const bundleNetwork = getQubitorNetworkByChainId(Number(bundle.chain?.chainId));
  const expectedBundleVersion = proofBundleVersionForChainId(bundle.chain?.chainId);

  check(Boolean(bundleNetwork), `bundle chain id must be a known Qubitor network`);
  check(bundle.proofBundleVersion === expectedBundleVersion, `bundle version must be ${expectedBundleVersion}`);
  check(bundle.exactClaim === QUBITOR_EXACT_CLAIM, "bundle must include the exact Qubitor claim boundary");
  check(
    bundle.compatibilityBoundary === QUBITOR_COMPATIBILITY_BOUNDARY,
    "bundle must include the Legacy EOA compatibility boundary",
  );
  if (bundleNetwork) {
    check(bundle.chain?.name === bundleNetwork.name, `bundle chain name must be ${bundleNetwork.name}`);
    check(bundle.chain?.chainId === bundleNetwork.chainId, `bundle chain id must be ${bundleNetwork.chainId}`);
    check(bundle.chain?.nativeCurrency?.symbol === bundleNetwork.nativeCurrency.symbol, "bundle currency must be QBT");
  }
  check(Boolean(proofType), "bundle must include proofType");
  check(Boolean(subject), "bundle must include subject");
  check(blocks.length > 0, "bundle must include block evidence");
  check(transactions.length > 0, "bundle must include transaction evidence");

  const rpcChainId = await options.rpc<string>("eth_chainId", []);
  check(quantityToNumber(rpcChainId) === bundleNetwork?.chainId, `RPC chain id must be ${bundleNetwork?.chainId}`);
  check(quantityToNumber(rpcChainId) === bundle.chain?.chainId, "RPC chain id must match the bundle chain id");

  const blockCache = new Map<number, Promise<RpcBlock | null>>();
  const txCache = new Map<string, Promise<RpcTransaction | null>>();
  const receiptCache = new Map<string, Promise<RpcReceipt | null>>();

  const getBlock = (number: number) => {
    const cached = blockCache.get(number);
    if (cached) return cached;
    const promise = options.rpc<RpcBlock | null>("eth_getBlockByNumber", [`0x${number.toString(16)}`, false]);
    blockCache.set(number, promise);
    return promise;
  };
  const getTransaction = (hash: string) => {
    const normalized = hash.toLowerCase();
    const cached = txCache.get(normalized);
    if (cached) return cached;
    const promise = options.rpc<RpcTransaction | null>("eth_getTransactionByHash", [hash]);
    txCache.set(normalized, promise);
    return promise;
  };
  const getReceipt = (hash: string) => {
    const normalized = hash.toLowerCase();
    const cached = receiptCache.get(normalized);
    if (cached) return cached;
    const promise = options.rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash]);
    receiptCache.set(normalized, promise);
    return promise;
  };

  for (const block of blocks) {
    await verifyBlockEvidence(block, getBlock, check);
  }

  for (const transaction of transactions) {
    await verifyTransactionEvidence(transaction, getTransaction, getReceipt, check);
  }

  for (const event of events) {
    await verifyEventEvidence(event, getReceipt, check);
  }

  await verifySemanticClaim(bundle, { getReceipt, check });

  if (failures.length > 0) {
    throw new ProofVerificationError(failures);
  }

  return {
    ok: true,
    proofType,
    subject,
    chainId: bundle.chain?.chainId ?? 0,
    blockCount: blocks.length,
    transactionCount: transactions.length,
    eventCount: events.length,
    checkCount,
  };
}

async function verifyBlockEvidence(
  evidence: BlockEvidence,
  getBlock: (number: number) => Promise<RpcBlock | null>,
  check: (condition: unknown, message: string) => void,
) {
  const label = `block ${evidence.number ?? "unknown"}`;
  check(Number.isInteger(evidence.number), `${label}: number must be present`);
  if (!Number.isInteger(evidence.number)) return;

  const block = await getBlock(evidence.number as number);
  check(Boolean(block), `${label}: block must exist on RPC`);
  if (!block) return;

  check(quantityToNumber(block.number) === evidence.number, `${label}: RPC number must match`);
  check(hexEqual(block.hash, evidence.hash), `${label}: hash must match RPC`);
  if (evidence.parentHash) check(hexEqual(block.parentHash, evidence.parentHash), `${label}: parent hash must match RPC`);
  if (evidence.timestamp) check(quantityEqual(block.timestamp, evidence.timestamp), `${label}: timestamp must match RPC`);
  if (evidence.miner) check(addressEqual(block.miner, evidence.miner), `${label}: miner must match RPC`);
  if (Number.isInteger(evidence.transactionCount)) {
    check((block.transactions ?? []).length === evidence.transactionCount, `${label}: transaction count must match RPC`);
  }
}

async function verifyTransactionEvidence(
  evidence: TransactionEvidence,
  getTransaction: (hash: string) => Promise<RpcTransaction | null>,
  getReceipt: (hash: string) => Promise<RpcReceipt | null>,
  check: (condition: unknown, message: string) => void,
) {
  const hash = stringValue(evidence.hash);
  const label = `tx ${hash ?? "unknown"}`;
  check(isHash(hash), `${label}: hash must be a 32-byte hex string`);
  if (!hash) return;

  const [tx, receipt] = await Promise.all([getTransaction(hash), getReceipt(hash)]);
  check(Boolean(tx), `${label}: transaction must exist on RPC`);
  check(Boolean(receipt), `${label}: receipt must exist on RPC`);
  if (!tx || !receipt) return;

  check(hexEqual(tx.hash, evidence.hash), `${label}: transaction hash must match RPC`);
  check(hexEqual(receipt.transactionHash, evidence.hash), `${label}: receipt hash must match RPC`);
  if (Number.isInteger(evidence.blockNumber)) {
    check(quantityToNumber(tx.blockNumber) === evidence.blockNumber, `${label}: transaction block number must match RPC`);
    check(quantityToNumber(receipt.blockNumber) === evidence.blockNumber, `${label}: receipt block number must match RPC`);
  }
  if (evidence.blockHash) {
    check(hexEqual(tx.blockHash, evidence.blockHash), `${label}: transaction block hash must match RPC`);
    check(hexEqual(receipt.blockHash, evidence.blockHash), `${label}: receipt block hash must match RPC`);
  }
  if (Number.isInteger(evidence.transactionIndex)) {
    check(
      quantityToNumber(tx.transactionIndex) === evidence.transactionIndex,
      `${label}: transaction index must match RPC`,
    );
    check(
      quantityToNumber(receipt.transactionIndex) === evidence.transactionIndex,
      `${label}: receipt transaction index must match RPC`,
    );
  }
  if (evidence.from) check(addressEqual(tx.from ?? receipt.from, evidence.from), `${label}: from must match RPC`);
  if (evidence.to !== undefined) check(nullableAddressEqual(tx.to ?? receipt.to, evidence.to), `${label}: to must match RPC`);
  if (evidence.value) check(quantityEqual(tx.value, evidence.value), `${label}: value must match RPC`);
  if (evidence.input) check(hexEqual(tx.input, evidence.input), `${label}: input must match RPC`);
  if (evidence.status) check(quantityEqual(receipt.status, evidence.status), `${label}: receipt status must match RPC`);
  if (evidence.gasUsed) check(quantityEqual(receipt.gasUsed, evidence.gasUsed), `${label}: gas used must match RPC`);
  if (evidence.contractAddress !== undefined) {
    check(
      nullableAddressEqual(receipt.contractAddress, evidence.contractAddress),
      `${label}: contract address must match RPC`,
    );
  }
  check(receipt.status !== "0x0", `${label}: transaction must not be a failed receipt`);
}

async function verifyEventEvidence(
  evidence: EventEvidence,
  getReceipt: (hash: string) => Promise<RpcReceipt | null>,
  check: (condition: unknown, message: string) => void,
) {
  const hash = stringValue(evidence.transactionHash);
  const label = `${evidence.type ?? "event"} ${hash ?? "unknown"}:${evidence.logIndex ?? "unknown"}`;
  check(isKnownEventType(evidence.type), `${label}: event type must be a known Qubitor event`);
  check(isHash(hash), `${label}: transactionHash must be a 32-byte hex string`);
  check(Number.isInteger(evidence.logIndex), `${label}: logIndex must be present`);
  check(Array.isArray(evidence.topics) && evidence.topics.length > 0, `${label}: topics must be present`);
  if (!hash) return;

  const expectedTopic = isKnownEventType(evidence.type) ? QUBITOR_EVENT_TOPICS[evidence.type] : undefined;
  if (expectedTopic) check(hexEqual(evidence.eventTopic, expectedTopic), `${label}: event topic must match ${evidence.type}`);
  if (Array.isArray(evidence.topics) && evidence.topics.length > 0) {
    check(hexEqual(evidence.eventTopic, evidence.topics[0]), `${label}: eventTopic must match topics[0]`);
  }

  const receipt = await getReceipt(hash);
  check(Boolean(receipt), `${label}: receipt must exist on RPC`);
  if (!receipt) return;

  const log = findReceiptLog(receipt, evidence);
  check(Boolean(log), `${label}: matching log must exist in the RPC receipt`);
  if (!log) return;

  check(addressEqual(log.address, evidence.emitter), `${label}: emitter must match receipt log address`);
  check(hexEqual(log.transactionHash, evidence.transactionHash), `${label}: transaction hash must match receipt log`);
  check(quantityToNumber(log.blockNumber) === evidence.blockNumber, `${label}: block number must match receipt log`);
  if (evidence.blockHash) check(hexEqual(log.blockHash, evidence.blockHash), `${label}: block hash must match receipt log`);
  if (Number.isInteger(evidence.transactionIndex)) {
    check(quantityToNumber(log.transactionIndex) === evidence.transactionIndex, `${label}: tx index must match receipt log`);
  }
  check(quantityToNumber(log.logIndex) === evidence.logIndex, `${label}: log index must match receipt log`);
  if (evidence.data) check(hexEqual(log.data, evidence.data), `${label}: data must match receipt log`);
  if (evidence.topics) {
    check((log.topics ?? []).length === evidence.topics.length, `${label}: topic count must match receipt log`);
    for (let index = 0; index < evidence.topics.length; index++) {
      check(hexEqual(log.topics?.[index], evidence.topics[index]), `${label}: topic ${index} must match receipt log`);
    }
  }
  check(log.removed !== true, `${label}: log must not be removed`);
}

async function verifySemanticClaim(
  bundle: ProofBundle,
  context: {
    getReceipt: (hash: string) => Promise<RpcReceipt | null>;
    check: (condition: unknown, message: string) => void;
  },
) {
  const events = bundle.evidence?.events ?? [];
  const transactions = bundle.evidence?.transactions ?? [];
  const summary = bundle.summary ?? {};
  const subject = stringValue(bundle.subject);

  if (bundle.proofType === "pq-account") {
    const account = normalizeAddress(subject);
    context.check(Boolean(account), "pq-account proof subject must be an address");
    context.check(normalizeAddress(stringValue(summary.account)) === account, "pq-account summary account must match subject");
    context.check(summary.pqRequired === true, "pq-account proof must mark PQ authorization as required");
    context.check(summary.ecdsaControl === false, "pq-account proof must mark ECDSA control as false");

    const created = events.filter((event) => event.type === "AccountCreated");
    const actions = events.filter((event) => event.type === "ExecutedPQ" || event.type === "PQKeyRotated");
    context.check(created.length > 0, "pq-account proof must include AccountCreated evidence");
    context.check(actions.length > 0, "pq-account proof must include ExecutedPQ or PQKeyRotated evidence");
    context.check(
      created.some((event) => normalizeAddress(event.decoded?.account) === account),
      "pq-account AccountCreated event must name the subject account",
    );
    for (const action of actions) {
      context.check(normalizeAddress(action.emitter) === account, `${action.type}: emitter must be the subject account`);
    }
    return;
  }

  if (bundle.proofType === "faucet-claim") {
    const blocks = bundle.evidence?.blocks ?? [];
    const claimHash = normalizeHash(subject);
    const faucetAddress = normalizeAddress(stringValue(summary.faucetAddress));
    context.check(Boolean(claimHash), "faucet proof subject must be a transaction hash");
    context.check(summary.compatibilityMode === false, "faucet proof must mark the claim as PQ-native");
    const hasTreasuryTopUp = summary.hasPriorPQTreasuryTopUp === true;
    const hasPoWReward =
      summary.hasPriorPoWMinerReward === true &&
      summary.treasuryFundingSource === "pow-miner-rewards-to-pq-treasury";
    context.check(
      hasTreasuryTopUp || hasPoWReward,
      "faucet proof must include prior PQ treasury top-up or PoW reward evidence",
    );

    const claimTx = transactions.find((tx) => normalizeHash(tx.hash) === claimHash);
    context.check(Boolean(claimTx), "faucet proof must include the faucet claim transaction evidence");
    const topUps = events.filter((event) => event.type === "TreasuryTransferred");
    if (hasTreasuryTopUp) {
      context.check(topUps.length > 0, "faucet proof must include TreasuryTransferred evidence");
      for (const topUp of topUps) {
        context.check(normalizeAddress(topUp.decoded?.target) === faucetAddress, "faucet top-up target must be faucet address");
        if (Number.isInteger(claimTx?.blockNumber)) {
          context.check(
            Number(topUp.blockNumber) <= Number(claimTx?.blockNumber),
            "faucet top-up block must be before or equal to claim block",
          );
        }
        await verifyExecutedPQInSameReceipt(topUp, context);
      }
    }
    if (hasPoWReward) {
      const rewardBlocks = blocks.filter((block) => normalizeAddress(block.miner) === faucetAddress);
      context.check(rewardBlocks.length > 0, "faucet proof must include PoW miner reward block evidence");
      if (Number.isInteger(claimTx?.blockNumber)) {
        context.check(
          rewardBlocks.some((block) => Number(block.number) <= Number(claimTx?.blockNumber)),
          "faucet PoW reward block must be before or equal to claim block",
        );
      }
    }
    return;
  }

  if (bundle.proofType === "admin-vault") {
    const vault = normalizeAddress(subject);
    const controller = normalizeAddress(stringValue(summary.pqController));
    context.check(Boolean(vault), "admin-vault proof subject must be an address");
    context.check(normalizeAddress(stringValue(summary.vault)) === vault, "admin-vault summary vault must match subject");
    context.check(Boolean(controller), "admin-vault proof must include a PQ controller");
    context.check(summary.legacyEOAControl === false, "admin-vault proof must mark Legacy EOA control as false");
    context.check(summary.hasPolicyRecorded === true, "admin-vault proof must include policy evidence");
    context.check(summary.hasTreasuryTransferred === true, "admin-vault proof must include treasury transfer evidence");

    const privileged = events.filter((event) => event.type === "PolicyRecorded" || event.type === "TreasuryTransferred");
    context.check(privileged.some((event) => event.type === "PolicyRecorded"), "admin-vault proof must include PolicyRecorded");
    context.check(
      privileged.some((event) => event.type === "TreasuryTransferred"),
      "admin-vault proof must include TreasuryTransferred",
    );
    for (const event of privileged) {
      context.check(normalizeAddress(event.emitter) === vault, `${event.type}: emitter must be the admin vault`);
      context.check(normalizeAddress(event.decoded?.controller) === controller, `${event.type}: controller must match summary`);
      await verifyExecutedPQInSameReceipt(event, context);
    }
    return;
  }

  context.check(false, `unsupported proofType ${String(bundle.proofType)}`);
}

async function verifyExecutedPQInSameReceipt(
  event: EventEvidence,
  context: {
    getReceipt: (hash: string) => Promise<RpcReceipt | null>;
    check: (condition: unknown, message: string) => void;
  },
) {
  const txHash = stringValue(event.transactionHash);
  const controller = normalizeAddress(event.decoded?.controller);
  const label = `${event.type ?? "event"} ${txHash ?? "unknown"}`;
  if (!txHash || !controller) {
    context.check(false, `${label}: PQ controller and transaction hash must be present`);
    return;
  }
  const receipt = await context.getReceipt(txHash);
  const hasControllerExecutedPQ = (receipt?.logs ?? []).some(
    (log) => normalizeAddress(log.address) === controller && hexEqual(log.topics?.[0], QUBITOR_EVENT_TOPICS.ExecutedPQ),
  );
  context.check(hasControllerExecutedPQ, `${label}: receipt must include ExecutedPQ from the PQ controller account`);
}

function findReceiptLog(receipt: RpcReceipt, evidence: EventEvidence): RpcLog | undefined {
  const byIndex = (receipt.logs ?? []).find((log) => quantityToNumber(log.logIndex) === evidence.logIndex);
  if (byIndex) return byIndex;
  return (receipt.logs ?? []).find(
    (log) =>
      addressEqual(log.address, evidence.emitter) &&
      hexEqual(log.topics?.[0], evidence.eventTopic) &&
      hexEqual(log.data, evidence.data),
  );
}

function isKnownEventType(value: unknown): value is QubitorEventType {
  return typeof value === "string" && Object.hasOwn(QUBITOR_EVENT_TOPICS, value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) return undefined;
  return value.toLowerCase();
}

function normalizeHash(value: unknown): string | undefined {
  const hex = normalizeHex(value);
  return hex && /^0x[0-9a-f]{64}$/.test(hex) ? hex : undefined;
}

function normalizeAddress(value: unknown): string | undefined {
  const hex = normalizeHex(value);
  return hex && /^0x[0-9a-f]{40}$/.test(hex) ? hex : undefined;
}

function isHash(value: unknown): boolean {
  return Boolean(normalizeHash(value));
}

function hexEqual(actual: unknown, expected: unknown): boolean {
  const actualHex = normalizeHex(actual);
  const expectedHex = normalizeHex(expected);
  return Boolean(actualHex && expectedHex && actualHex === expectedHex);
}

function addressEqual(actual: unknown, expected: unknown): boolean {
  const actualAddress = normalizeAddress(actual);
  const expectedAddress = normalizeAddress(expected);
  return Boolean(actualAddress && expectedAddress && actualAddress === expectedAddress);
}

function nullableAddressEqual(actual: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) return actual === null || actual === undefined;
  return addressEqual(actual, expected);
}

function quantityToBigInt(value: unknown): bigint | undefined {
  const hex = normalizeHex(value);
  if (!hex) return undefined;
  try {
    return BigInt(hex);
  } catch {
    return undefined;
  }
}

function quantityToNumber(value: unknown): number | undefined {
  const bigint = quantityToBigInt(value);
  return bigint === undefined ? undefined : Number(bigint);
}

function quantityEqual(actual: unknown, expected: unknown): boolean {
  const actualQuantity = quantityToBigInt(actual);
  const expectedQuantity = quantityToBigInt(expected);
  return actualQuantity !== undefined && expectedQuantity !== undefined && actualQuantity === expectedQuantity;
}
