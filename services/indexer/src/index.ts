import http from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  defaultQubitorExecutionRpcUrl,
  getConfiguredQubitorNetwork,
  getQubitorNetworkName,
} from "@qubitor/chain-config";

const networkName = getQubitorNetworkName();
const network = getConfiguredQubitorNetwork(networkName);
const rpcUrl = process.env.QUBITOR_RPC_URL ?? defaultQubitorExecutionRpcUrl(network);
const port = Number(process.env.QUBITOR_INDEXER_PORT ?? 18549);
const pollMs = Number(process.env.QUBITOR_INDEXER_POLL_MS ?? 4000);
const faucetAddress =
  process.env.QUBITOR_FAUCET_ADDRESS?.toLowerCase() ??
  "0x587292b9914d42fb8708ba2108e846609ba23d89";
const dataDir =
  process.env.QUBITOR_INDEXER_DATA_DIR ??
  new URL(`../../../data/indexer/${networkName}`, import.meta.url).pathname;
const storeFile = path.join(dataDir, "index.json");
const proofBundleVersion = `qbt-${networkName}-proof-v1`;
const exactClaim =
  "Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.";
const compatibilityBoundary =
  "Legacy Ethereum transaction types are disabled when QUBITOR_EOA_TXS=0; system contracts are installed at genesis and wallet flows use QubitorPQTxV1.";

const functionSelectors: Record<string, string[]> = {
  "0xf8a59370": ["account-factory-call", "qubitor-account-create"],
  "0xaffdafad": ["pq-execute-call", "pq-authorized"],
  "0x198bb723": ["pq-key-rotation-call", "pq-authorized"],
  "0x5389bfe5": ["admin-treasury-transfer-call", "pq-admin"],
  "0x635e2e5d": ["admin-policy-call", "pq-admin"],
};

const eventTopics: Record<string, { type: string; tags: string[] }> = {
  "0x934abbffb6906db60a85b076f1e41da9667dfa53c7724f4fe2333298d7b1db8c": {
    type: "AccountCreated",
    tags: ["qubitor-account-created", "pq-native"],
  },
  "0x191b0fcd7394ababe50b44fd8160c07e20f21ff5ca2955a00d771a2f5c2cd5bf": {
    type: "ExecutedPQ",
    tags: ["pq-execute", "pq-authorized"],
  },
  "0x014bfaa875b999063943994efbfefb77a52027329c6ea80da9439fd4f6790221": {
    type: "PQKeyRotated",
    tags: ["pq-key-rotation", "pq-authorized"],
  },
  "0x5d287c3dbdf588d1732266ef7326b39714c9ba6e9a0deff4adf5df6798ed41be": {
    type: "TreasuryTransferred",
    tags: ["pq-admin", "treasury-transfer"],
  },
  "0x648773e3481db1ba1bae6fd6b463587a1e1d7add09423854b62d81c91848be54": {
    type: "PolicyRecorded",
    tags: ["pq-admin", "policy-recorded"],
  },
  "0xf6f3bf9d00b52384d77c0b88440f0c216676d7ff221073342ec0606c43ccc40c": {
    type: "TreasuryReceived",
    tags: ["treasury-received"],
  },
};

interface RpcTransaction {
  hash: string;
  blockHash?: string;
  blockNumber?: string;
  transactionIndex?: string;
  from?: string;
  to?: string | null;
  value?: string;
  nonce?: string;
  input?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  type?: string;
}

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber?: string;
  transactionHash?: string;
  transactionIndex?: string;
  blockHash?: string;
  logIndex?: string;
  removed?: boolean;
}

interface RpcReceipt {
  transactionHash: string;
  transactionIndex?: string;
  blockHash?: string;
  blockNumber?: string;
  from?: string;
  to?: string | null;
  contractAddress?: string | null;
  status?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  logs?: RpcLog[];
}

interface RpcBlock {
  number: string;
  hash: string;
  parentHash?: string;
  timestamp?: string;
  miner?: string;
  difficulty?: string;
  gasLimit?: string;
  gasUsed?: string;
  baseFeePerGas?: string;
  transactions: Array<RpcTransaction | string>;
}

interface IndexedBlock {
  number: number;
  numberHex: string;
  hash: string;
  parentHash?: string;
  timestamp?: string;
  miner?: string;
  difficulty?: string;
  gasLimit?: string;
  gasUsed?: string;
  baseFeePerGas?: string;
  transactionHashes: string[];
  transactionCount: number;
  indexedAt: string;
}

