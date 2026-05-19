import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { qubitorDevnet } from "@qubitor/chain-config";

assert.equal(qubitorDevnet.name, "Qubitor Devnet");
const source = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
assert.match(source, /qubitor_getNetworkSecurityStatus/);
assert.match(source, /Default Account Control/);
assert.match(source, /Indexed Activity/);
assert.match(source, /Indexed Address Activity/);
assert.match(source, /PQ Account Proofs/);
assert.match(source, /Faucet Claims/);
assert.match(source, /PQ Admin Vault Proofs/);
assert.match(source, /Download JSON proof bundle/);
assert.match(source, /JSON Proof Bundle/);
assert.match(source, /Faucet Claim Proof/);
assert.match(source, /Legacy \/ compatibility or undeployed counterfactual/);
console.log("@qubitor/explorer-lite tests passed");
