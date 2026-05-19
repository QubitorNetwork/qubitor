export type Hex = `0x${string}`;

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface QubitorContracts {
  mldsa65Precompile: Hex;
  accountFactory?: Hex;
  securityModeRegistry?: Hex;
  accountReadinessRegistry?: Hex;
}

export interface QubitorNetworkConfig {
  name: string;
  shortName: string;
  chainId: number;
  networkId: number;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  faucetUrls: string[];
  nativeCurrency: NativeCurrency;
  targetBlockTimeSeconds: number;
  gasLimit: number;
  contracts: QubitorContracts;
}

export interface QubitorControlSurface {
  id: string;
  label: string;
  environmentVariable?: string;
  signerMode: "Legacy EOA / Compatibility Mode" | "PQ Native" | "Future PQ Policy";
  devnetOnly: boolean;
  protocolAdminAuthority: boolean;
  currentUse: string;
  productionGate: string;
}

export const QUBITOR_MLDSA65_PRECOMPILE =
  "0x0000000000000000000000000000000000000100" as const;
export const QUBITOR_SECURITY_MODE_REGISTRY =
  "0x0000000000000000000000000000000000000201" as const;
export const QUBITOR_ACCOUNT_READINESS_REGISTRY =
  "0x0000000000000000000000000000000000000202" as const;
export const QUBITOR_ACCOUNT_FACTORY =
  "0x0000000000000000000000000000000000000203" as const;
export const QUBITOR_TESTNET_RPC_URL = "https://testrpc.qubitor.org/rpc" as const;
export const QUBITOR_TESTNET_EXPLORER_URL = "https://testexplorer.qubitor.org" as const;
export const QUBITOR_TESTNET_FAUCET_URL = "https://testrpc.qubitor.org" as const;

export const qubitorSystemContracts = {
  mldsa65Precompile: QUBITOR_MLDSA65_PRECOMPILE,
  securityModeRegistry: QUBITOR_SECURITY_MODE_REGISTRY,
  accountReadinessRegistry: QUBITOR_ACCOUNT_READINESS_REGISTRY,
  accountFactory: QUBITOR_ACCOUNT_FACTORY,
} as const satisfies QubitorContracts;

/**
 * @deprecated Devnet-only deterministic compatibility keys for local tooling.
 * Do not use these keys on public testnet, mainnet, production services, or
 * any user-facing wallet flow.
 */