interface IndexedLog {
  id: string;
  type: string;
  address: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  topics: string[];
  data: string;
  tags: string[];
  decoded?: Record<string, string>;
}

interface IndexedTransaction {
  hash: string;
  blockNumber: number;
  blockHash?: string;
  transactionIndex?: number;
  from?: string;
  to?: string | null;
  value?: string;
  nonce?: string;
  input?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  type?: string;
  status?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  contractAddress?: string | null;
  logs: IndexedLog[];
  tags: string[];
  indexedAt: string;
}

interface IndexedAddress {
  address: string;
  transactionHashes: string[];
  eventIds: string[];
  tags: string[];
  firstSeenBlock: number;
  lastSeenBlock: number;
}

interface IndexStore {
  network: string;
  chainId: number;
  rpcUrl: string;
  createdAt: string;
  updatedAt: string;
  lastIndexedBlock: number;
  lastIndexedHash?: string;
  blocks: Record<string, IndexedBlock>;
  transactions: Record<string, IndexedTransaction>;
  events: Record<string, IndexedLog>;
  addresses: Record<string, IndexedAddress>;
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = (await response.json()) as { result?: T; error?: { message: string } };
  if (payload.error) throw new Error(payload.error.message);
  return payload.result as T;
}

function now() {
  return new Date().toISOString();
}

function emptyStore(): IndexStore {
  return {
    network: networkName,
    chainId: network.chainId,
    rpcUrl,
    createdAt: now(),
    updatedAt: now(),
    lastIndexedBlock: -1,
    blocks: {},
    transactions: {},
    events: {},
    addresses: {},
  };
}

function loadStore(): IndexStore {
  if (process.env.QUBITOR_INDEXER_RESET === "1") return emptyStore();
  try {
    if (!existsSync(storeFile)) return emptyStore();
    const store = JSON.parse(readFileSync(storeFile, "utf8")) as IndexStore;
    return store.chainId === network.chainId ? store : emptyStore();
  } catch {
    return emptyStore();
  }
}

let store = loadStore();

