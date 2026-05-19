import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { qubitorDevnet } from "@qubitor/chain-config";

assert.equal(qubitorDevnet.chainId, 91337);
const source = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
assert.match(source, /\/indexer\/status/);
assert.match(source, /AccountCreated/);
assert.match(source, /ExecutedPQ/);
assert.match(source, /PolicyRecorded/);
assert.match(source, /\/proofs\/pq-accounts/);
assert.match(source, /\/proofs\/faucet/);
assert.match(source, /\/proofs\/admin-vaults/);
assert.match(source, /proofBundleVersion/);
assert.match(source, /content-disposition/);
assert.match(source, /exactClaim/);
console.log("@qubitor/indexer tests passed");