export const QUBITOR_DEVNET_COMPAT_PRIVATE_KEYS = [
  {
    label: "devnet account 0",
    address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  {
    label: "devnet account 1",
    address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  {
    label: "devnet account 2",
    address: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
] as const;

/**
 * @deprecated Devnet-only deterministic compatibility key for local tooling.
 */
export const QUBITOR_DEVNET_COMPAT_PRIVATE_KEY =
  QUBITOR_DEVNET_COMPAT_PRIVATE_KEYS[0].privateKey;
/**
 * @deprecated Devnet-only deterministic compatibility key for local tooling.
 */
export const QUBITOR_DEVNET_DEPLOYER_PRIVATE_KEY =
  QUBITOR_DEVNET_COMPAT_PRIVATE_KEYS[0].privateKey;
/**
 * @deprecated Devnet-only deterministic compatibility key for local tooling.
 */
export const QUBITOR_DEVNET_FAUCET_PRIVATE_KEY =
  QUBITOR_DEVNET_COMPAT_PRIVATE_KEYS[1].privateKey;
/**
 * @deprecated Devnet-only deterministic compatibility key for local tooling.
 */
export const QUBITOR_DEVNET_RELAYER_PRIVATE_KEY =
  QUBITOR_DEVNET_COMPAT_PRIVATE_KEYS[2].privateKey;

export const qubitorAdminControlSurfaces: QubitorControlSurface[] = [
  {
    id: "genesis-system-contract-installer",
    label: "Genesis system contract installer",
    signerMode: "PQ Native",
    devnetOnly: true,
    protocolAdminAuthority: false,
    currentUse: "Installs registries and the deterministic QubitorAccountFactory into genesis at canonical system addresses; no EOA deployer key exists.",
    productionGate: "Production genesis must include the same canonical contracts or a stricter PQ-controlled launch ceremony with no retained EOA admin authority.",
  },
  {
    id: "pq-native-faucet-treasury",
    label: "PQ native faucet treasury",
    environmentVariable: "QUBITOR_FAUCET_PQ_SEED",
    signerMode: "PQ Native",
    devnetOnly: true,
    protocolAdminAuthority: false,
    currentUse: "Signs bounded devnet QBT faucet grants as native QubitorPQTxV1 transfers from the genesis-funded ML-DSA account.",
    productionGate: "Any public faucet treasury seed must live in a hardened signer, Qubitor Account, or stricter PQ policy.",
  },
  {
    id: "pq-native-submit-gateway",
    label: "PQ raw transaction submit gateway",
    signerMode: "PQ Native",
    devnetOnly: true,
    protocolAdminAuthority: false,
    currentUse: "Submits wallet-signed QubitorPQTxV1 raw bytes and holds no EOA gas-payer key.",
    productionGate: "Production submitters must remain submission-only and must not hold protocol/admin authority or account-control keys.",
  },
  {
    id: "protocol-admin",
    label: "Protocol/admin authority",
    signerMode: "Future PQ Policy",
    devnetOnly: false,
    protocolAdminAuthority: true,
    currentUse: "No privileged production admin control is deployed in the first milestone contracts.",
    productionGate: "Any future treasury, upgrade, bridge, governance, or emergency control must be a Qubitor Account or stricter PQ policy.",
  },
  {
    id: "pq-admin-simulator",
    label: "PQ admin simulator",
    signerMode: "PQ Native",
    devnetOnly: true,
    protocolAdminAuthority: false,
    currentUse: "QubitorAdminVault proves treasury, faucet hot-wallet top-up, and policy actions can be gated to a Qubitor Account.",
    productionGate: "Simulator coverage must be replaced by a full inventory of production treasury, upgrade, bridge, governance, and emergency controls.",
  },
  {
    id: "pq-faucet-treasury-topup",
    label: "PQ faucet treasury top-up",
    signerMode: "PQ Native",
    devnetOnly: true,
    protocolAdminAuthority: false,
    currentUse: "Devnet faucet grants are native PQ transactions from the deterministic ML-DSA faucet treasury.",
    productionGate: "Production faucet treasuries must be bounded and controlled only by Qubitor Account control or stricter PQ policy.",
  },
];

export const qubitorDevnet: QubitorNetworkConfig = {
  name: "Qubitor Devnet",
  shortName: "qbt-devnet",
  chainId: 91337,
  networkId: 91337,
  rpcUrls: ["http://127.0.0.1:18545/rpc", "http://127.0.0.1:8545"],
  blockExplorerUrls: ["http://127.0.0.1:18547"],
  faucetUrls: ["http://127.0.0.1:18546"],
  nativeCurrency: {
    name: "Qubitor",
    symbol: "QBT",
    decimals: 18,
  },
  targetBlockTimeSeconds: 12,
  gasLimit: 30_000_000,
  contracts: {
    ...qubitorSystemContracts,
  },
};

export const qubitorTestnet: QubitorNetworkConfig = {
  ...qubitorDevnet,
  name: "Qubitor Testnet",
  shortName: "qbt-testnet",
  chainId: 91338,
  networkId: 91338,
  rpcUrls: [QUBITOR_TESTNET_RPC_URL],
  blockExplorerUrls: [QUBITOR_TESTNET_EXPLORER_URL],
  faucetUrls: [QUBITOR_TESTNET_FAUCET_URL],
};

export const qubitorMainnet: QubitorNetworkConfig = {
  ...qubitorDevnet,
  name: "Qubitor Network",
  shortName: "qbt",
  chainId: 91339,
  networkId: 91339,
  rpcUrls: [],
  blockExplorerUrls: [],
  faucetUrls: [],
};

export const qubitorNetworks = {
  devnet: qubitorDevnet,
  testnet: qubitorTestnet,
  mainnet: qubitorMainnet,
} as const;

export type QubitorNetworkName = keyof typeof qubitorNetworks;

export function getQubitorNetwork(name: QubitorNetworkName): QubitorNetworkConfig {
  return qubitorNetworks[name];
}

export function getQubitorNetworkName(value: string | undefined = process.env.QUBITOR_NETWORK ?? process.env.QUBITOR_NETWORK_PROFILE): QubitorNetworkName {
  const normalized = (value ?? "devnet").toLowerCase();
  if (normalized === "devnet" || normalized === "testnet" || normalized === "mainnet") return normalized;
  throw new Error(`unsupported Qubitor network "${value}". Use devnet, testnet, or mainnet.`);
}

export function getConfiguredQubitorNetwork(value?: string): QubitorNetworkConfig {
  return getQubitorNetwork(getQubitorNetworkName(value));
}

export function defaultQubitorRpcUrl(config: QubitorNetworkConfig): string {
  const rpcUrl = config.rpcUrls[0];
  if (rpcUrl) return rpcUrl;
  if (config.chainId === qubitorDevnet.chainId) return "http://127.0.0.1:8545";
  throw new Error(
    `no default Qubitor RPC URL configured for ${config.name} (${config.chainId}); pass rpcUrl explicitly`,
  );
}

export function defaultQubitorExecutionRpcUrl(config: QubitorNetworkConfig): string {
  const rpcUrl = config.rpcUrls.find((url) => !url.endsWith("/rpc")) ?? config.rpcUrls[0];
  if (rpcUrl) return rpcUrl;
  if (config.chainId === qubitorDevnet.chainId) return "http://127.0.0.1:8545";
  throw new Error(
    `no default Qubitor execution RPC URL configured for ${config.name} (${config.chainId}); pass rpcUrl explicitly`,
  );
}

export function getQubitorNetworkByChainId(chainId: number): QubitorNetworkConfig | undefined {
  return Object.values(qubitorNetworks).find((network) => network.chainId === chainId);
}

export function isKnownDevnetCompatibilityKey(privateKey: string | undefined): boolean {
  if (!privateKey) return false;
  const normalized = privateKey.toLowerCase();
  return QUBITOR_DEVNET_COMPAT_PRIVATE_KEYS.some((key) => key.privateKey.toLowerCase() === normalized);
}

export function isLocalRpcUrl(rpcUrl: string): boolean {
  try {
    const parsed = new URL(rpcUrl);
    return ["127.0.0.1", "localhost", "0.0.0.0", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function assertDevnetCompatibilityKey(params: {
  serviceName: string;
  envVar: string;
  configuredPrivateKey: string | undefined;
  defaultPrivateKey: string;
  rpcUrl: string;
  networkName?: QubitorNetworkName;
}) {
  const privateKey = params.configuredPrivateKey ?? params.defaultPrivateKey;
  const networkName = params.networkName ?? "devnet";
  if (isKnownDevnetCompatibilityKey(privateKey) && networkName !== "devnet") {
    throw new Error(
      `${params.serviceName} refusing known deterministic devnet key from ${params.envVar} on ${networkName}. Use a ${networkName} key and keep protocol/admin authority behind PQ control.`,
    );
  }
  if (isKnownDevnetCompatibilityKey(privateKey) && !isLocalRpcUrl(params.rpcUrl)) {
    throw new Error(
      `${params.serviceName} refusing known deterministic devnet key from ${params.envVar} against non-local RPC ${params.rpcUrl}. Use a non-devnet key and keep production protocol/admin authority behind PQ control.`,
    );
  }
}

export function walletAddEthereumChainParams(config: QubitorNetworkConfig) {
  return {
    chainId: `0x${config.chainId.toString(16)}`,
    chainName: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: config.rpcUrls,
    blockExplorerUrls: config.blockExplorerUrls,
  };
}
