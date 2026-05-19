# Qubitor Testnet Launch Material

Generate non-committed launch material for a bootnode/miner host:

```sh
pnpm testnet:material:generate
```

`.env.testnet.example` is only the local SSH/server-access template. Copy it to
`.env.testnet.local` or `.env.testnet`, set the Ubuntu SSH user, and leave
generated chain values out of it. Bootnode enodes, service wallets,
PQ faucet/miner wallet material, and runtime service values are generated on
the server. Both local filenames are ignored by git. The material generator
loads `.env.testnet` first, then `.env.testnet.local`, unless
`QUBITOR_TESTNET_SERVER_ENV_FILE` is set.

The generator writes under `artifacts/testnet/launch/<timestamp>/`:

- `.env.testnet.local` with generated runtime values, `QUBITOR_EOA_TXS=0`, and a hot PQ faucet seed for testnet only.
- `bootnodes.json` with generated `enode://` entries and a per-bootnode node inventory.
- `keys/bootnode-*.key` devp2p node keys.
- `pq-service-keys.json` for operator custody review. It contains PQ wallet material only; it does not contain EOA private keys.
- `node-env/bootnode-*.env` with node-specific `--nodekey` and P2P overrides. Source the matching file after `.env.testnet.local` on each bootnode host.

The generated env also sets `QUBITOR_P2P_TCP_PORT`, `QUBITOR_P2P_UDP_PORT`,
and `QUBITOR_P2P_NAT` for the first bootnode so Docker publishes the public
peer-discovery port. It keeps script paths repo-root relative and Docker bind
paths compose-file relative through `QUBITOR_GENESIS_HOST_FILE` and
`QUBITOR_NODEKEY_HOST_FILE`, so the same material can be synced to the Ubuntu
servers under `~/QubitorNetwork`.

By default the generator advertises `QUBITOR_TESTNET_SERVER_HOST` when it is set,
plus `QUBITOR_TESTNET_BOOTNODE_2_HOST` when that optional second server is set,
then `QUBITOR_BOOTNODE_PUBLIC_IP`, then `127.0.0.1`. You can also set
`QUBITOR_TESTNET_SERVER_HOSTS` or `QUBITOR_BOOTNODE_PUBLIC_HOSTS` as a
comma-separated host list. Public service URLs default to the Qubitor.org testnet
hostnames. The faucet treasury vault defaults to the generated PQ faucet address,
and the miner etherbase defaults to that same PQ address so PoW rewards fund the
faucet without an EOA bootstrap transfer. Local material is useful for host setup
but must not pass public launch preflight.

## Qubitor.org DNS

For the current two-server testnet, the wallet-facing public origin is one
Cloudflare-friendly hostname:

```text
testrpc.qubitor.org           A 66.29.136.165
testexplorer.qubitor.org      A 66.29.136.165
bootnode-1.testnet.qubitor.org A 66.29.136.165
bootnode-2.testnet.qubitor.org A 66.29.128.164
```

Cloudflare proxy rules matter here:

- `testrpc.qubitor.org` can stay orange-cloud proxied because it is covered by
  Cloudflare's normal `*.qubitor.org` edge certificate. The wallet uses
  `https://testrpc.qubitor.org/rpc` for JSON-RPC and the same origin for
  `/pq-dev/*` and `/faucet/*`.
- `testexplorer.qubitor.org` can also be proxied. It is optional for wallet
  operation.
- Nested service names such as `rpc.testnet.qubitor.org` require either DNS-only
  mode or a Cloudflare edge certificate for `*.testnet.qubitor.org`.
- Bootnode records must be **DNS only** unless Cloudflare Spectrum or another
  TCP/UDP proxy is configured for `30303/tcp` and `30303/udp`. Standard
  Cloudflare proxy does not carry Ethereum devp2p discovery traffic.

To order the Cloudflare edge certificate through the API, create a Cloudflare API
token with `SSL and Certificates Write` for the `qubitor.org` zone. Add
`Zone Read` too if you want the script to discover `CLOUDFLARE_ZONE_ID` by name.
Then run:

