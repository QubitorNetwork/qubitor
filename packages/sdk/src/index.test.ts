import assert from "node:assert/strict";
import {
  QUBITOR_DEVNET_PQ_SEED,
  QUBITOR_TESTNET_RPC_URL,
  QUBITOR_ZERO_HASH,
  createPQAccount,
  createQubitorClient,
  getQbtBalance,
  qubitorDevnet,
  qubitorMainnet,
  qubitorTestnet,
  sendPQTransaction,
  signPQTransaction,
  type Hex,
} from "./index.js";

const calls: Array<{ method: string; params: unknown[] }> = [];
const fetchMock = (async (_url: string | URL | Request, init?: RequestInit) => {
  const payload = JSON.parse(String(init?.body ?? "{}")) as { method: string; params?: unknown[] };
  calls.push({ method: payload.method, params: payload.params ?? [] });
  const resultByMethod: Record<string, unknown> = {
    eth_chainId: "0x164ca",
    eth_blockNumber: "0x2a",
    eth_getBalance: "0xde0b6b3a7640000",
    eth_getTransactionCount: "0x7",
    eth_getCode: "0x6000",
    eth_call: "0x01",
    eth_estimateGas: "0x5208",
    eth_getTransactionReceipt: null,
    qubitor_getAccountSecurityMode: { mode: "PQ Native" },
    qubitor_getAccountReadiness: { ready: true },
    qubitor_getSmartAccountDeploymentState: { deployed: true },
    qubitor_getMiningStatus: { mining: true },
    qubitor_getDifficulty: "0x100",
    qubitor_getHashrate: "0x200",
    qubitor_sendRawPQTransaction: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  return {
    ok: true,
    status: 200,
    async json() {
      return { jsonrpc: "2.0", id: 1, result: resultByMethod[payload.method] };
    },
  } as Response;
}) as typeof fetch;

const account = createPQAccount({ seed: QUBITOR_DEVNET_PQ_SEED, factorySalt: QUBITOR_ZERO_HASH });
assert.equal(account.address, "0x587292b9914D42FB8708bA2108e846609Ba23d89");

const client = createQubitorClient({
  network: qubitorTestnet,
  rpcUrl: "https://testrpc.qubitor.org/rpc",
  fetch: fetchMock,
});

assert.equal(client.network.chainId, 91338);
assert.equal(client.rpcUrl, "https://testrpc.qubitor.org/rpc");
assert.equal(createQubitorClient({ networkName: "devnet", fetch: fetchMock }).network.chainId, qubitorDevnet.chainId);
assert.equal(createQubitorClient({ networkName: "testnet", fetch: fetchMock }).rpcUrl, QUBITOR_TESTNET_RPC_URL);
assert.throws(
  () => createQubitorClient({ network: qubitorMainnet, fetch: fetchMock }),
  /no default Qubitor RPC URL configured/,
);
assert.equal(await client.getChainId(), 91338);
assert.equal(await client.assertChainId(), 91338);
assert.equal(await client.getBlockNumber(), 42n);
assert.equal(await getQbtBalance(client, account.address), 1_000_000_000_000_000_000n);
assert.equal(await client.getTransactionCount(account.address), 7n);
assert.equal(await client.getCode(account.address), "0x6000");
assert.equal(await client.call({ to: account.address, data: "0x" }), "0x01");
assert.equal(await client.estimateGas({ to: account.address, value: 1n }), 21_000n);
assert.deepEqual(await client.getAccountSecurityMode(account.address), { mode: "PQ Native" });
assert.deepEqual(await client.getAccountReadiness(account.address), { ready: true });
assert.deepEqual(await client.getSmartAccountDeploymentState(account.address), { deployed: true });
assert.deepEqual(await client.getMiningStatus(), { mining: true });
assert.equal(await client.getDifficulty(), "0x100");
assert.equal(await client.getHashrate(), "0x200");

const signed = signPQTransaction(client, {
  nonce: 0,
  gasTipCap: 1,
  gasFeeCap: 2,
  gas: 21_000,
  to: "0x000000000000000000000000000000000000dEaD" as Hex,
  value: 1,
  pqPublicKey: account.publicKey,
  pqPrivateKey: account.privateKey,
});
assert.equal(signed.transaction.chainId, 91338);
assert.equal(signed.rawTransaction.startsWith("0x04"), true);

const sent = await sendPQTransaction(client, {
  nonce: 1,
  gasTipCap: 1,
  gasFeeCap: 2,
  gas: 21_000,
  to: "0x000000000000000000000000000000000000dEaD" as Hex,
  value: 1,
  pqPublicKey: account.publicKey,
  pqPrivateKey: account.privateKey,
});
assert.equal(sent.transactionHash, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
assert.equal(calls.some((call) => call.method === "qubitor_sendRawPQTransaction"), true);

console.log("@qubitor/sdk tests passed");
