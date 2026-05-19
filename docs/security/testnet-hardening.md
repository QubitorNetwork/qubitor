# Qubitor Testnet Hardening Handoff

Status date: 2026-05-15

## Live Testnet Surface

- Chain: Qubitor Testnet, chain ID `91338`.
- Public RPC/faucet/PQ submitter origin: `https://testrpc.qubitor.org`.
- Public explorer origin: `https://testexplorer.qubitor.org`.
- Primary node: `66.29.136.165`.
- Second bootnode: `66.29.128.164`.
- Active faucet/miner PQ treasury: `0x2Ba0a9Fd386F328819d0D866895B6495008b4030`.

## Completed Controls

- The live faucet/miner hot treasury was rotated to a fresh ML-DSA-65 seed and funded by native `QubitorPQTxV1`.
- `QUBITOR_EOA_TXS=0` remains active. A live public `eth_sendRawTransaction` EIP-1559 transaction was rejected with the expected `QUBITOR_EOA_TXS=0` error.
- Default wallet flow was smoke-tested through the public origin: faucet grant, Qubitor Account deployment, `PQ Native` readiness, and PQ-authorized transfer succeeded.
- A 12-iteration native PQ soak ran against the rotated treasury and advanced the chain by 16 blocks.
- Primary host Docker bindings now expose only `80/tcp`, `443/tcp`, and `30303/tcp+udp` publicly. Raw node RPC, WS, gateway, faucet, explorer, relayer, and indexer host ports bind to `127.0.0.1`.
- Second bootnode exposes only `30303/tcp+udp` publicly. RPC and WS bind to `127.0.0.1`.
- UFW and fail2ban are active on both Ubuntu servers.

## Evidence

- Latest verified proof pack: `artifacts/proofs/testnet/20260515T022217Z/`.
- Rotation funding transaction: `0x37d181526688dcc346be5032394c6d9b43e481711bffa5abca13f83097e6a854`.
- Public wallet smoke transactions:
  - faucet: `0x97b2dec4fa9097ed66f0c93ed18f54214bb83eb936fa78a0686cb833234a44b0`
  - deployment: `0x3fd20b831dd1a4aee3b54475c1c771c6741ba096b25bf547aded676c1c4e6964`
  - PQ transfer: `0x1146e007040dcbda1c5a7bc4762d52062146afd5ba7a0113d90203e81c9ec76e`
- Soak transactions ended with `0x5f356836fe692cf7c02c965b79273b23f09f2ab5db89048790257a9385607c5d`.

## Residual Blocker

`bootnode-2.testnet.qubitor.org` still resolves to `66.29.136.165` from public DNS. It must resolve to `66.29.128.164` before DNS-based bootnode discovery is considered correct.

## Security Boundary

The exact claim remains bounded and specific: breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts. This does not claim permanent cryptographic impossibility; it means default account control and demonstrated admin-control paths require ML-DSA authorization in the current Qubitor threat model.