```sh
CLOUDFLARE_API_TOKEN=<token> \
CLOUDFLARE_ZONE_NAME=qubitor.org \
QUBITOR_CLOUDFLARE_CERT_HOSTS='qubitor.org,*.testnet.qubitor.org' \
pnpm testnet:cloudflare-cert -- order
```

Check issuance status with:

```sh
CLOUDFLARE_API_TOKEN=<token> \
CLOUDFLARE_ZONE_NAME=qubitor.org \
pnpm testnet:cloudflare-cert -- status
```

The public gateway also supports temporary aliases through
`QUBITOR_PUBLIC_RPC_ALIASES`, `QUBITOR_PUBLIC_EXPLORER_ALIASES`, and
`QUBITOR_PUBLIC_FAUCET_ALIASES`. Use those during DNS propagation so old
rehearsal URLs can keep working while the Qubitor.org names become live.

For a single public bootnode host:

```sh
QUBITOR_BOOTNODE_PUBLIC_IP=<public-ip> \
QUBITOR_PUBLIC_RPC_URL=https://testrpc.qubitor.org \
QUBITOR_PUBLIC_EXPLORER_URL=https://testexplorer.qubitor.org \
QUBITOR_PUBLIC_FAUCET_URL=https://testrpc.qubitor.org \
pnpm testnet:material:generate
```

## Dedicated Ubuntu Server

From your local machine, `.env.testnet.local` or `.env.testnet` is enough to open the SSH session.
For password auth, do not store the password in the env file; let SSH prompt for it:

```sh
set -a
source .env.testnet.local
set +a
ssh -p "$QUBITOR_TESTNET_SERVER_SSH_PORT" "$QUBITOR_TESTNET_SERVER_USER@$QUBITOR_TESTNET_SERVER_HOST"
```

If you named the file `.env.testnet`, source that file instead.

For key auth, add `QUBITOR_TESTNET_SERVER_SSH_KEY` and pass it to SSH:

```sh
ssh -i "$QUBITOR_TESTNET_SERVER_SSH_KEY" -p "$QUBITOR_TESTNET_SERVER_SSH_PORT" "$QUBITOR_TESTNET_SERVER_USER@$QUBITOR_TESTNET_SERVER_HOST"
```

For a second bootnode server, keep only that server's access values in the local
env:

```env
QUBITOR_TESTNET_BOOTNODE_2_HOST=<second-bootnode-ip-or-dns>
QUBITOR_TESTNET_BOOTNODE_2_USER=<second-bootnode-ssh-user>
QUBITOR_TESTNET_BOOTNODE_2_SSH_PORT=22
QUBITOR_TESTNET_BOOTNODE_2_AUTH=password
```

When `QUBITOR_TESTNET_BOOTNODE_2_HOST` is set, the generator creates two
bootnode records: `keys/bootnode-1.key` for `QUBITOR_TESTNET_SERVER_HOST` and
`keys/bootnode-2.key` for `QUBITOR_TESTNET_BOOTNODE_2_HOST`. The running node
must use the matching nodekey, so source `node-env/bootnode-1.env` on the first
server and `node-env/bootnode-2.env` on the second server after sourcing the
generated runtime env.

On a dedicated Ubuntu server, generate the launch material on that server so the bootnode key and advertised host match the machine that will run discovery:

```sh
cd /path/to/QubitorNetwork
QUBITOR_TESTNET_SERVER_HOST=66.29.136.165 \
QUBITOR_PUBLIC_RPC_URL=https://testrpc.qubitor.org \
QUBITOR_PUBLIC_EXPLORER_URL=https://testexplorer.qubitor.org \
QUBITOR_PUBLIC_FAUCET_URL=https://testrpc.qubitor.org \
pnpm testnet:material:generate
```

If you need to override the advertised bootnode address separately from the SSH
host, set `QUBITOR_BOOTNODE_PUBLIC_HOSTS` for that run.

For the two-server path using the local access env:

