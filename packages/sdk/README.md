# @qubitor/sdk

Official TypeScript SDK for Qubitor developers.

The SDK exposes Qubitor network metadata, standard JSON-RPC helpers, QBT balance reads,
Qubitor account status reads, and PQ-native transaction helpers. It intentionally does
not include private keys, server env files, faucet seeds, relayer secrets, or testnet
launch artifacts.

The default testnet client uses `https://testrpc.qubitor.org/rpc`. The chain
metadata also includes `https://testrpc2.qubitor.org/rpc` as the secondary
public endpoint.

```ts
import {
  createQubitorClient,
  createPQAccount,
  getQbtBalance,
  sendPQTransaction,
} from "@qubitor/sdk";

const client = createQubitorClient({ networkName: "testnet" });

const account = createPQAccount();
const balance = await getQbtBalance(client, account.address);

const txHash = await sendPQTransaction(client, {
  nonce: await client.getTransactionCount(account.address),
  gasTipCap: 1_000_000_000n,
  gasFeeCap: 2_000_000_000n,
  gas: 21_000n,
  to: "0x000000000000000000000000000000000000dEaD",
  value: 1_000_000_000_000_000_000n,
  pqPublicKey: account.publicKey,
  pqPrivateKey: account.privateKey,
});

console.log(balance, txHash);
```

Default application flows should use Qubitor PQ accounts. Legacy EOA compatibility
should be labeled clearly by wallets and apps.
