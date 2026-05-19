import assert from "node:assert/strict";
import { qubitorDevnet } from "@qubitor/chain-config";
import {
  type ProofBundle,
  ProofVerificationError,
  QUBITOR_COMPATIBILITY_BOUNDARY,
  QUBITOR_EVENT_TOPICS,
  QUBITOR_EXACT_CLAIM,
  PROOF_BUNDLE_VERSION,
  verifyProofBundle,
} from "./index.js";

const account = "0x1111111111111111111111111111111111111111";
const factory = "0x2222222222222222222222222222222222222222";
const target = "0x3333333333333333333333333333333333333333";
const tx1 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tx2 = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const block1 = "0x0101010101010101010101010101010101010101010101010101010101010101";
const block2 = "0x0202020202020202020202020202020202020202020202020202020202020202";
const commitment = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function topicAddress(address: string) {
  return `0x${"0".repeat(24)}${address.slice(2)}`;
}

const createdLog = {
  address: factory,
  topics: [QUBITOR_EVENT_TOPICS.AccountCreated, topicAddress(account), commitment],
  data: "0x" + "0".repeat(64),
  blockNumber: "0x1",
  blockHash: block1,
  transactionHash: tx1,
  transactionIndex: "0x0",
  logIndex: "0x0",
};

const executedLog = {
  address: account,
  topics: [QUBITOR_EVENT_TOPICS.ExecutedPQ, topicAddress(target)],
  data: "0x" + "0".repeat(64 * 3),
  blockNumber: "0x2",
  blockHash: block2,
  transactionHash: tx2,
  transactionIndex: "0x0",
  logIndex: "0x1",
};

const bundle: ProofBundle = {
  proofBundleVersion: PROOF_BUNDLE_VERSION,
  generatedAt: "2026-05-10T00:00:00.000Z",
  chain: {
    name: qubitorDevnet.name,
    chainId: qubitorDevnet.chainId,
    nativeCurrency: qubitorDevnet.nativeCurrency,
  },
  exactClaim: QUBITOR_EXACT_CLAIM,
  compatibilityBoundary: QUBITOR_COMPATIBILITY_BOUNDARY,
  proofType: "pq-account",
  subject: account,
  summary: {
    account,
    pqRequired: true,
    ecdsaControl: false,
    executePQCount: 1,
    rotationCount: 0,
  },
  evidence: {
    blocks: [
      { number: 1, hash: block1, parentHash: "0x" + "0".repeat(64), timestamp: "0x1", transactionCount: 1 },
      { number: 2, hash: block2, parentHash: block1, timestamp: "0x2", transactionCount: 1 },
    ],
    transactions: [
      {
        hash: tx1,
        blockNumber: 1,
        blockHash: block1,
        transactionIndex: 0,
        from: target,
        to: null,
        value: "0x0",
        input: "0x1234",
        status: "0x1",
        gasUsed: "0x5208",
        contractAddress: factory,
      },
      {
        hash: tx2,
        blockNumber: 2,
        blockHash: block2,
        transactionIndex: 0,
        from: target,
        to: account,
        value: "0x0",
        input: "0xaffdafad",
        status: "0x1",
        gasUsed: "0x5208",
        contractAddress: null,
      },
    ],
    events: [
      {
        id: `${tx1}:0`,
        type: "AccountCreated",
        emitter: factory,
        blockNumber: 1,
        blockHash: block1,
        transactionHash: tx1,
        transactionIndex: 0,
        logIndex: 0,
        eventTopic: QUBITOR_EVENT_TOPICS.AccountCreated,
        topics: createdLog.topics,
        data: createdLog.data,
        decoded: { account, pqPublicKeyCommitment: commitment },
      },
      {
        id: `${tx2}:1`,
        type: "ExecutedPQ",
        emitter: account,
        blockNumber: 2,
        blockHash: block2,
        transactionHash: tx2,
        transactionIndex: 0,
        logIndex: 1,
        eventTopic: QUBITOR_EVENT_TOPICS.ExecutedPQ,
        topics: executedLog.topics,
        data: executedLog.data,
        decoded: { target, value: "0", nonce: "0" },
      },
    ],
  },
};

const rpc = async <T>(method: string, params: unknown[] = []) => {
  const [param] = params;
  const result: Record<string, unknown> = {
    eth_chainId: `0x${qubitorDevnet.chainId.toString(16)}`,
    eth_getBlockByNumber:
      param === "0x1"
        ? {
            number: "0x1",
            hash: block1,
            parentHash: "0x" + "0".repeat(64),
            timestamp: "0x1",
            transactions: [tx1],
          }
        : {
            number: "0x2",
            hash: block2,
            parentHash: block1,
            timestamp: "0x2",
            transactions: [tx2],
          },
    eth_getTransactionByHash:
      param === tx1
        ? {
            hash: tx1,
            blockNumber: "0x1",
            blockHash: block1,
            transactionIndex: "0x0",
            from: target,
            to: null,
            value: "0x0",
            input: "0x1234",
          }
        : {
            hash: tx2,
            blockNumber: "0x2",
            blockHash: block2,
            transactionIndex: "0x0",
            from: target,
            to: account,
            value: "0x0",
            input: "0xaffdafad",
          },
    eth_getTransactionReceipt:
      param === tx1
        ? {
            transactionHash: tx1,
            blockNumber: "0x1",
            blockHash: block1,
            transactionIndex: "0x0",
            from: target,
            to: null,
            status: "0x1",
            gasUsed: "0x5208",
            contractAddress: factory,
            logs: [createdLog],
          }
        : {
            transactionHash: tx2,
            blockNumber: "0x2",
            blockHash: block2,
            transactionIndex: "0x0",
            from: target,
            to: account,
            status: "0x1",
            gasUsed: "0x5208",
            contractAddress: null,
            logs: [createdLog, executedLog],
          },
  };
  return result[method] as T;
};

const report = await verifyProofBundle(bundle, { rpc });
assert.equal(report.ok, true);
assert.equal(report.proofType, "pq-account");
assert.equal(report.eventCount, 2);

const tampered = structuredClone(bundle);
tampered.exactClaim = "ECDSA is good enough";
await assert.rejects(() => verifyProofBundle(tampered, { rpc }), ProofVerificationError);

console.log("@qubitor/proof-verifier tests passed");