function saveStore() {
  mkdirSync(dataDir, { recursive: true });
  store.updatedAt = now();
  const tempFile = `${storeFile}.tmp`;
  writeFileSync(tempFile, JSON.stringify(store, null, 2));
  renameSync(tempFile, storeFile);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeAddress(value: string | null | undefined) {
  return value?.match(/^0x[a-fA-F0-9]{40}$/) ? value.toLowerCase() : undefined;
}

function hexToNumber(value: string | null | undefined): number | undefined {
  if (!value || !/^0x[0-9a-fA-F]+$/.test(value)) return undefined;
  return Number(BigInt(value));
}

function decodeIndexedAddress(topic: string | undefined) {
  if (!topic || !/^0x[a-fA-F0-9]{64}$/.test(topic)) return undefined;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function decodeWord(data: string | undefined, index: number) {
  if (!data || !data.startsWith("0x")) return undefined;
  const start = 2 + index * 64;
  const word = data.slice(start, start + 64);
  return word.length === 64 ? `0x${word}` : undefined;
}

function decodeUint(data: string | undefined, index: number) {
  const word = decodeWord(data, index);
  return word ? BigInt(word).toString() : undefined;
}

function isZeroValue(value: string | undefined) {
  return !value || BigInt(value) === 0n;
}

function isEmptyInput(input: string | undefined) {
  return !input || input === "0x";
}

function isFaucetClaim(tx: Pick<IndexedTransaction, "from" | "to" | "value" | "input" | "status">) {
  return (
    tx.from === faucetAddress &&
    Boolean(tx.to) &&
    !isZeroValue(tx.value) &&
    isEmptyInput(tx.input) &&
    tx.status !== "0x0"
  );
}

function addAddress(address: string | null | undefined, blockNumber: number, tags: string[], txHash?: string, eventId?: string) {
  const normalized = normalizeAddress(address);
  if (!normalized) return;

  const current =
    store.addresses[normalized] ??
    {
      address: normalized,
      transactionHashes: [],
      eventIds: [],
      tags: [],
      firstSeenBlock: blockNumber,
      lastSeenBlock: blockNumber,
    };

  current.firstSeenBlock = Math.min(current.firstSeenBlock, blockNumber);
  current.lastSeenBlock = Math.max(current.lastSeenBlock, blockNumber);
  if (txHash && !current.transactionHashes.includes(txHash)) current.transactionHashes.push(txHash);
  if (eventId && !current.eventIds.includes(eventId)) current.eventIds.push(eventId);
  current.tags = unique([...current.tags, ...tags]);
  store.addresses[normalized] = current;
}

function classifyLog(log: RpcLog, blockNumber: number, transactionHash: string): IndexedLog {
  const topic0 = log.topics[0]?.toLowerCase();
  const known = topic0 ? eventTopics[topic0] : undefined;
  const logIndex = hexToNumber(log.logIndex) ?? 0;
  const type = known?.type ?? "ContractLog";
  const decoded: Record<string, string> = {};

  if (type === "AccountCreated") {
    const account = decodeIndexedAddress(log.topics[1]);
    if (account) decoded.account = account;
    if (log.topics[2]) decoded.pqPublicKeyCommitment = log.topics[2];
    const salt = decodeWord(log.data, 0);
    if (salt) decoded.salt = salt;
  }
  if (type === "ExecutedPQ") {
    const target = decodeIndexedAddress(log.topics[1]);
    if (target) decoded.target = target;
    const value = decodeUint(log.data, 0);
    const nonce = decodeUint(log.data, 2);
    if (value) decoded.value = value;
    if (nonce) decoded.nonce = nonce;
  }
  if (type === "PQKeyRotated") {
    if (log.topics[1]) decoded.previousPublicKeyCommitment = log.topics[1];
    if (log.topics[2]) decoded.newPublicKeyCommitment = log.topics[2];
    const nonce = decodeUint(log.data, 0);
    if (nonce) decoded.nonce = nonce;
  }
  if (type === "TreasuryTransferred") {
    const controller = decodeIndexedAddress(log.topics[1]);
    const target = decodeIndexedAddress(log.topics[2]);
    if (controller) decoded.controller = controller;
    if (target) decoded.target = target;
    const value = decodeUint(log.data, 0);
    if (value) decoded.value = value;
  }
  if (type === "PolicyRecorded") {
    const controller = decodeIndexedAddress(log.topics[1]);
    if (controller) decoded.controller = controller;
    if (log.topics[2]) decoded.key = log.topics[2];
    const value = decodeWord(log.data, 0);
    const nonce = decodeUint(log.data, 1);
    if (value) decoded.value = value;
    if (nonce) decoded.nonce = nonce;
  }
  if (type === "TreasuryReceived") {
    const sender = decodeIndexedAddress(log.topics[1]);
    if (sender) decoded.sender = sender;
    const value = decodeUint(log.data, 0);
    if (value) decoded.value = value;
  }

  const indexedLog: IndexedLog = {
    id: `${transactionHash}:${logIndex}`,
    type,
    address: log.address.toLowerCase(),
    blockNumber,
    transactionHash,
    logIndex,
    topics: log.topics,
    data: log.data,
    tags: unique([...(known?.tags ?? []), type === "ContractLog" ? "contract-log" : "qubitor-event"]),
    decoded: Object.keys(decoded).length > 0 ? decoded : undefined,
  };

  addAddress(indexedLog.address, blockNumber, ["contract-log", ...indexedLog.tags], transactionHash, indexedLog.id);
  for (const address of Object.values(decoded)) {
    if (normalizeAddress(address)) {
      addAddress(address, blockNumber, ["event-participant", ...indexedLog.tags], transactionHash, indexedLog.id);
    }
  }

  return indexedLog;
}

function classifyTransaction(tx: RpcTransaction, receipt: RpcReceipt, logs: IndexedLog[]) {
  const selector = tx.input?.slice(0, 10).toLowerCase();
  const selectorTags = selector ? functionSelectors[selector] ?? [] : [];
  const receiptTags = receipt.contractAddress ? ["contract-created"] : [];
  const logTags = logs.flatMap((log) => log.tags);
  const failed = receipt.status === "0x0" ? ["failed"] : [];
  const faucetTags = isFaucetClaim({
    from: normalizeAddress(receipt.from ?? tx.from),
    to: normalizeAddress(receipt.to ?? tx.to),
    value: tx.value,
    input: tx.input,
    status: receipt.status,
  })
    ? ["faucet-claim", "pq-native-transfer"]
    : [];
  return unique([...selectorTags, ...receiptTags, ...logTags, ...failed, ...faucetTags]);
}

async function indexBlock(blockNumber: number) {
  const block = await rpc<RpcBlock>("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, true]);
  if (!block?.hash) return;

  const transactionHashes: string[] = [];
  for (const rawTx of block.transactions) {
    if (typeof rawTx === "string") {
      transactionHashes.push(rawTx);
      continue;
    }

    const tx = rawTx;
    transactionHashes.push(tx.hash);
    const receipt = await rpc<RpcReceipt>("eth_getTransactionReceipt", [tx.hash]);
    const txBlockNumber = hexToNumber(receipt.blockNumber ?? tx.blockNumber ?? block.number) ?? blockNumber;
    const logs = (receipt.logs ?? []).map((log) => classifyLog(log, txBlockNumber, tx.hash));
    const indexedTx: IndexedTransaction = {
      hash: tx.hash,
      blockNumber: txBlockNumber,
      blockHash: receipt.blockHash ?? tx.blockHash ?? block.hash,
      transactionIndex: hexToNumber(receipt.transactionIndex ?? tx.transactionIndex),
      from: normalizeAddress(receipt.from ?? tx.from),
      to: normalizeAddress(receipt.to ?? tx.to),
      value: tx.value,
      nonce: tx.nonce,
      input: tx.input,
      gas: tx.gas,
      gasPrice: tx.gasPrice,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      type: tx.type,
      status: receipt.status,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.effectiveGasPrice,
      contractAddress: normalizeAddress(receipt.contractAddress),
      logs,
      tags: [],
      indexedAt: now(),
    };
    indexedTx.tags = classifyTransaction(tx, receipt, logs);
    store.transactions[tx.hash.toLowerCase()] = indexedTx;

    addAddress(indexedTx.from, txBlockNumber, ["sender", ...indexedTx.tags], tx.hash);
    addAddress(indexedTx.to, txBlockNumber, ["recipient", ...indexedTx.tags], tx.hash);
    addAddress(indexedTx.contractAddress, txBlockNumber, ["contract-created", ...indexedTx.tags], tx.hash);
    for (const log of logs) store.events[log.id] = log;
  }

  store.blocks[String(blockNumber)] = {
    number: blockNumber,
    numberHex: block.number,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: block.timestamp,
    miner: block.miner,
    difficulty: block.difficulty,
    gasLimit: block.gasLimit,
    gasUsed: block.gasUsed,
    baseFeePerGas: block.baseFeePerGas,
    transactionHashes,
    transactionCount: transactionHashes.length,
    indexedAt: now(),
  };
  store.lastIndexedBlock = blockNumber;
  store.lastIndexedHash = block.hash;
  saveStore();

  console.log(
    JSON.stringify({
      event: "block_indexed",
      chainId: network.chainId,
      number: blockNumber,
      hash: block.hash,
      transactionCount: transactionHashes.length,
    }),
  );
}

let polling = false;

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const latestHex = await rpc<string>("eth_blockNumber");
    const latest = Number(BigInt(latestHex));

    if (latest < store.lastIndexedBlock) {
      store = emptyStore();
      saveStore();
    }

    for (let blockNumber = store.lastIndexedBlock + 1; blockNumber <= latest; blockNumber++) {
      await indexBlock(blockNumber);
    }
  } finally {
    polling = false;
  }
}

function recentBlocks(limit: number) {
  return Object.values(store.blocks)
    .sort((a, b) => b.number - a.number)
    .slice(0, limit);
}

function recentEvents(limit: number, type?: string) {
  return Object.values(store.events)
    .filter((event) => !type || event.type === type)
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
    .slice(0, limit);
}

function addressActivity(address: string) {
  const normalized = normalizeAddress(address);
  if (!normalized) return undefined;
  const record = store.addresses[normalized];
  if (!record) return { address: normalized, transactionHashes: [], eventIds: [], tags: [] };
  return {
    ...record,
    transactions: [...record.transactionHashes]
      .reverse()
      .map((hash) => store.transactions[hash.toLowerCase()])
      .filter(Boolean)
      .slice(0, 25),
    events: [...record.eventIds]
      .reverse()
      .map((id) => store.events[id])
      .filter(Boolean)
      .slice(0, 25),
  };
}

function eventTransaction(event: IndexedLog) {
  return store.transactions[event.transactionHash.toLowerCase()];
}

function eventBlock(event: IndexedLog) {
  return store.blocks[String(event.blockNumber)];
}

function uniqueProofEvents(events: Array<IndexedLog | undefined>) {
  const seen = new Set<string>();
  const result: IndexedLog[] = [];
  for (const event of events) {
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);
    result.push(event);
  }
  return result;
}

