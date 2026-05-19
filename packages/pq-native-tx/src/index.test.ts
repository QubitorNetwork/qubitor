import assert from "node:assert/strict";
import {
  QUBITOR_DEVNET_PQ_SEED,
  QUBITOR_PQ_TX_CONTEXT,
  QUBITOR_ZERO_HASH,
  deriveQubitorPQAccountAddress,
  generateMLDSA65KeyPair,
  hashQubitorPQTxV1,
  signQubitorPQTxV1,
  type Hex,
} from "./index.js";

const keypair = generateMLDSA65KeyPair(QUBITOR_DEVNET_PQ_SEED);
const account = deriveQubitorPQAccountAddress(keypair.publicKey, QUBITOR_ZERO_HASH);
assert.equal(account, "0x587292b9914D42FB8708bA2108e846609Ba23d89");

const target = "0x000000000000000000000000000000000000dEaD" as Hex;
const fixture = {
  chainId: 91337,
  nonce: 4,
  gasTipCap: 1,
  gasFeeCap: 10,
  gas: 50_000,
  factorySalt: "0x0000000000000000000000000000000000000000000000000000000000000042" as Hex,
  to: target,
  value: 123,
  data: "0x010203" as Hex,
  accessList: [
    {
      address: "0x0000000000000000000000000000000000000100" as Hex,
      storageKeys: ["0x0000000000000000000000000000000000000000000000000000000000000001" as Hex],
    },
  ],
  pqPublicKey: keypair.publicKey,
  pqContext: QUBITOR_PQ_TX_CONTEXT,
};

assert.equal(hashQubitorPQTxV1(fixture), "0x6f7486c08ca6bb33b20c0bdddcd22d86a25d67624298d4d66c8bb00333789b0b");

const signed = signQubitorPQTxV1({ ...fixture, pqPrivateKey: keypair.privateKey });
assert.equal(signed.signingHash, "0x6f7486c08ca6bb33b20c0bdddcd22d86a25d67624298d4d66c8bb00333789b0b");
assert.equal(signed.rawTransaction.startsWith("0x04"), true);
assert.equal((signed.signature.length - 2) / 2, 3309);

assert.throws(
  () =>
    signQubitorPQTxV1({
      ...fixture,
      account: "0x0000000000000000000000000000000000000001",
      pqPrivateKey: keypair.privateKey,
    }),
  /account must match/,
);

console.log("@qubitor/pq-native-tx tests passed");
