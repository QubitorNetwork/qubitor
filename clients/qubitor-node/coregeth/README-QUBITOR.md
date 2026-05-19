# Qubitor CoreGeth Fork

This directory vendors CoreGeth `v1.12.22` with the first Qubitor-native EVM change:

- `core/vm/contracts_qubitor.go` adds `QBT_ML_DSA_65_VERIFY`
- the precompile address is `0x0000000000000000000000000000000000000100`
- the implementation uses Cloudflare CIRCL ML-DSA-65
- registration is gated to chain ID `91337`
- devnet verification gas is fixed at `250000`

Build the Qubitor node binary from the repo root:

```sh
pnpm coregeth:build
```

Run the targeted fork tests:

```sh
pnpm coregeth:test
```

The root devnet script uses `build/bin/qubitor-geth` automatically when it exists.