function eventEvidence(event: IndexedLog) {
  const block = eventBlock(event);
  const transaction = eventTransaction(event);
  return {
    id: event.id,
    type: event.type,
    emitter: event.address,
    blockNumber: event.blockNumber,
    blockHash: block?.hash,
    transactionHash: event.transactionHash,
    transactionIndex: transaction?.transactionIndex,
    logIndex: event.logIndex,
    eventTopic: event.topics[0],
    topics: event.topics,
    data: event.data,
    decoded: event.decoded,
    tags: event.tags,
  };
}

function transactionEvidence(transaction: IndexedTransaction | undefined) {
  if (!transaction) return undefined;
  const block = store.blocks[String(transaction.blockNumber)];
  return {
    hash: transaction.hash,
    blockNumber: transaction.blockNumber,
    blockHash: transaction.blockHash ?? block?.hash,
    transactionIndex: transaction.transactionIndex,
    from: transaction.from,
    to: transaction.to,
    value: transaction.value,
    input: transaction.input,
    status: transaction.status,
    gasUsed: transaction.gasUsed,
    contractAddress: transaction.contractAddress,
    tags: transaction.tags,
  };
}

function blockEvidence(block: IndexedBlock | undefined) {
  if (!block) return undefined;
  return {
    number: block.number,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: block.timestamp,
    miner: block.miner,
    transactionCount: block.transactionCount,
  };
}

