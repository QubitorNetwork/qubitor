/** Shapes the explorer renders. Raw RPC hex is normalized at the hook layer. */

export type RawBlock = {
  number: string;
  hash: string;
  parentHash: string;
  miner: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  size: string;
  transactions: string[] | RawTx[];
  nonce: string;
  difficulty: string;
};

export type RawTx = {
  hash: string;
  blockNumber: string | null;
  blockHash: string | null;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice?: string;
  nonce: string;
  input: string;
  type?: string;
  transactionIndex: string | null;
};

export type RawReceipt = {
  status: string;
  gasUsed: string;
  contractAddress: string | null;
  logs: RawLog[];
};

export type RawLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
};

export type NetworkStatus = {
  profile: string;
  network: string;
  chainId: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  targetBlockTimeSeconds: number;
  defaultAccountModel: string;
  defaultSecurityMode: string;
  pqRequired: boolean;
  ecdsaControl: boolean;
  exactClaim: string;
  compatibilityBoundary: string;
  precompile: { name: string; address: string; primitive: string };
  deployments: {
    chainId: number;
    deploymentMode: string;
    systemInstalled: boolean;
    securityModeRegistry: string;
    accountReadinessRegistry: string;
    qubitorAccountFactory: string;
    mldsa65Precompile: string;
    qubitorNativeBridge?: {
      registry: string;
      guardianVerifier: string;
      nativeBridgeVault: string;
      bridgeAdmin: string;
      bridgeGuardian: string;
      initialNativeLiquidityWei: string;
      guardianGasBalanceWei: string;
    };
  };
  adminControlSurfaces: AdminSurface[];
  mining: {
    blockNumber: string;
    mining: boolean;
    hashrate: string;
    peerCount: string;
  };
  faucet?: {
    ok: boolean;
    faucetAddress: string;
    balanceWei: string;
    amountWei: string;
    claimWindowMs: number;
  };
};

export type AdminSurface = {
  id: string;
  label: string;
  signerMode: string;
  devnetOnly: boolean;
  protocolAdminAuthority: boolean;
  currentUse: string;
  productionGate: string;
};

export type AccountInfo = {
  address: string;
  balanceWei: bigint;
  isContract: boolean;
  securityMode: string | null;
  readiness: string | null;
  pqCommitment: string | null;
};

export type ExplorerEvent = {
  id: string; // `${blockNumber}-${logIndex}`
  address: string;
  addressLabel: string | null;
  name: string;
  known: boolean;
  args: Record<string, unknown>;
  blockNumber: number;
  txHash: string;
};

export type ProofKind = "pq-accounts" | "faucet" | "admin-vaults" | "bridge";

export type ProofView = {
  kind: ProofKind;
  title: string;
  exactClaim: string;
  subjects: ProofSubject[];
};

export type ProofSubject = {
  id: string;
  label: string;
  detail: string;
  eventCount: number;
  events: ExplorerEvent[];
};

export type ProofBundle = {
  proofBundleVersion: "qbt-testnet-proof-v1";
  generatedAt: string;
  network: string;
  chainId: number;
  kind: ProofKind;
  subject: string;
  exactClaim: string;
  evidence: {
    address: string;
    events: ExplorerEvent[];
    headBlock: number;
  };
};
