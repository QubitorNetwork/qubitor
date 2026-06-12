# Qubitor Mainnet Readiness Dashboard

Generated: 2026-06-10T23:19:19.013Z

Hard rule: no live chain deletion, reset, rewrite, genesis replacement, or node-data wipe was performed by this dashboard.

Overall status: **Red**

| Area | Status | Detail |
| --- | --- | --- |
| Public RPC | Green | Primary block 118982, secondary block 118982, privileged namespaces blocked |
| Peer and miner diversity | Green | Policy satisfied across 2 endpoint(s) |
| Bridge API | Green | API online=true, noWQBT=true |
| Bridge soak | Green | 20/20 runs passed, 0 failures |
| Sepolia ownership proof | Red | fewer than 3 Safe owners configured |
| Refund operations | Green | Refund runbook exists |
| Firewall/public surface | Green | Public surface doc exists |
| External audits | Red | External audits are still required before mainnet launch |

## Evidence

- Primary genesis: `0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483`
- Secondary genesis: `0x8c422f1572daf17ff4b699c98db0b1d72a71bf9ef0f8cb926b1a15b4a3f33483`
- Latest bridge soak: `qubitor-bridge/artifacts/testnet/bridge-soak/bridge-soak-2026-06-09T16-51-18-363Z.json`
- Bridge API: `https://api.0xq.app`
- Sepolia liquidity available: `9909944978000000000000`

## Peer And Miner Snapshot

```json
{
  "ok": true,
  "checkedAt": "2026-06-10T23:19:17.522Z",
  "policy": {
    "sampleBlocks": 120,
    "minPeerCount": 2,
    "minDistinctMiners": 2,
    "maxHeightLag": 12,
    "warnOnly": true
  },
  "endpoints": [
    {
      "url": "https://testrpc.qubitor.org/rpc",
      "chainId": "0x164ca",
      "blockNumber": 118982,
      "peerCount": 2,
      "hashrate": "0",
      "mining": true,
      "miningStatus": {
        "profile": "testnet",
        "network": "Qubitor Testnet",
        "chainId": 91338,
        "targetBlockTimeSeconds": 12,
        "blockNumber": "0x1d0c6",
        "mining": true,
        "hashrate": "0x0",
        "peerCount": "0x2"
      },
      "recentMinerCount": 2,
      "recentMiners": [
        "0x133bee9f2f023a2d97e5fafff945aa76de7e64d9",
        "0x6c0f8ab07f1f08429fe9e08b51e8099b73458125"
      ],
      "heightLag": 4
    },
    {
      "url": "https://testrpc2.qubitor.org/rpc",
      "chainId": "0x164ca",
      "blockNumber": 118986,
      "peerCount": 2,
      "hashrate": "0",
      "mining": true,
      "miningStatus": {
        "profile": "testnet",
        "network": "Qubitor Testnet",
        "chainId": 91338,
        "targetBlockTimeSeconds": 12,
        "blockNumber": "0x1d0ca",
        "mining": true,
        "hashrate": "0x0",
        "peerCount": "0x2"
      },
      "recentMinerCount": 2,
      "recentMiners": [
        "0x133bee9f2f023a2d97e5fafff945aa76de7e64d9",
        "0x6c0f8ab07f1f08429fe9e08b51e8099b73458125"
      ],
      "heightLag": 0
    }
  ],
  "warnings": [],
  "failures": []
}
```

## Remaining Launch Blockers

- Sepolia ownership proof: fewer than 3 Safe owners configured
- External audits: External audits are still required before mainnet launch
