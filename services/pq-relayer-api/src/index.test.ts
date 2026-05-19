import assert from "node:assert/strict";
import { qubitorDevnet } from "@qubitor/chain-config";
import { parseRawPQTransactionRequest, parseRelayRequest, parseRotateRequest } from "./requests.js";

assert.equal(qubitorDevnet.chainId, 91337);

assert.throws(
  () =>
    parseRelayRequest({
      accountAddress: "0x0000000000000000000000000000000000000001",
      target: "0x000000000000000000000000000000000000dEaD",
      valueWei: "1",
      nonce: "0",
    }),
  /signature must be a 0x-prefixed hex string/,
);

const relay = parseRelayRequest({
  accountAddress: "0x0000000000000000000000000000000000000001",
  target: "0x000000000000000000000000000000000000dEaD",
  valueWei: "1",
  data: "0x",
  nonce: "0",
  signature: "0x1234",
});
assert.equal(relay.accountAddress, "0x0000000000000000000000000000000000000001");
assert.equal(relay.valueWei, 1n);
assert.equal(relay.signature, "0x1234");

const rotate = parseRotateRequest({
  accountAddress: "0x0000000000000000000000000000000000000001",
  newPublicKey: "0xabcd",
  nonce: "1",
  signature: "0x5678",
});
assert.equal(rotate.accountAddress, "0x0000000000000000000000000000000000000001");
assert.equal(rotate.newPublicKey, "0xabcd");
assert.equal(rotate.nonce, 1n);

const raw = parseRawPQTransactionRequest({
  rawTransaction: "0x04abcd",
  waitForReceipt: "false",
});
assert.equal(raw.rawTransaction, "0x04abcd");
assert.equal(raw.waitForReceipt, false);

console.log("@qubitor/pq-relayer-api tests passed");