function proofBundle(params: {
  proofType: string;
  subject: string;
  summary: Record<string, unknown>;
  events?: IndexedLog[];
  transactions?: Array<IndexedTransaction | undefined>;
  blocks?: Array<IndexedBlock | undefined>;
}) {
  const events = uniqueProofEvents(params.events ?? []);
  const eventTransactions = events.map(eventTransaction);
  const allTransactions = [
    ...(params.transactions ?? []),
    ...eventTransactions,
  ].filter(Boolean) as IndexedTransaction[];
  const transactions = [...new Map(allTransactions.map((transaction) => [transaction.hash, transaction])).values()];
  const blocks = [
    ...new Map(
      [
        ...events.map(eventBlock),
        ...transactions.map((transaction) => store.blocks[String(transaction.blockNumber)]),
        ...(params.blocks ?? []),
      ]
        .filter(Boolean)
        .map((block) => [(block as IndexedBlock).number, block as IndexedBlock]),
    ).values(),
  ].sort((a, b) => a.number - b.number);

  return {
    proofBundleVersion,
    generatedAt: now(),
    chain: {
      name: network.name,
      chainId: network.chainId,
      nativeCurrency: network.nativeCurrency,
    },
    exactClaim,
    compatibilityBoundary,
    proofType: params.proofType,
    subject: params.subject,
    summary: params.summary,
    evidence: {
      blocks: blocks.map(blockEvidence),
      transactions: transactions.map(transactionEvidence),
      events: events.map(eventEvidence),
    },
  };
}