```sh
set -a
source .env.testnet.local
set +a
QUBITOR_BOOTNODE_MIN_COUNT=2 \
QUBITOR_PUBLIC_RPC_URL=https://testrpc.qubitor.org \
QUBITOR_PUBLIC_EXPLORER_URL=https://testexplorer.qubitor.org \
QUBITOR_PUBLIC_FAUCET_URL=https://testrpc.qubitor.org \
pnpm testnet:material:generate
```

Open the bootnode peer port publicly:

```sh
sudo ufw allow 30303/tcp
sudo ufw allow 30303/udp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Keep raw CoreGeth RPC bound to `127.0.0.1` unless you have a private network or firewall rule for it. Publish user-facing RPC through the gateway behind HTTPS. Launch material sets `QUBITOR_EOA_TXS=0`; do not remove it. Use `infra/docker-compose.public.yml` to publish HTTPS through Caddy; it routes `/pq-dev/*` on the RPC hostname to the raw PQ submit gateway.
It also routes `/faucet/*` on the RPC hostname to the faucet API, so `testrpc.qubitor.org` is enough for the wallet's read, faucet, and PQ transaction flows. For temporary rehearsals, keep old hostnames in the alias variables instead of making them the canonical public URLs.

When you generate the wallet-owned PQ vault from another machine, point the wallet CLI at the server's public PQ relayer and faucet URLs or use an SSH tunnel. For example, with an SSH tunnel:

```sh
ssh -N -L 18548:127.0.0.1:18548 -L 18546:127.0.0.1:18546 <user>@<server-public-ip-or-dns>
```

Then, from your local Qubitor wallet repo:

```sh
cd /path/to/Qubitor
EXPO_PUBLIC_QUBITOR_CHAIN_ID=91338 \
EXPO_PUBLIC_QUBITOR_FAUCET_URL=http://127.0.0.1:18546 \
EXPO_PUBLIC_QUBITOR_PQ_RELAYER_URL=http://127.0.0.1:18548 \
pnpm wallet:pq-vault:generate -- --deploy
```

For multiple bootnodes, pass a comma-separated host list. If one host is reused with `QUBITOR_BOOTNODE_COUNT>1`, the generator increments ports from the base port; if multiple hosts are supplied, the same default port can be reused on each host.

```sh
QUBITOR_BOOTNODE_PUBLIC_HOSTS=bootnode-1.testnet.qubitor.org,bootnode-2.testnet.qubitor.org \
QUBITOR_BOOTNODE_TCP_PORTS=30303,30303 \
QUBITOR_BOOTNODE_UDP_PORTS=30303,30303 \
QUBITOR_PUBLIC_RPC_URL=https://testrpc.qubitor.org \
QUBITOR_PUBLIC_EXPLORER_URL=https://testexplorer.qubitor.org \
QUBITOR_PUBLIC_FAUCET_URL=https://testrpc.qubitor.org \
pnpm testnet:material:generate
```

Then run:

```sh
QUBITOR_TESTNET_ENV_FILE=artifacts/testnet/launch/<timestamp>/.env.testnet.local pnpm testnet:launch-preflight
```

`QUBITOR_TESTNET_ENV_FILE` is for generated runtime env files, not the local
server-login env. Preflight and bootstrap only auto-load root env files when
they contain `QUBITOR_NETWORK=testnet`, which prevents a login-only
`.env.testnet` from being mistaken for chain runtime material.

For public launch rehearsals, set `QUBITOR_BOOTNODE_MIN_COUNT` to the number of bootnodes the release is required to have. Testnet can technically start with one bootnode, but two or three independent bootnodes make discovery failures much easier to diagnose before mainnet.

Because public testnet genesis has no pre-funded compatibility keys, start the node and let PoW rewards arrive at the generated PQ faucet/miner treasury. The bootstrap command only checks that the PQ miner/faucet treasury is funded; it performs no EOA transfers:

```sh
QUBITOR_TESTNET_ENV_FILE=artifacts/testnet/launch/<timestamp>/.env.testnet.local pnpm testnet:bootstrap-funds
```

If you override `QUBITOR_MINER_ETHERBASE` away from the generated faucet treasury, you must fund the faucet with a native PQ transaction before the faucet can serve requests.

Do not commit generated material. It contains hot testnet PQ material and node keys.
