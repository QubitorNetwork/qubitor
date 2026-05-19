import assert from "node:assert/strict";
import { getConfiguredQubitorNetwork, qubitorDevnet } from "@qubitor/chain-config";
import { formatQbtAmount, renderFaucetPage } from "./faucet-page.js";

assert.equal(qubitorDevnet.nativeCurrency.symbol, "QBT");
assert.equal(getConfiguredQubitorNetwork("testnet").name, "Qubitor Testnet");
assert.equal(formatQbtAmount(1_000_000_000_000_000_000n), "1 QBT");
assert.equal(formatQbtAmount(1_500_000_000_000_000_000n), "1.5 QBT");

const faucetPage = renderFaucetPage({
  networkName: "Qubitor Testnet",
  chainId: 91338,
  rpcUrl: "https://testrpc.qubitor.org/rpc",
  explorerUrl: "https://testexplorer.qubitor.org",
  faucetAddress: "0x0000000000000000000000000000000000000303",
  amountWei: 1_000_000_000_000_000_000n,
  claimWindowMs: 60_000,
});
assert.match(faucetPage, /Qubitor Testnet Faucet/);
assert.match(faucetPage, /\/faucet\/request/);
assert.match(faucetPage, /https:\/\/testrpc\.qubitor\.org\/rpc/);
console.log("@qubitor/faucet-api tests passed");