function sortedProofEvents(types: string[]) {
  return Object.values(store.events)
    .filter((event) => types.includes(event.type))
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

function pqAccountProofs() {
  const accounts = new Map<
    string,
    {
      address: string;
      pqPublicKeyCommitment?: string;
      created?: IndexedLog;
      executions: IndexedLog[];
      rotations: IndexedLog[];
      actionCount: number;
      firstBlock?: number;
      lastBlock?: number;
    }
  >();

  function account(address: string | undefined) {
    const normalized = normalizeAddress(address);
    if (!normalized) return undefined;
    const current =
      accounts.get(normalized) ??
      {
        address: normalized,
        executions: [],
        rotations: [],
        actionCount: 0,
      };
    accounts.set(normalized, current);
    return current;
  }

  for (const event of sortedProofEvents(["AccountCreated", "ExecutedPQ", "PQKeyRotated"]).reverse()) {
    const address = event.type === "AccountCreated" ? event.decoded?.account : event.address;
    const proof = account(address);
    if (!proof) continue;

    proof.actionCount++;
    proof.firstBlock = proof.firstBlock === undefined ? event.blockNumber : Math.min(proof.firstBlock, event.blockNumber);
    proof.lastBlock = proof.lastBlock === undefined ? event.blockNumber : Math.max(proof.lastBlock, event.blockNumber);

    if (event.type === "AccountCreated") {
      proof.created = event;
      proof.pqPublicKeyCommitment = event.decoded?.pqPublicKeyCommitment;
    }
    if (event.type === "ExecutedPQ") proof.executions.push(event);
    if (event.type === "PQKeyRotated") {
      proof.rotations.push(event);
      proof.pqPublicKeyCommitment = event.decoded?.newPublicKeyCommitment ?? proof.pqPublicKeyCommitment;
    }
  }

  const list = [...accounts.values()]
    .map((proof) => ({
      ...proof,
      executions: proof.executions.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex),
      rotations: proof.rotations.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex),
    }))
    .sort((a, b) => (b.lastBlock ?? -1) - (a.lastBlock ?? -1));

  return {
    exactClaim,
    claim: "Default Qubitor Accounts require ML-DSA authorization for executePQ and rotatePQKey.",
    accounts: list,
  };
}

function pqAccountProof(address: string) {
  const normalized = normalizeAddress(address);
  if (!normalized) return undefined;
  return pqAccountProofs().accounts.find((proof) => proof.address === normalized);
}

function pqAccountProofBundle(address: string) {
  const account = pqAccountProof(address);
  if (!account) return undefined;
  const events = uniqueProofEvents([account.created, ...account.executions, ...account.rotations]);
  return proofBundle({
    proofType: "pq-account",
    subject: account.address,
    summary: {
      account: account.address,
      pqPublicKeyCommitment: account.pqPublicKeyCommitment,
      created: Boolean(account.created),
      executePQCount: account.executions.length,
      rotationCount: account.rotations.length,
      pqRequired: true,
      ecdsaControl: false,
      claim: "Default Qubitor Accounts require ML-DSA authorization for executePQ and rotatePQKey.",
    },
    events,
  });
}

function faucetProofs() {
  const topUps = sortedProofEvents(["TreasuryTransferred"]).filter(
    (event) => normalizeAddress(event.decoded?.target) === faucetAddress,
  );
  const priorPoWRewardBlock = (claimBlockNumber: number) =>
    Object.values(store.blocks)
      .filter((block) => normalizeAddress(block.miner) === faucetAddress && block.number <= claimBlockNumber)
      .sort((a, b) => b.number - a.number)[0];
  const claims = Object.values(store.transactions)
    .filter((tx) => isFaucetClaim(tx))
    .sort((a, b) => b.blockNumber - a.blockNumber || (b.transactionIndex ?? 0) - (a.transactionIndex ?? 0))
    .map((tx) => {
      const topUp = topUps.find((event) => event.blockNumber <= tx.blockNumber);
      const powRewardBlock = topUp ? undefined : priorPoWRewardBlock(tx.blockNumber);
      return {
        txHash: tx.hash,
        blockNumber: tx.blockNumber,
        recipient: tx.to,
        amountWei: tx.value,
        status: tx.status,
        hasPriorPQTreasuryTopUp: Boolean(topUp),
        hasPriorPoWMinerReward: Boolean(powRewardBlock),
        treasuryFundingSource: topUp
          ? "pq-admin-treasury-top-up"
          : powRewardBlock
            ? "pow-miner-rewards-to-pq-treasury"
            : "unproven",
        pqTreasuryTopUp: topUp,
        pqMinerRewardBlock: powRewardBlock,
      };
    });

  return {
    faucetAddress,
    exactClaim,
    claimCount: claims.length,
    pqTreasuryTopUpCount: topUps.length,
    hasPQTreasuryTopUp: topUps.length > 0,
    boundary:
      "Faucet claims are native QubitorPQTxV1 transfers from the PQ faucet treasury; treasury funding can be proven by PQ-controlled QubitorAdminVault top-ups or PoW rewards mined directly to the PQ treasury.",
    claims,
    treasuryTopUps: topUps,
  };
}

function faucetClaimProof(txHash: string) {
  const normalized = txHash.toLowerCase();
  return faucetProofs().claims.find((claim) => claim.txHash.toLowerCase() === normalized);
}

