# @qubitor/chain-config

Shared Qubitor chain metadata for wallets, apps, services, faucets, explorers, and SDK consumers.

```ts
import { qubitorTestnet, walletAddEthereumChainParams } from "@qubitor/chain-config";

console.log(qubitorTestnet.chainId);
console.log(qubitorTestnet.rpcUrls[0]);
console.log(walletAddEthereumChainParams(qubitorTestnet));
```

This package contains public network metadata only. Do not place production private keys, RPC secrets, server credentials, or deployer material here.

The package still exports known deterministic devnet compatibility keys for older local tooling. Those exports are deprecated and devnet-only; never use them on public testnet, mainnet, production services, or wallet flows.
