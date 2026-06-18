# Qubitor Testnet Break-Glass Reset

This page is not part of normal testnet operations.

The live testnet policy is:

- Do not delete chain data.
- Do not reset the chain.
- Do not rewrite history.
- Do not replace genesis.
- Do not wipe node data.

The historical reset script remains in the repository only as an emergency
break-glass artifact for a non-mainnet disaster recovery scenario. It must not
be run during routine hardening, public RPC changes, bridge updates, explorer
updates, or docs updates.

Before any emergency reset is even considered, capture:

- current head and genesis hash from primary and secondary RPCs
- recent snapshots from both hosts
- bridge relayer/indexer state
- public incident note draft
- explicit written operator approval outside the normal deploy flow

The normal way to ship testnet code is a no-reset deploy:

```sh
pnpm testnet:deploy-safety
pnpm testnet:ops-code:sync
pnpm testnet:ops-code:restart-rpc
```

For RPC hardening, use:

```sh
pnpm testnet:ops-code:deploy-rpc-hardening
```
