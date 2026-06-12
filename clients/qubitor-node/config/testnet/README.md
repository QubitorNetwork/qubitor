# Qubitor Public Testnet Config

This directory contains the public Qubitor testnet configuration used by miners and node operators.

- chain ID/network ID: `91338`
- native gas symbol: `QBT`
- gas limit: `30,000,000`
- genesis hash: `0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483`
- genesis state root: `0x4cda2dc185c118e0ad007fafd411239e1297d93036db925da306685e502bb478`
- EIP-155/London-era behavior from genesis
- Ethash-style PoW config for the Qubitor CoreGeth fork
- deterministic devnet accounts are not pre-funded

The ML-DSA-65 verifier precompile is:

```text
0x0000000000000000000000000000000000000100
```

The local CoreGeth fork registers that precompile on chain ID `91338`.

The public bootnodes are listed in `bootnodes.json` as full `enode://` URLs. Miners need the full enode, not just the DNS hostname, because the node ID is part of the devp2p peer address.

Before running a node, initialize a fresh data directory with this genesis file and start CoreGeth with network ID `91338` and the published bootnodes:

```sh
geth init --datadir=/path/to/qubitor-testnet-data clients/qubitor-node/config/testnet/genesis.json
```

Then verify your local block 0 hash matches the public testnet:

```sh
curl -s http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0",false]}'
```

Run the launch preflight before publishing a new testnet config:

```sh
pnpm testnet:launch-preflight
```

Use `pnpm testnet:material:generate` with `QUBITOR_BOOTNODE_PUBLIC_HOSTS` to create a launch manifest for multiple bootnodes. Public preflight rejects private advertised hosts and duplicate `enode://` host/port endpoints.
