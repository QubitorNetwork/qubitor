import assert from "node:assert/strict";
import { qubitorAdminControlSurfaces, qubitorDevnet } from "@qubitor/chain-config";

assert.equal(qubitorDevnet.chainId, 91337);
assert.equal(qubitorAdminControlSurfaces.some((surface) => surface.id === "pq-native-faucet-treasury"), true);
assert.equal(qubitorAdminControlSurfaces.some((surface) => surface.id === "faucet-gas-payer"), false);
console.log("@qubitor/rpc-gateway tests passed");