function faucetClaimProofBundle(txHash: string) {
  const claim = faucetClaimProof(txHash);
  if (!claim) return undefined;
  const claimTx = store.transactions[claim.txHash.toLowerCase()];
  const topUp = claim.pqTreasuryTopUp;
  const rewardBlock = claim.pqMinerRewardBlock;
  return proofBundle({
    proofType: "faucet-claim",
    subject: claim.txHash,
    summary: {
      faucetAddress,
      recipient: claim.recipient,
      amountWei: claim.amountWei,
      claimTransactionHash: claim.txHash,
      hasPriorPQTreasuryTopUp: claim.hasPriorPQTreasuryTopUp,
      hasPriorPoWMinerReward: claim.hasPriorPoWMinerReward,
      treasuryFundingSource: claim.treasuryFundingSource,
      minerEtherbase: faucetAddress,
      minerRewardBlockNumber: rewardBlock?.number,
      compatibilityMode: false,
      signerMode: "PQ Native",
      boundary:
        "Faucet claims are native QubitorPQTxV1 transfers; treasury funding evidence is PQ-admin top-up or PoW rewards to the PQ treasury.",
    },
    transactions: [claimTx],
    events: topUp ? [topUp] : [],
    blocks: rewardBlock ? [rewardBlock] : [],
  });
}

function adminVaultProofs() {
  const vaults = new Map<
    string,
    {
      vault: string;
      controller?: string;
      actions: IndexedLog[];
      actionCount: number;
      firstBlock?: number;
      lastBlock?: number;
      legacyEOAControl: false;
      boundary: string;
    }
  >();

  for (const event of sortedProofEvents(["TreasuryReceived", "TreasuryTransferred", "PolicyRecorded"]).reverse()) {
    const vault = normalizeAddress(event.address);
    if (!vault) continue;
    const proof =
      vaults.get(vault) ??
      {
        vault,
        actions: [],
        actionCount: 0,
        legacyEOAControl: false as const,
        boundary:
          "Legacy EOA cannot control this vault directly; QubitorAdminVault privileged actions require the PQ controller account.",
      };
    proof.actions.push(event);
    proof.actionCount++;
    proof.firstBlock = proof.firstBlock === undefined ? event.blockNumber : Math.min(proof.firstBlock, event.blockNumber);
    proof.lastBlock = proof.lastBlock === undefined ? event.blockNumber : Math.max(proof.lastBlock, event.blockNumber);
    proof.controller = event.decoded?.controller ?? proof.controller;
    vaults.set(vault, proof);
  }

  return {
    exactClaim,
    boundary:
      "Legacy EOA cannot control this vault directly; acceptance verifies direct Legacy EOA policy calls revert before PQ-authorized actions succeed.",
    vaults: [...vaults.values()]
      .map((proof) => ({
        ...proof,
        actions: proof.actions.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex),
      }))
      .sort((a, b) => (b.lastBlock ?? -1) - (a.lastBlock ?? -1)),
  };
}

function adminVaultProof(vaultAddress: string) {
  const normalized = normalizeAddress(vaultAddress);
  if (!normalized) return undefined;
  return adminVaultProofs().vaults.find((proof) => proof.vault === normalized);
}

function adminVaultProofBundle(vaultAddress: string) {
  const vault = adminVaultProof(vaultAddress);
  if (!vault) return undefined;
  return proofBundle({
    proofType: "admin-vault",
    subject: vault.vault,
    summary: {
      vault: vault.vault,
      pqController: vault.controller,
      actionCount: vault.actionCount,
      hasPolicyRecorded: vault.actions.some((event) => event.type === "PolicyRecorded"),
      hasTreasuryTransferred: vault.actions.some((event) => event.type === "TreasuryTransferred"),
      legacyEOAControl: false,
      boundary: vault.boundary,
    },
    events: vault.actions,
  });
}

function status() {
  return {
    ok: true,
    network: networkName,
    chainId: network.chainId,
    rpcUrl,
    storeFile,
    pollMs,
    lastIndexedBlock: store.lastIndexedBlock,
    lastIndexedHash: store.lastIndexedHash,
    indexedBlockCount: Object.keys(store.blocks).length,
    transactionCount: Object.keys(store.transactions).length,
    eventCount: Object.keys(store.events).length,
    addressCount: Object.keys(store.addresses).length,
    updatedAt: store.updatedAt,
  };
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload));
}

