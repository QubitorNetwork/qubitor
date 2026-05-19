import assert from "node:assert/strict";
import {
  QUBITOR_DEVNET_COMPAT_PRIVATE_KEY,
  QUBITOR_DEVNET_DEPLOYER_PRIVATE_KEY,
  QUBITOR_DEVNET_FAUCET_PRIVATE_KEY,
  QUBITOR_DEVNET_RELAYER_PRIVATE_KEY,
  QUBITOR_ACCOUNT_FACTORY,
  QUBITOR_ACCOUNT_READINESS_REGISTRY,
  QUBITOR_MLDSA65_PRECOMPILE,
  QUBITOR_SECURITY_MODE_REGISTRY,
  QUBITOR_TESTNET_EXPLORER_URL,
  QUBITOR_TESTNET_FAUCET_URL,
  QUBITOR_TESTNET_RPC_URL,
  assertDevnetCompatibilityKey,
  defaultQubitorExecutionRpcUrl,
  defaultQubitorRpcUrl,
  getConfiguredQubitorNetwork,
  getQubitorNetworkName,
  getQubitorNetworkByChainId,
  isKnownDevnetCompatibilityKey,
  isLocalRpcUrl,
  qubitorAdminControlSurfaces,
  qubitorDevnet,
  qubitorMainnet,
  qubitorTestnet,
  walletAddEthereumChainParams,
} from "./index.js";

assert.equal(qubitorDevnet.chainId, 91337);
assert.equal(qubitorDevnet.nativeCurrency.symbol, "QBT");
assert.equal(QUBITOR_MLDSA65_PRECOMPILE, "0x0000000000000000000000000000000000000100");
assert.equal(QUBITOR_SECURITY_MODE_REGISTRY, "0x0000000000000000000000000000000000000201");
assert.equal(QUBITOR_ACCOUNT_READINESS_REGISTRY, "0x0000000000000000000000000000000000000202");
assert.equal(QUBITOR_ACCOUNT_FACTORY, "0x0000000000000000000000000000000000000203");
assert.equal(qubitorDevnet.contracts.accountFactory, QUBITOR_ACCOUNT_FACTORY);
assert.equal(getQubitorNetworkByChainId(91337)?.name, "Qubitor Devnet");
assert.equal(getQubitorNetworkName(undefined), "devnet");
assert.equal(getQubitorNetworkName("testnet"), "testnet");
assert.equal(getConfiguredQubitorNetwork("testnet").chainId, 91338);
assert.equal(defaultQubitorRpcUrl(qubitorDevnet), "http://127.0.0.1:18545/rpc");
assert.equal(defaultQubitorExecutionRpcUrl(qubitorDevnet), "http://127.0.0.1:8545");
assert.equal(qubitorTestnet.rpcUrls[0], QUBITOR_TESTNET_RPC_URL);
assert.equal(qubitorTestnet.blockExplorerUrls[0], QUBITOR_TESTNET_EXPLORER_URL);
assert.equal(qubitorTestnet.faucetUrls[0], QUBITOR_TESTNET_FAUCET_URL);
assert.equal(defaultQubitorRpcUrl(qubitorTestnet), "https://testrpc.qubitor.org/rpc");
assert.equal(defaultQubitorExecutionRpcUrl(qubitorTestnet), "https://testrpc.qubitor.org/rpc");
assert.equal(walletAddEthereumChainParams(qubitorTestnet).rpcUrls[0], "https://testrpc.qubitor.org/rpc");
assert.throws(() => defaultQubitorRpcUrl(qubitorMainnet), /no default Qubitor RPC URL configured/);
assert.throws(
  () => defaultQubitorExecutionRpcUrl(qubitorMainnet),
  /no default Qubitor execution RPC URL configured/,
);
assert.equal(walletAddEthereumChainParams(qubitorDevnet).chainId, "0x164c9");
assert.equal(isKnownDevnetCompatibilityKey(QUBITOR_DEVNET_COMPAT_PRIVATE_KEY), true);
assert.notEqual(QUBITOR_DEVNET_DEPLOYER_PRIVATE_KEY, QUBITOR_DEVNET_FAUCET_PRIVATE_KEY);
assert.notEqual(QUBITOR_DEVNET_DEPLOYER_PRIVATE_KEY, QUBITOR_DEVNET_RELAYER_PRIVATE_KEY);
assert.equal(isKnownDevnetCompatibilityKey(QUBITOR_DEVNET_FAUCET_PRIVATE_KEY), true);
assert.equal(isKnownDevnetCompatibilityKey(QUBITOR_DEVNET_RELAYER_PRIVATE_KEY), true);
assert.equal(isKnownDevnetCompatibilityKey("0x1234"), false);
assert.equal(isLocalRpcUrl("http://127.0.0.1:8545"), true);
assert.equal(isLocalRpcUrl("https://rpc.qubitor.example"), false);
assert.equal(
  qubitorAdminControlSurfaces.some((surface) => surface.environmentVariable === "QUBITOR_FAUCET_PQ_SEED"),
  true,
);
assert.equal(
  qubitorAdminControlSurfaces.some((surface) => surface.id === "pq-admin-simulator" && surface.signerMode === "PQ Native"),
  true,
);
assert.equal(
  qubitorAdminControlSurfaces.some((surface) => surface.id === "pq-faucet-treasury-topup" && surface.signerMode === "PQ Native"),
  true,
);

assert.doesNotThrow(() =>
  assertDevnetCompatibilityKey({
    serviceName: "test",
    envVar: "QUBITOR_TEST_PRIVATE_KEY",
    configuredPrivateKey: undefined,
    defaultPrivateKey: QUBITOR_DEVNET_COMPAT_PRIVATE_KEY,
    rpcUrl: "http://localhost:8545",
  }),
);

assert.throws(
  () =>
    assertDevnetCompatibilityKey({
      serviceName: "test",
      envVar: "QUBITOR_TEST_PRIVATE_KEY",
      configuredPrivateKey: QUBITOR_DEVNET_COMPAT_PRIVATE_KEY,
      defaultPrivateKey: QUBITOR_DEVNET_COMPAT_PRIVATE_KEY,
      rpcUrl: "https://rpc.qubitor.example",
    }),
  /refusing known deterministic devnet key/,
);

assert.throws(
  () =>
    assertDevnetCompatibilityKey({
      serviceName: "test",
      envVar: "QUBITOR_TEST_PRIVATE_KEY",
      configuredPrivateKey: QUBITOR_DEVNET_COMPAT_PRIVATE_KEY,
      defaultPrivateKey: QUBITOR_DEVNET_COMPAT_PRIVATE_KEY,
      rpcUrl: "http://localhost:8545",
      networkName: "testnet",
    }),
  /on testnet/,
);

console.log("@qubitor/chain-config tests passed");
