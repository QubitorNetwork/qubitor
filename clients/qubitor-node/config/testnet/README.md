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
The DNS enodes are the public defaults. The manifest also keeps IP enodes as
fallback values for debugging DNS issues.

The public Docker image is:

```sh
docker pull qubitor/qubitor-geth:testnet
docker run --rm qubitor/qubitor-geth:testnet version
```

Before running a node, initialize a fresh data directory with this genesis file and start CoreGeth with network ID `91338` and the published bootnodes:

```sh
geth init --datadir=/path/to/qubitor-testnet-data clients/qubitor-node/config/testnet/genesis.json
```

Or with the Docker image from the repository root:

```sh
docker run --rm \
  -v "$PWD/clients/qubitor-node/config/testnet/genesis.json:/genesis.json:ro" \
  -v "$HOME/.qubitor-testnet:/data" \
  qubitor/qubitor-geth:testnet \
  init --datadir /data /genesis.json
```

Then verify your local block 0 hash matches the public testnet:

```sh
curl -s http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0",false]}'
```

Start new nodes in sync-only mode first. Before enabling mining, verify:

- block 0 hash is `0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483`
- `net_peerCount` is at least `0x1`
- a recent local block hash matches the same block from `https://testrpc.qubitor.org/rpc`

Mining with zero Qubitor peers creates a private fork and does not earn valid
public testnet rewards.

For node environments, keep the official enodes in `QUBITOR_REQUIRED_PEERS`:

```env
QUBITOR_REQUIRED_PEERS=enode://39214e35a86ef628de4c359aa5778c9baa0c053f95886d215d8f51d4f17151a02af63f187fce06083fe5e0b151a9e3a2accc71d1312d72d2a989facf66e5012c@bootnode-1.testnet.qubitor.org:30303,enode://59b33be8ed0165c35f508971e7d08c84168d1d8f8e9927bf332c19b4b0d0275ee758c883b035a2271395c7cf968a582f6e59f407fcaa1c6b7ee84001d96b4a10@bootnode-2.testnet.qubitor.org:30303
QUBITOR_MIN_PEERS_BEFORE_MINE=1
```

Start in sync-only mode:

```sh
docker run --rm -it \
  -p 8545:8545 \
  -p 30303:30303/tcp \
  -p 30303:30303/udp \
  -v "$HOME/.qubitor-testnet:/data" \
  qubitor/qubitor-geth:testnet \
  --datadir /data \
  --networkid 91338 \
  --bootnodes "$QUBITOR_REQUIRED_PEERS" \
  --http \
  --http.addr 0.0.0.0 \
  --http.api eth,net,web3 \
  --syncmode snap \
  --maxpeers 50
```

Only after sync and peer checks pass, restart with mining enabled and set
`--miner.etherbase` to your Qubitor wallet reward address.

Run the launch preflight before publishing a new testnet config:

```sh
pnpm testnet:launch-preflight
```

Use `pnpm testnet:material:generate` with `QUBITOR_BOOTNODE_PUBLIC_HOSTS` to create a launch manifest for multiple bootnodes. Public preflight rejects private advertised hosts and duplicate `enode://` host/port endpoints.
