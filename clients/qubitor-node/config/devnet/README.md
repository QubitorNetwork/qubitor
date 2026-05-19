# Qubitor Devnet Genesis

This genesis config defines the local Qubitor PoW devnet:

- chain ID/network ID: `91337`
- native gas symbol: `QBT`
- gas limit: `30,000,000`
- EIP-155/London-era behavior from genesis
- Ethash-style PoW config for CoreGeth-family clients

The funded genesis account is the default PQ faucet/treasury Qubitor wallet address used by `services/faucet-api`:

```text
0x587292b9914D42FB8708bA2108e846609Ba23d89
```

The ML-DSA-65 verifier precompile is:

```text
0x0000000000000000000000000000000000000100
```

The local CoreGeth fork registers that precompile on chain ID `91337`. `pnpm devnet:pq-smoke` verifies it through a real Qubitor Account transaction.

The canonical account system contracts are installed directly in genesis:

```text
SecurityModeRegistry      0x0000000000000000000000000000000000000201
AccountReadinessRegistry  0x0000000000000000000000000000000000000202
QubitorAccountFactory     0x0000000000000000000000000000000000000203
```
