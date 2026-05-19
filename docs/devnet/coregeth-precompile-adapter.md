# CoreGeth ML-DSA Precompile Adapter

Qubitor reserves this precompile:

```text
0x0000000000000000000000000000000000000100
```

The first implementation is registered directly inside the local CoreGeth fork:

```text
clients/qubitor-node/coregeth/core/vm/contracts_qubitor.go
```

It uses Cloudflare CIRCL ML-DSA-65:

```text
github.com/cloudflare/circl/sign/mldsa/mldsa65
```

The precompile input is raw ABI data, without a function selector:

```solidity
abi.encode(bytes publicKey, bytes message, bytes context, bytes signature)
```

The output is:

```solidity
abi.encode(bool valid)
```

Gas pricing is intentionally conservative for the first devnet: one verification costs `250000` gas. Before public testnet, benchmark ML-DSA-65 verification on target node hardware and replace the fixed devnet cost with a documented gas model.

## Tests

```sh
pnpm coregeth:test
```

This covers:

- valid and invalid real ML-DSA-65 signatures
- malformed ABI input returning `false`
- registration only on Qubitor devnet chain ID `91337`

## Acceptance Check

After the local binary is built:

1. Start the Qubitor devnet.
2. Deploy `QubitorAccountFactory`.
3. Create an account with an ML-DSA-65 public key.
4. Sign `executeMessage(...)` with the matching private key.
5. Call `executePQ(...)`.
6. Confirm the transaction succeeds and a replay with the same nonce fails.
