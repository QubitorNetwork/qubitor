# @qubitor/pq-native-tx

Qubitor PQ-native transaction helpers for developer tools, wallets, and backend services.

```ts
import {
  generateMLDSA65KeyPair,
  deriveQubitorPQAccountAddress,
  signQubitorPQTxV1,
} from "@qubitor/pq-native-tx";

const keyPair = generateMLDSA65KeyPair();
const from = deriveQubitorPQAccountAddress(keyPair.publicKey);

const signed = signQubitorPQTxV1({
  chainId: 91338,
  nonce: 0n,
  gasTipCap: 1_000_000_000n,
  gasFeeCap: 2_000_000_000n,
  gas: 21_000n,
  to: "0x0000000000000000000000000000000000000000",
  value: 0n,
  data: "0x",
  pqPublicKey: keyPair.publicKey,
  pqPrivateKey: keyPair.privateKey,
});

console.log(from, signed.rawTransaction);
```

Keep private keys and PQ seeds outside source control. This package exposes primitives; applications remain responsible for key storage, user consent, transaction simulation, and policy checks.
