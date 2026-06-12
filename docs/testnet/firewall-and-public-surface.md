# Testnet Firewall And Public Surface

This page documents the intended public surface for Qubitor testnet operators. It is not a reset guide and must not be used to delete chain data, replace genesis, or reinitialize nodes.

## Intended Public Ports

Public testnet hosts should expose only:

| Port | Purpose |
| ---: | --- |
| `22/tcp` | SSH operator access, restricted by provider/firewall policy where possible |
| `80/tcp` | HTTP ACME challenge and redirect to HTTPS |
| `443/tcp` | Public HTTPS RPC, faucet/status, explorer, and public-safe status routes |
| `30303/tcp` | CoreGeth peer discovery/session traffic |
| `30303/udp` | CoreGeth discovery traffic |

Raw CoreGeth HTTP RPC must stay bound to loopback or a private network. Public users should reach Qubitor through the HTTPS gateway.

## Public Hostnames

| Hostname | Role |
| --- | --- |
| `testrpc.qubitor.org` | Primary public RPC gateway and public-safe chain/faucet/PQ routes |
| `testrpc2.qubitor.org` | Secondary public RPC gateway and public-safe chain/faucet/PQ routes |
| `testexplorer.qubitor.org` | Primary explorer |
| `testexplorer2.qubitor.org` | Secondary explorer |

Metrics, database ports, Redis, raw node admin RPC, Docker sockets, launch material, snapshots, and operator diagnostics must not be public.

## Host Checks

Run read-only checks:

```sh
ss -lntup
sudo ufw status verbose
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Expected public listeners are HTTP/HTTPS, SSH, and P2P. If Docker publishes a public port, UFW policy should either explicitly allow it or the Docker/UFW integration should be documented so operator expectations match actual exposure.

## Gateway Policy

The public RPC gateway must reject privileged namespaces before forwarding to CoreGeth:

```text
admin_*
debug_*
personal_*
miner_*
txpool_*
engine_*
```

Public health routes should expose only public metadata such as status, network, chain ID, block height, and genesis hash. They must not expose local paths, upstream internal URLs, launch material names, backup paths, node data paths, or service secrets.

## No-Reset Operations

Safe public-service deployments use:

```sh
pnpm testnet:deploy-safety
pnpm testnet:ops-code:deploy-rpc-hardening
pnpm testnet:ops-code:deploy
```

Those scripts sync code and restart only affected public services. They must not stop `qubitor-node`, run `geth init`, or touch `data/node/testnet`.
