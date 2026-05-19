# Qubitor Testnet Launch Candidate

This directory is the public-testnet configuration boundary. It is not a live public network by itself.

- chain ID/network ID: `91338`
- native gas symbol: `QBT`
- gas limit: `30,000,000`
- EIP-155/London-era behavior from genesis
- Ethash-style PoW config for the Qubitor CoreGeth fork
- deterministic devnet accounts are not pre-funded

The ML-DSA-65 verifier precompile is:

```text
0x0000000000000000000000000000000000000100
```

The local CoreGeth fork registers that precompile on chain ID `91338`.

Before this config can be used for an announced public testnet, replace `bootnodes.json` with real `enode://` or `enr:` bootnodes, set unique testnet keys, set a PQ-controlled faucet treasury, and run:

```sh
pnpm testnet:launch-preflight
```

Use `pnpm testnet:material:generate` with `QUBITOR_BOOTNODE_PUBLIC_HOSTS` to create a launch manifest for multiple bootnodes. Public preflight rejects private advertised hosts and duplicate `enode://` host/port endpoints.