function sendProofBundle(response: http.ServerResponse, filename: string, payload: unknown) {
  response.writeHead(200, {
    "content-type": "application/json",
    "content-disposition": `attachment; filename="${filename}"`,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload, null, 2));
}

const server = http.createServer((request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method not allowed" });
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (url.pathname === "/health" || url.pathname === "/indexer/status") {
    sendJson(response, 200, status());
    return;
  }

  if (url.pathname === "/blocks") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 100);
    sendJson(response, 200, { blocks: recentBlocks(limit) });
    return;
  }

  if (url.pathname.startsWith("/block/")) {
    const blockNumber = url.pathname.split("/").pop() ?? "";
    const block = store.blocks[blockNumber];
    sendJson(response, block ? 200 : 404, block ? { block } : { error: "block not indexed" });
    return;
  }

  if (url.pathname.startsWith("/tx/")) {
    const hash = (url.pathname.split("/").pop() ?? "").toLowerCase();
    const transaction = store.transactions[hash];
    sendJson(response, transaction ? 200 : 404, transaction ? { transaction } : { error: "transaction not indexed" });
    return;
  }

  if (url.pathname.startsWith("/address/")) {
    const address = url.pathname.split("/").pop() ?? "";
    const activity = addressActivity(address);
    sendJson(response, activity ? 200 : 400, activity ?? { error: "valid 0x address required" });
    return;
  }

  if (url.pathname === "/events") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);
    const type = url.searchParams.get("type") ?? undefined;
    sendJson(response, 200, { events: recentEvents(limit, type) });
    return;
  }

  if (url.pathname === "/proofs/pq-accounts") {
    sendJson(response, 200, pqAccountProofs());
    return;
  }

  if (url.pathname.startsWith("/proofs/pq-accounts/")) {
    const address = url.pathname.split("/").pop() ?? "";
    const proof = pqAccountProof(address);
    if (!proof) {
      sendJson(response, 404, { error: "PQ account proof not indexed" });
      return;
    }
    const bundle = pqAccountProofBundle(address);
    if (url.searchParams.get("bundle") === "1" && bundle) {
      sendProofBundle(response, `qbt-pq-account-${proof.address}.json`, bundle);
      return;
    }
    sendJson(response, 200, { account: proof, bundle });
    return;
  }

  if (url.pathname === "/proofs/faucet") {
    sendJson(response, 200, faucetProofs());
    return;
  }

  if (url.pathname.startsWith("/proofs/faucet/")) {
    const txHash = url.pathname.split("/").pop() ?? "";
    const proof = faucetClaimProof(txHash);
    if (!proof) {
      sendJson(response, 404, { error: "faucet claim proof not indexed" });
      return;
    }
    const bundle = faucetClaimProofBundle(txHash);
    if (url.searchParams.get("bundle") === "1" && bundle) {
      sendProofBundle(response, `qbt-faucet-claim-${proof.txHash}.json`, bundle);
      return;
    }
    sendJson(response, 200, { claim: proof, bundle });
    return;
  }

  if (url.pathname === "/proofs/admin-vaults") {
    sendJson(response, 200, adminVaultProofs());
    return;
  }

  if (url.pathname.startsWith("/proofs/admin-vaults/")) {
    const vaultAddress = url.pathname.split("/").pop() ?? "";
    const proof = adminVaultProof(vaultAddress);
    if (!proof) {
      sendJson(response, 404, { error: "admin vault proof not indexed" });
      return;
    }
    const bundle = adminVaultProofBundle(vaultAddress);
    if (url.searchParams.get("bundle") === "1" && bundle) {
      sendProofBundle(response, `qbt-admin-vault-${proof.vault}.json`, bundle);
      return;
    }
    sendJson(response, 200, { vault: proof, bundle });
    return;
  }

  sendJson(response, 404, { error: "not found" });
});

mkdirSync(dataDir, { recursive: true });
server.listen(port, () => {
  console.log(`[qubitor-indexer] listening on http://127.0.0.1:${port}`);
  console.log(`[qubitor-indexer] polling ${rpcUrl} every ${pollMs}ms`);
});

setInterval(() => {
  void poll().catch((error) => {
    console.error(`[qubitor-indexer] ${error instanceof Error ? error.message : String(error)}`);
  });
}, pollMs);

void poll().catch((error) => {
  console.error(`[qubitor-indexer] ${error instanceof Error ? error.message : String(error)}`);
});
