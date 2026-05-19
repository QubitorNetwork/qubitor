import http from "node:http";
import {
  QUBITOR_MLDSA65_PRECOMPILE,
  defaultQubitorRpcUrl,
  getConfiguredQubitorNetwork,
  getQubitorNetworkName,
  qubitorAdminControlSurfaces,
} from "@qubitor/chain-config";

const port = Number(process.env.QUBITOR_EXPLORER_PORT ?? 18547);
const networkName = getQubitorNetworkName();
const network = getConfiguredQubitorNetwork(networkName);
const rpcUrl = process.env.QUBITOR_RPC_URL ?? defaultQubitorRpcUrl(network);
const indexerUrl = process.env.QUBITOR_INDEXER_URL ?? "http://127.0.0.1:18549";
const faucetStatusUrl =
  process.env.QUBITOR_FAUCET_STATUS_URL ?? `${network.faucetUrls[0] ?? "http://127.0.0.1:18546"}/faucet/status`;

interface MiningStatus {
  network?: string;
  chainId?: number;
  targetBlockTimeSeconds?: number;
  blockNumber?: string | null;
  mining?: unknown;
  hashrate?: string | null;
  peerCount?: string | null;
}

interface FaucetStatus {
  ok?: boolean;
  controlSurface?: string;
  signerMode?: string;
  devnetCompatibilityOnly?: boolean;
  faucetAddress?: string;
  balanceWei?: string | bigint;
  amountWei?: string | bigint;
  claimWindowMs?: number;
  treasuryControl?: {
    mode?: string;
    vaultAddress?: string;
    hotWalletOnly?: boolean;
    productionRequirement?: string;
  };
}

interface NetworkSecurityStatus {
  network?: string;
  chainId?: number;
  targetBlockTimeSeconds?: number;
  defaultAccountModel?: string;
  defaultSecurityMode?: string;
  pqRequired?: boolean;
  ecdsaControl?: boolean;
  exactClaim?: string;
  compatibilityBoundary?: string;
  precompile?: {
    name?: string;
    address?: string;
    primitive?: string;
  };
  deployments?: Record<string, string>;
  adminControlSurfaces?: Array<{
    id: string;
    label: string;
    signerMode: string;
    devnetOnly: boolean;
    protocolAdminAuthority: boolean;
    currentUse: string;
    productionGate: string;
  }>;
  mining?: {
    blockNumber?: string | null;
    mining?: unknown;
    hashrate?: string | null;
    peerCount?: string | null;
  };
  faucet?: FaucetStatus & { unavailable?: boolean; statusUrl?: string };
}

interface DeploymentState {
  address: string;
  deployed: boolean;
  code?: string;
}

interface AccountSecurityMode {
  address: string;
  mode?: string;
  registryMode?: number;
  deployed?: boolean;
  verifiedQubitorAccount?: boolean;
  evidence?: string;
  legacyCompatibilityPossible?: boolean;
  claim?: string;
}

interface AccountReadiness {
  address: string;
  accountType?: string;
  deployed?: boolean;
  verifiedQubitorAccount?: boolean;
  evidence?: string;
  legacyCompatibilityPossible?: boolean;
  securityMode?: string;
  registryMode?: number;
  readiness?: {
    isQubitorAccount: boolean;
    securityMode: number;
    pqPublicKeyCommitment: string;
    lastKeyRotation: string;
    updatedAt: string;
  };
  pqRequired?: boolean;
  ecdsaControl?: boolean;
}

interface IndexerStatus {
  ok?: boolean;
  lastIndexedBlock?: number;
  indexedBlockCount?: number;
  transactionCount?: number;
  eventCount?: number;
  addressCount?: number;
  updatedAt?: string;
}

interface IndexedBlock {
  number: number;
  hash: string;
  miner?: string;
  transactionCount: number;
}

interface IndexedEvent {
  id: string;
  type: string;
  address: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  tags: string[];
  decoded?: Record<string, string>;
}

interface IndexedTransaction {
  hash: string;
  blockNumber: number;
  from?: string;
  to?: string | null;
  value?: string;
  status?: string;
  contractAddress?: string | null;
  tags: string[];
  logs: IndexedEvent[];
}

interface IndexedAddressActivity {
  address: string;
  transactionHashes: string[];
  eventIds: string[];
  tags: string[];
  transactions?: IndexedTransaction[];
  events?: IndexedEvent[];
}

interface PQAccountProof {
  address: string;
  pqPublicKeyCommitment?: string;
  created?: IndexedEvent;
  executions: IndexedEvent[];
  rotations: IndexedEvent[];
  actionCount: number;
  firstBlock?: number;
  lastBlock?: number;
}

interface PQAccountProofs {
  exactClaim?: string;
  claim: string;
  accounts: PQAccountProof[];
}

interface ProofBundle {
  proofBundleVersion: string;
  generatedAt: string;
  exactClaim: string;
  compatibilityBoundary: string;
  proofType: string;
  subject: string;
  summary: Record<string, unknown>;
  evidence: {
    blocks: Array<Record<string, unknown>>;
    transactions: Array<Record<string, unknown>>;
    events: Array<Record<string, unknown>>;
  };
}

interface FaucetClaimProof {
  txHash: string;
  blockNumber: number;
  recipient?: string | null;
  amountWei?: string;
  status?: string;
  hasPriorPQTreasuryTopUp: boolean;
  pqTreasuryTopUp?: IndexedEvent;
}

interface FaucetProofs {
  faucetAddress: string;
  exactClaim?: string;
  claimCount: number;
  pqTreasuryTopUpCount: number;
  hasPQTreasuryTopUp: boolean;
  boundary: string;
  claims: FaucetClaimProof[];
  treasuryTopUps: IndexedEvent[];
}

interface AdminVaultProof {
  vault: string;
  controller?: string;
  actions: IndexedEvent[];
  actionCount: number;
  firstBlock?: number;
  lastBlock?: number;
  legacyEOAControl: false;
  boundary: string;
}

interface AdminVaultProofs {
  exactClaim?: string;
  boundary: string;
  vaults: AdminVaultProof[];
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const payload = (await response.json()) as { result?: T; error?: { message?: string } };
    return payload.result ?? null;
  } catch {
    return null;
  }
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function indexer<T>(path: string): Promise<T | null> {
  return json<T>(`${indexerUrl}${path}`);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function code(value: unknown) {
  return `<code>${escapeHtml(value)}</code>`;
}

function prettyJson(value: unknown) {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function hexToBigInt(value: string | null | undefined): bigint | undefined {
  if (!value || !/^0x[0-9a-fA-F]+$/.test(value)) return undefined;
  return BigInt(value);
}

function displayBlock(value: string | null | undefined) {
  const block = hexToBigInt(value);
  return block === undefined ? "Unavailable" : block.toString();
}

function displayHexQuantity(value: string | null | undefined) {
  const quantity = hexToBigInt(value);
  return quantity === undefined ? "Unavailable" : quantity.toString();
}

function toBigInt(value: string | bigint | null | undefined): bigint | undefined {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "string" && value.length > 0) return BigInt(value);
    return undefined;
  } catch {
    return undefined;
  }
}

function formatQbt(value: string | bigint | null | undefined) {
  const wei = toBigInt(value);
  if (wei === undefined) return "Unavailable";
  const decimals = 10n ** BigInt(network.nativeCurrency.decimals);
  const whole = wei / decimals;
  const fraction = wei % decimals;
  const fractionText = fraction.toString().padStart(network.nativeCurrency.decimals, "0").slice(0, 4);
  return `${whole}.${fractionText} ${network.nativeCurrency.symbol}`;
}

function shortHex(value: string | null | undefined) {
  if (!value || value.length <= 18) return value ?? "";
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function pill(label: unknown, tone: "good" | "warn" | "neutral" | "danger" = "neutral") {
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
}

function row(label: string, value: unknown) {
  return `<div class="kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function page(title: string, body: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink: #17202a; --muted: #5e6b78; --line: #dfe5ea; --soft: #f5f7f8; --green: #147a4a; --lime: #32b86f; --amber: #9b6500; --red: #b42318; --blue: #155eef; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #fff; color: var(--ink); }
    header { min-height: 68px; padding: 16px 28px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 20px; align-items: center; }
    main { padding: 28px; max-width: 1180px; margin: 0 auto; }
    h1 { margin: 0 0 10px; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 17px; letter-spacing: 0; }
    h3 { margin: 0 0 8px; font-size: 15px; letter-spacing: 0; }
    p { color: var(--muted); line-height: 1.55; max-width: 900px; margin: 0 0 18px; }
    a { color: var(--green); text-decoration: none; }
    a:hover { text-decoration: underline; }
    form { display: flex; gap: 8px; width: min(520px, 100%); }
    input { flex: 1; min-width: 160px; height: 38px; border: 1px solid var(--line); border-radius: 6px; padding: 0 10px; font: inherit; }
    button { height: 38px; border: 1px solid var(--green); border-radius: 6px; background: var(--green); color: white; padding: 0 14px; font: inherit; font-weight: 700; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #eceff3; text-align: left; font-size: 14px; vertical-align: top; }
    th { color: #3f4b57; font-size: 12px; text-transform: uppercase; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
    pre { overflow: auto; padding: 14px; background: #101820; color: #e8f0f5; border-radius: 6px; font-size: 12px; line-height: 1.5; }
    .brand { display: flex; gap: 12px; align-items: center; font-weight: 800; }
    .nav { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .nav a { font-size: 13px; font-weight: 750; color: #344054; }
    .badge { background: var(--ink); color: #fff; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 800; }
    .hero { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; margin-bottom: 22px; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0 24px; }
    .panel { border: 1px solid var(--line); border-radius: 8px; padding: 16px; background: #fff; min-height: 132px; }
    .panel.soft { background: var(--soft); }
    .wide { grid-column: span 2; }
    .kv { display: flex; justify-content: space-between; gap: 14px; border-top: 1px solid #edf1f4; padding-top: 8px; margin-top: 8px; font-size: 13px; }
    .kv span { color: var(--muted); }
    .kv strong { text-align: right; font-weight: 750; }
    .pill { display: inline-flex; align-items: center; min-height: 24px; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 800; line-height: 1.2; }
    .pill.good { background: #dff7e9; color: #0d663e; }
    .pill.warn { background: #fff2cc; color: var(--amber); }
    .pill.neutral { background: #e8eef4; color: #344054; }
    .pill.danger { background: #fee4e2; color: var(--red); }
    .claim { border-left: 4px solid var(--lime); padding: 10px 12px; background: #f0fbf5; color: #244437; margin: 14px 0 20px; }
    .muted { color: var(--muted); }
    .stack { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .section { margin-top: 26px; }
    @media (max-width: 900px) { header, .hero { flex-direction: column; align-items: stretch; } .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .wide { grid-column: span 2; } }
    @media (max-width: 620px) { main, header { padding: 18px; } .grid { grid-template-columns: 1fr; } .wide { grid-column: span 1; } form { flex-direction: column; } button, input { width: 100%; } }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/"><strong>Qubitor Explorer Lite</strong><span class="badge">${escapeHtml(network.nativeCurrency.symbol)}</span></a>
    <nav class="nav">
      <a href="/proofs/pq-accounts">PQ Accounts</a>
      <a href="/proofs/faucet">Faucet</a>
      <a href="/proofs/admin-vaults">Admin Vaults</a>
    </nav>
    <form action="/address" method="get">
      <input name="q" placeholder="0x address" autocomplete="off" spellcheck="false" />
      <button type="submit">Open</button>
    </form>
  </header>
  <main>${body}</main>
</body>
</html>`;
}

function fallbackSecurityStatus(faucet: FaucetStatus | null): NetworkSecurityStatus {
  return {
    network: network.name,
    chainId: network.chainId,
    defaultAccountModel: "QubitorAccount",
    defaultSecurityMode: "PQ Native",
    pqRequired: true,
    ecdsaControl: false,
    exactClaim:
      "Breaking ECDSA/secp256k1 alone cannot move default Qubitor Account funds or control protocol/admin accounts.",
    compatibilityBoundary:
      "Legacy Ethereum transaction types are disabled when QUBITOR_EOA_TXS=0; system contracts are installed at genesis and wallet flows use QubitorPQTxV1.",
    precompile: {
      name: "QBT_ML_DSA_65_VERIFY",
      address: QUBITOR_MLDSA65_PRECOMPILE,
      primitive: "ML-DSA-65",
    },
    adminControlSurfaces: qubitorAdminControlSurfaces,
    faucet: faucet ?? { ok: false, unavailable: true, statusUrl: faucetStatusUrl },
  };
}

function renderSecurityPanels(status: NetworkSecurityStatus, mining: MiningStatus | null) {
  const faucet = status.faucet;
  const treasury = faucet?.treasuryControl;
  const miningBlock = status.mining?.blockNumber ?? mining?.blockNumber;
  const hashrate = status.mining?.hashrate ?? mining?.hashrate;
  const peerCount = status.mining?.peerCount ?? mining?.peerCount;

  return `<div class="grid">
    <section class="panel">
      <h2>Network</h2>
      <div class="stack">${pill(status.defaultSecurityMode ?? "PQ Native", "good")} ${pill("PoW Devnet", "neutral")}</div>
      ${row("Profile", networkName)}
      ${row("Chain", status.network ?? network.name)}
      ${row("Chain ID", status.chainId ?? network.chainId)}
      ${row("Latest block", displayBlock(miningBlock))}
    </section>
    <section class="panel">
      <h2>Default Account Control</h2>
      <div class="stack">${pill(status.pqRequired ? "ML-DSA Required" : "Unknown", status.pqRequired ? "good" : "warn")} ${pill(status.ecdsaControl ? "ECDSA Control" : "No ECDSA Control", status.ecdsaControl ? "danger" : "good")}</div>
      ${row("Model", status.defaultAccountModel ?? "QubitorAccount")}
      ${row("Mode", status.defaultSecurityMode ?? "PQ Native")}
      ${row("Legacy txs", "Disabled in native mode")}
    </section>
    <section class="panel">
      <h2>Faucet Treasury</h2>
      <div class="stack">${pill(faucet?.signerMode ?? "Unavailable", faucet?.signerMode?.includes("Legacy") ? "warn" : "neutral")} ${pill(treasury?.mode ?? "No status", treasury?.mode?.includes("hot-wallet") ? "warn" : "neutral")}</div>
      ${row("Hot wallet", treasury?.hotWalletOnly ? "yes" : "not reported")}
      ${row("Balance", formatQbt(faucet?.balanceWei))}
      ${row("Claim", formatQbt(faucet?.amountWei))}
    </section>
    <section class="panel">
      <h2>ML-DSA Precompile</h2>
      <div class="stack">${pill(status.precompile?.primitive ?? "ML-DSA-65", "good")}</div>
      ${row("Name", status.precompile?.name ?? "QBT_ML_DSA_65_VERIFY")}
      ${row("Address", shortHex(status.precompile?.address ?? QUBITOR_MLDSA65_PRECOMPILE))}
      ${row("Target block", `${network.targetBlockTimeSeconds}s`)}
    </section>
    <section class="panel wide soft">
      <h2>Claim Boundary</h2>
      <p class="claim">${escapeHtml(status.exactClaim ?? "")}</p>
      <p>${escapeHtml(status.compatibilityBoundary ?? "")}</p>
    </section>
    <section class="panel wide soft">
      <h2>Mining</h2>
      ${row("Hashrate", displayHexQuantity(hashrate))}
      ${row("Peers", displayHexQuantity(peerCount))}
      ${row("Target block time", `${status.targetBlockTimeSeconds ?? mining?.targetBlockTimeSeconds ?? network.targetBlockTimeSeconds}s`)}
      ${row("RPC", rpcUrl)}
    </section>
  </div>`;
}

function renderControlSurfaces(status: NetworkSecurityStatus) {
  const surfaces = status.adminControlSurfaces ?? qubitorAdminControlSurfaces;
  const rows = surfaces
    .map(
      (surface) =>
        `<tr><td>${escapeHtml(surface.label)}</td><td>${pill(surface.signerMode, surface.signerMode === "PQ Native" ? "good" : surface.signerMode.includes("Legacy") ? "warn" : "neutral")}</td><td>${surface.devnetOnly ? pill("Devnet", "neutral") : pill("Production gate", "warn")}</td><td>${escapeHtml(surface.currentUse)}</td></tr>`,
    )
    .join("");
  return `<section class="section"><h2>Control Surfaces</h2><table><thead><tr><th>Surface</th><th>Signer</th><th>Scope</th><th>Current use</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderIndexedActivity(
  status: IndexerStatus | null,
  events: IndexedEvent[],
) {
  const eventRows =
    events.length > 0
      ? events
          .map(
            (event) =>
              `<tr><td>${escapeHtml(event.type)}</td><td><a href="/block/${event.blockNumber}">${event.blockNumber}</a></td><td><a href="/tx/${event.transactionHash}">${escapeHtml(shortHex(event.transactionHash))}</a></td><td>${code(shortHex(event.address))}</td><td>${event.tags.map((tag) => pill(tag, tag.includes("pq") ? "good" : "neutral")).join(" ")}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="muted">No indexed Qubitor events yet.</td></tr>`;

  return `<section class="section">
    <h2>Indexed Activity</h2>
    <div class="grid">
      <section class="panel">
        <h3>Indexer</h3>
        <div class="stack">${pill(status?.ok ? "Online" : "Unavailable", status?.ok ? "good" : "warn")}</div>
        ${row("Last block", status?.lastIndexedBlock ?? "waiting")}
        ${row("Transactions", status?.transactionCount ?? 0)}
        ${row("Events", status?.eventCount ?? 0)}
      </section>
      <section class="panel wide">
        <h3>Store</h3>
        ${row("Indexed blocks", status?.indexedBlockCount ?? 0)}
        ${row("Addresses", status?.addressCount ?? 0)}
        ${row("Updated", status?.updatedAt ?? "not yet")}
      </section>
    </div>
    <table><thead><tr><th>Event</th><th>Block</th><th>Tx</th><th>Contract</th><th>Tags</th></tr></thead><tbody>${eventRows}</tbody></table>
  </section>`;
}

function renderAddressActivity(activity: IndexedAddressActivity | null) {
  const transactions = activity?.transactions ?? [];
  const events = activity?.events ?? [];
  const txRows =
    transactions.length > 0
      ? transactions
          .map(
            (tx) =>
              `<tr><td><a href="/tx/${tx.hash}">${escapeHtml(shortHex(tx.hash))}</a></td><td><a href="/block/${tx.blockNumber}">${tx.blockNumber}</a></td><td>${escapeHtml(tx.status ?? "")}</td><td>${tx.tags.map((tag) => pill(tag, tag.includes("pq") ? "good" : "neutral")).join(" ")}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="4" class="muted">No indexed transactions for this address yet.</td></tr>`;
  const eventRows =
    events.length > 0
      ? events
          .map(
            (event) =>
              `<tr><td>${escapeHtml(event.type)}</td><td><a href="/block/${event.blockNumber}">${event.blockNumber}</a></td><td><a href="/tx/${event.transactionHash}">${escapeHtml(shortHex(event.transactionHash))}</a></td><td>${event.tags.map((tag) => pill(tag, tag.includes("pq") ? "good" : "neutral")).join(" ")}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="4" class="muted">No indexed events for this address yet.</td></tr>`;

  return `<section class="section">
    <h2>Indexed Address Activity</h2>
    <div class="stack">${(activity?.tags ?? []).map((tag) => pill(tag, tag.includes("pq") ? "good" : "neutral")).join(" ")}</div>
    <table><thead><tr><th>Tx</th><th>Block</th><th>Status</th><th>Tags</th></tr></thead><tbody>${txRows}</tbody></table>
    <table><thead><tr><th>Event</th><th>Block</th><th>Tx</th><th>Tags</th></tr></thead><tbody>${eventRows}</tbody></table>
  </section>`;
}

function eventTxLink(event: IndexedEvent) {
  return `<a href="/tx/${event.transactionHash}">${escapeHtml(shortHex(event.transactionHash))}</a>`;
}

function downloadLink(path: string, label = "Download JSON proof bundle") {
  return `<a class="pill neutral" href="${escapeHtml(indexerUrl)}${escapeHtml(path)}" download>${escapeHtml(label)}</a>`;
}

function renderBundle(bundle: ProofBundle | undefined) {
  if (!bundle) {
    return `<section class="section"><h2>JSON Proof Bundle</h2><p class="muted">No proof bundle indexed yet.</p></section>`;
  }
  const eventRows =
    bundle.evidence.events.length > 0
      ? bundle.evidence.events
          .map(
            (event) =>
              `<tr><td>${escapeHtml(event.type)}</td><td>${escapeHtml(event.blockNumber)}</td><td>${code(shortHex(String(event.blockHash ?? "")))}</td><td>${code(shortHex(String(event.transactionHash ?? "")))}</td><td>${code(shortHex(String(event.eventTopic ?? "")))}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="muted">No event evidence in this bundle.</td></tr>`;

  return `<section class="section">
    <h2>JSON Proof Bundle</h2>
    <div class="grid">
      <section class="panel">${row("Bundle", bundle.proofBundleVersion)}${row("Type", bundle.proofType)}${row("Subject", shortHex(bundle.subject))}</section>
      <section class="panel wide"><p class="claim">${escapeHtml(bundle.exactClaim)}</p></section>
    </div>
    <table><thead><tr><th>Event</th><th>Block</th><th>Block Hash</th><th>Tx Hash</th><th>Topic</th></tr></thead><tbody>${eventRows}</tbody></table>
    <pre>${prettyJson(bundle)}</pre>
  </section>`;
}

function renderProofEventRows(events: IndexedEvent[], empty: string) {
  if (events.length === 0) {
    return `<tr><td colspan="6" class="muted">${escapeHtml(empty)}</td></tr>`;
  }
  return events
    .map((event) => {
      const decoded = event.decoded ?? {};
      const detail =
        event.type === "ExecutedPQ"
          ? `target ${shortHex(decoded.target)} · ${formatQbt(decoded.value)} · nonce ${decoded.nonce ?? ""}`
          : event.type === "PQKeyRotated"
            ? `new key ${shortHex(decoded.newPublicKeyCommitment)} · nonce ${decoded.nonce ?? ""}`
            : event.type === "TreasuryTransferred"
              ? `target ${shortHex(decoded.target)} · ${formatQbt(decoded.value)}`
              : event.type === "PolicyRecorded"
                ? `key ${shortHex(decoded.key)} · nonce ${decoded.nonce ?? ""}`
                : event.type === "TreasuryReceived"
                  ? `sender ${shortHex(decoded.sender)} · ${formatQbt(decoded.value)}`
                  : event.type === "AccountCreated"
                    ? `account ${shortHex(decoded.account)}`
                    : "";
      return `<tr><td>${escapeHtml(event.type)}</td><td><a href="/block/${event.blockNumber}">${event.blockNumber}</a></td><td>${eventTxLink(event)}</td><td>${code(shortHex(event.address))}</td><td>${escapeHtml(detail)}</td><td>${event.tags.map((tag) => pill(tag, tag.includes("pq") ? "good" : "neutral")).join(" ")}</td></tr>`;
    })
    .join("");
}

function renderProofSummaryLinks() {
  return `<div class="grid">
    <a class="panel" href="/proofs/pq-accounts"><h2>PQ Account Proofs</h2><p>Account creation, ML-DSA executePQ calls, rotations, and account readiness links.</p></a>
    <a class="panel" href="/proofs/faucet"><h2>Faucet Claims</h2><p>Native QubitorPQTxV1 faucet transfers and PQ treasury top-up evidence.</p></a>
    <a class="panel" href="/proofs/admin-vaults"><h2>PQ Admin Vault</h2><p>Policy and treasury actions controlled by Qubitor Accounts.</p></a>
  </div>`;
}

async function home() {
  const [latestHex, mining, gatewayStatus, directFaucet, indexerStatus, indexedBlocks, indexedEvents] = await Promise.all([
    rpc<string>("eth_blockNumber"),
    rpc<MiningStatus>("qubitor_getMiningStatus"),
    rpc<NetworkSecurityStatus>("qubitor_getNetworkSecurityStatus"),
    json<FaucetStatus>(faucetStatusUrl),
    indexer<IndexerStatus>("/indexer/status"),
    indexer<{ blocks: IndexedBlock[] }>("/blocks?limit=10"),
    indexer<{ events: IndexedEvent[] }>("/events?limit=8"),
  ]);
  const latest = hexToBigInt(gatewayStatus?.mining?.blockNumber ?? mining?.blockNumber ?? latestHex) ?? 0n;
  const status = gatewayStatus ?? fallbackSecurityStatus(directFaucet);
  const rows: string[] = [];

  if (indexedBlocks?.blocks.length) {
    for (const block of indexedBlocks.blocks) {
      rows.push(
        `<tr><td><a href="/block/${block.number}">${block.number}</a></td><td>${code(block.hash)}</td><td>${block.transactionCount}</td><td>${code(block.miner ?? "")}</td></tr>`,
      );
    }
  } else {
    for (let i = latest; i >= 0n && i > latest - 10n; i--) {
      const block = await rpc<{ number: string; hash: string; miner?: string; transactions: unknown[] }>(
        "eth_getBlockByNumber",
        [`0x${i.toString(16)}`, false],
      );
      if (!block) continue;
      rows.push(
        `<tr><td><a href="/block/${i}">${i}</a></td><td>${code(block.hash)}</td><td>${block.transactions.length}</td><td>${code(block.miner ?? "")}</td></tr>`,
      );
    }
  }

  if (rows.length === 0) {
    rows.push(
      `<tr><td colspan="4" class="muted">Waiting for blocks from RPC or the indexer.</td></tr>`,
    );
  }

  return page(
    "Qubitor Explorer Lite",
    `<div class="hero"><div><h1>${escapeHtml(status.network ?? network.name)}</h1><p>Profile ${escapeHtml(networkName)}. Chain ID ${status.chainId ?? network.chainId}. Native gas coin ${network.nativeCurrency.symbol}. Default Qubitor Accounts are ${escapeHtml(status.defaultSecurityMode ?? "PQ Native")}.</p></div></div>
     ${renderSecurityPanels(status, mining)}
     ${renderProofSummaryLinks()}
     ${renderIndexedActivity(indexerStatus, indexedEvents?.events ?? [])}
     ${renderControlSurfaces(status)}
     <section class="section"><h2>Recent Blocks</h2><table><thead><tr><th>Block</th><th>Hash</th><th>Txs</th><th>Miner</th></tr></thead><tbody>${rows.join("")}</tbody></table></section>`,
  );
}

async function blockPage(blockNumber: string) {
  let number: bigint;
  try {
    number = BigInt(blockNumber);
  } catch {
    return page("Qubitor Block", "<h1>Invalid block</h1>");
  }
  const block = await rpc("eth_getBlockByNumber", [`0x${number.toString(16)}`, true]);
  return page("Qubitor Block", `<h1>Block ${number}</h1><pre>${prettyJson(block)}</pre>`);
}

async function txPage(hash: string) {
  const [indexed, tx, receipt] = await Promise.all([
    indexer<{ transaction: IndexedTransaction }>(`/tx/${hash}`),
    rpc("eth_getTransactionByHash", [hash]),
    rpc("eth_getTransactionReceipt", [hash]),
  ]);
  const tags = indexed?.transaction.tags ?? [];
  return page(
    "Qubitor Transaction",
    `<h1>Transaction</h1><p>${code(hash)}</p>
     <div class="stack">${tags.map((tag) => pill(tag, tag.includes("pq") ? "good" : "neutral")).join(" ")}</div>
     <pre>${prettyJson({ indexed: indexed?.transaction, tx, receipt })}</pre>`,
  );
}

async function pqAccountsProofPage(address?: string) {
  if (address) {
    const [proof, readiness, securityMode, deployment] = await Promise.all([
      indexer<{ account: PQAccountProof; bundle?: ProofBundle }>(`/proofs/pq-accounts/${address}`),
      rpc<AccountReadiness>("qubitor_getAccountReadiness", [address]),
      rpc<AccountSecurityMode>("qubitor_getAccountSecurityMode", [address]),
      rpc<DeploymentState>("qubitor_getSmartAccountDeploymentState", [address]),
    ]);
    const account = proof?.account;
    if (!account) return page("PQ Account Proof", `<h1>PQ Account Proof</h1><p>No indexed proof for ${code(address)} yet.</p>`);
    const allEvents = [account.created, ...account.executions, ...account.rotations].filter(Boolean) as IndexedEvent[];
    return page(
      "PQ Account Proof",
      `<h1>PQ Account Proof</h1>
       <p>${code(account.address)}</p>
       <div class="stack">${downloadLink(`/proofs/pq-accounts/${account.address}?bundle=1`)}</div>
       <div class="grid">
        <section class="panel">${pill("PQ Native", "good")}${row("First block", account.firstBlock ?? "unknown")}${row("Last block", account.lastBlock ?? "unknown")}${row("Actions", account.actionCount)}</section>
        <section class="panel wide">${row("Current key commitment", account.pqPublicKeyCommitment ? shortHex(account.pqPublicKeyCommitment) : "not indexed")}${row("executePQ calls", account.executions.length)}${row("Rotations", account.rotations.length)}</section>
        <section class="panel">${row("Deployment", deployment?.deployed ? "Deployed" : "Not deployed")}${row("Readiness", readiness?.securityMode ?? securityMode?.mode ?? "unknown")}${row("ECDSA control", readiness?.ecdsaControl === false ? "no" : "unknown")}</section>
       </div>
       <p class="claim">This proof shows indexed Qubitor Account events. Funds move through ML-DSA-authorized executePQ calls, not ECDSA account control.</p>
       <table><thead><tr><th>Event</th><th>Block</th><th>Tx</th><th>Emitter</th><th>Detail</th><th>Tags</th></tr></thead><tbody>${renderProofEventRows(allEvents.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex), "No events indexed for this account.")}</tbody></table>
       ${renderBundle(proof.bundle)}`,
    );
  }

  const proofs = await indexer<PQAccountProofs>("/proofs/pq-accounts");
  const rows =
    proofs?.accounts.length
      ? proofs.accounts
          .map(
            (account) =>
              `<tr><td><a href="/proofs/pq-accounts/${account.address}">${code(shortHex(account.address))}</a></td><td>${account.created ? pill("created", "good") : pill("observed", "neutral")}</td><td>${account.executions.length}</td><td>${account.rotations.length}</td><td>${account.lastBlock ?? ""}</td><td>${code(shortHex(account.pqPublicKeyCommitment))}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="6" class="muted">No PQ account proofs indexed yet.</td></tr>`;

  return page(
    "PQ Account Proofs",
    `<h1>PQ Account Proofs</h1>
     <p class="claim">${escapeHtml(proofs?.exactClaim ?? "")}</p>
     <p>${escapeHtml(proofs?.claim ?? "Default Qubitor Accounts require ML-DSA authorization.")}</p>
     <table><thead><tr><th>Account</th><th>Status</th><th>executePQ</th><th>Rotations</th><th>Last block</th><th>Key commitment</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

async function faucetProofPage(txHash?: string) {
  if (txHash) {
    const proof = await indexer<{ claim: FaucetClaimProof; bundle?: ProofBundle }>(`/proofs/faucet/${txHash}`);
    const claim = proof?.claim;
    if (!claim) return page("Faucet Claim Proof", `<h1>Faucet Claim Proof</h1><p>No indexed faucet proof for ${code(txHash)} yet.</p>`);
    return page(
      "Faucet Claim Proof",
      `<h1>Faucet Claim Proof</h1>
       <p>${code(claim.txHash)}</p>
       <div class="stack">${downloadLink(`/proofs/faucet/${claim.txHash}?bundle=1`)}</div>
       <div class="grid">
        <section class="panel">${pill("PQ Native", "good")}${row("Block", claim.blockNumber)}${row("Amount", formatQbt(claim.amountWei))}</section>
        <section class="panel wide">${row("Recipient", shortHex(claim.recipient))}${row("Prior PQ treasury top-up", claim.hasPriorPQTreasuryTopUp ? "yes" : "no")}${row("Status", claim.status ?? "")}</section>
       </div>
       <p class="claim">This faucet claim is a native QubitorPQTxV1 transfer. The bundle records whether a prior PQ-controlled treasury top-up was indexed.</p>
       ${claim.pqTreasuryTopUp ? `<section class="section"><h2>PQ Treasury Top-Up Evidence</h2><table><thead><tr><th>Event</th><th>Block</th><th>Tx</th><th>Emitter</th><th>Detail</th><th>Tags</th></tr></thead><tbody>${renderProofEventRows([claim.pqTreasuryTopUp], "No PQ treasury top-up indexed.")}</tbody></table></section>` : ""}
       ${renderBundle(proof.bundle)}`,
    );
  }

  const proofs = await indexer<FaucetProofs>("/proofs/faucet");
  const claims = proofs?.claims ?? [];
  const topUps = proofs?.treasuryTopUps ?? [];
  const claimRows =
    claims.length > 0
      ? claims
          .map(
            (claim) =>
              `<tr><td><a href="/proofs/faucet/${claim.txHash}">${escapeHtml(shortHex(claim.txHash))}</a></td><td><a href="/block/${claim.blockNumber}">${claim.blockNumber}</a></td><td>${code(shortHex(claim.recipient))}</td><td>${formatQbt(claim.amountWei)}</td><td>${pill(claim.hasPriorPQTreasuryTopUp ? "PQ treasury top-up seen" : "hot wallet only", claim.hasPriorPQTreasuryTopUp ? "good" : "warn")}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="muted">No faucet claims indexed yet.</td></tr>`;

  return page(
    "Faucet Claims",
    `<h1>Faucet Claims</h1>
     <p class="claim">${escapeHtml(proofs?.exactClaim ?? "")}</p>
     <p>${escapeHtml(proofs?.boundary ?? "Faucet claims are native QubitorPQTxV1 transfers.")}</p>
     <div class="grid">
      <section class="panel">${pill("PQ Native", "good")}${row("Faucet", shortHex(proofs?.faucetAddress))}${row("Claims", proofs?.claimCount ?? 0)}</section>
      <section class="panel wide">${pill(proofs?.hasPQTreasuryTopUp ? "PQ treasury top-up proven" : "No PQ top-up indexed", proofs?.hasPQTreasuryTopUp ? "good" : "warn")}${row("PQ top-ups", proofs?.pqTreasuryTopUpCount ?? 0)}</section>
     </div>
     <section class="section"><h2>Claims</h2><table><thead><tr><th>Tx</th><th>Block</th><th>Recipient</th><th>Amount</th><th>Treasury proof</th></tr></thead><tbody>${claimRows}</tbody></table></section>
     <section class="section"><h2>PQ Treasury Top-Ups</h2><table><thead><tr><th>Event</th><th>Block</th><th>Tx</th><th>Emitter</th><th>Detail</th><th>Tags</th></tr></thead><tbody>${renderProofEventRows(topUps, "No PQ treasury top-ups indexed yet.")}</tbody></table></section>`,
  );
}

async function adminVaultProofPage(vaultAddress?: string) {
  if (vaultAddress) {
    const proof = await indexer<{ vault: AdminVaultProof; bundle?: ProofBundle }>(`/proofs/admin-vaults/${vaultAddress}`);
    const vault = proof?.vault;
    if (!vault) return page("PQ Admin Vault Proof", `<h1>PQ Admin Vault Proof</h1><p>No indexed admin-vault proof for ${code(vaultAddress)} yet.</p>`);
    return page(
      "PQ Admin Vault Proof",
      `<h1>PQ Admin Vault Proof</h1>
       <p>${code(vault.vault)}</p>
       <div class="stack">${downloadLink(`/proofs/admin-vaults/${vault.vault}?bundle=1`)}</div>
       <div class="grid">
        <section class="panel">${pill("PQ Admin", "good")}${row("Actions", vault.actionCount)}${row("Last block", vault.lastBlock ?? "unknown")}</section>
        <section class="panel wide">${row("PQ controller", shortHex(vault.controller))}${row("Legacy EOA control", vault.legacyEOAControl ? "yes" : "no")}</section>
       </div>
       <p class="claim">${escapeHtml(vault.boundary)}</p>
       <table><thead><tr><th>Event</th><th>Block</th><th>Tx</th><th>Emitter</th><th>Detail</th><th>Tags</th></tr></thead><tbody>${renderProofEventRows(vault.actions, "No admin actions indexed yet.")}</tbody></table>
       ${renderBundle(proof.bundle)}`,
    );
  }

  const proofs = await indexer<AdminVaultProofs>("/proofs/admin-vaults");
  const vaults = proofs?.vaults ?? [];
  const rows =
    vaults.length > 0
      ? vaults
          .map(
            (vault) =>
              `<tr><td><a href="/proofs/admin-vaults/${vault.vault}">${code(shortHex(vault.vault))}</a></td><td>${code(shortHex(vault.controller))}</td><td>${vault.actionCount}</td><td>${vault.lastBlock ?? ""}</td><td>${pill("Legacy EOA cannot control this vault", "good")}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="muted">No admin-vault proofs indexed yet.</td></tr>`;
  const actions = vaults.flatMap((vault) => vault.actions);

  return page(
    "PQ Admin Vault Proofs",
    `<h1>PQ Admin Vault Proofs</h1>
     <p class="claim">${escapeHtml(proofs?.exactClaim ?? "")}</p>
     <p class="claim">${escapeHtml(proofs?.boundary ?? "Legacy EOA cannot control this vault directly.")}</p>
     <table><thead><tr><th>Vault</th><th>PQ Controller</th><th>Actions</th><th>Last block</th><th>Control</th></tr></thead><tbody>${rows}</tbody></table>
     <section class="section"><h2>Policy And Treasury Actions</h2><table><thead><tr><th>Event</th><th>Block</th><th>Tx</th><th>Emitter</th><th>Detail</th><th>Tags</th></tr></thead><tbody>${renderProofEventRows(actions, "No admin actions indexed yet.")}</tbody></table></section>`,
  );
}

function accountModeLabel(params: {
  deployed: boolean;
  securityMode: AccountSecurityMode | null;
  readiness: AccountReadiness | null;
}) {
  const verified = params.readiness?.verifiedQubitorAccount === true || params.securityMode?.verifiedQubitorAccount === true;
  if (verified) return params.readiness?.securityMode ?? params.securityMode?.mode ?? "PQ Native";
  if (params.deployed) return params.securityMode?.mode ?? "Contract / unverified account";
  return "Legacy / compatibility or undeployed counterfactual";
}

async function addressPage(address: string) {
  const [balance, codeResult, deployment, securityMode, readiness, indexedActivity] = await Promise.all([
    rpc<string>("eth_getBalance", [address, "latest"]),
    rpc<string>("eth_getCode", [address, "latest"]),
    rpc<DeploymentState>("qubitor_getSmartAccountDeploymentState", [address]),
    rpc<AccountSecurityMode>("qubitor_getAccountSecurityMode", [address]),
    rpc<AccountReadiness>("qubitor_getAccountReadiness", [address]),
    indexer<IndexedAddressActivity>(`/address/${address}`),
  ]);
  const deployed = deployment?.deployed ?? (typeof codeResult === "string" && codeResult !== "0x");
  const verified = readiness?.verifiedQubitorAccount === true || securityMode?.verifiedQubitorAccount === true;
  const mode = accountModeLabel({ deployed, securityMode, readiness });
  const evidence = readiness?.evidence ?? securityMode?.evidence ?? "eth_getCode";
  const registryCommitment = readiness?.readiness?.pqPublicKeyCommitment;
  const raw = {
    balance,
    deployment,
    securityMode,
    readiness,
    code: codeResult,
  };

  return page(
    "Qubitor Address",
    `<h1>Address</h1>
     <p>${code(address)}</p>
     <div class="grid">
      <section class="panel">
        <h2>Balance</h2>
        <div class="stack">${pill(formatQbt(balance), "neutral")}</div>
        ${row("Raw wei", toBigInt(balance)?.toString() ?? "Unavailable")}
        ${row("Deployment", deployed ? "Deployed" : "Not deployed")}
      </section>
      <section class="panel">
        <h2>Security Mode</h2>
        <div class="stack">${pill(mode, verified ? "good" : deployed ? "neutral" : "warn")}</div>
        ${row("Verified Qubitor Account", verified ? "yes" : "not yet")}
        ${row("Evidence", evidence)}
        ${row("ECDSA control", readiness?.ecdsaControl === false || securityMode ? "no for Qubitor execution" : "unknown")}
      </section>
      <section class="panel wide">
        <h2>Readiness</h2>
        ${row("Account type", readiness?.accountType ?? (deployed ? "Contract" : "Compatibility / counterfactual address"))}
        ${row("Registry mode", readiness?.registryMode ?? securityMode?.registryMode ?? "none")}
        ${row("PQ key commitment", registryCommitment ? shortHex(registryCommitment) : "not recorded")}
      </section>
     </div>
     ${renderAddressActivity(indexedActivity)}
     <section class="section"><h2>Raw RPC</h2><pre>${prettyJson(raw)}</pre></section>`,
  );
}

const server = http.createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, network: networkName, rpcUrl, chainId: network.chainId }));
      return;
    }

    if (url.pathname === "/address") {
      const query = url.searchParams.get("q");
      if (query?.startsWith("0x")) {
        response.writeHead(302, { location: `/address/${encodeURIComponent(query)}` });
        response.end();
        return;
      }
    }

    let html: string;
    if (url.pathname === "/") html = await home();
    else if (url.pathname === "/proofs/pq-accounts") html = await pqAccountsProofPage();
    else if (url.pathname.startsWith("/proofs/pq-accounts/")) html = await pqAccountsProofPage(decodeURIComponent(url.pathname.split("/").pop() ?? ""));
    else if (url.pathname === "/proofs/faucet") html = await faucetProofPage();
    else if (url.pathname.startsWith("/proofs/faucet/")) html = await faucetProofPage(decodeURIComponent(url.pathname.split("/").pop() ?? ""));
    else if (url.pathname === "/proofs/admin-vaults") html = await adminVaultProofPage();
    else if (url.pathname.startsWith("/proofs/admin-vaults/")) html = await adminVaultProofPage(decodeURIComponent(url.pathname.split("/").pop() ?? ""));
    else if (url.pathname.startsWith("/block/")) html = await blockPage(url.pathname.split("/").pop() ?? "0");
    else if (url.pathname.startsWith("/tx/")) html = await txPage(url.pathname.split("/").pop() ?? "");
    else if (url.pathname.startsWith("/address/")) html = await addressPage(decodeURIComponent(url.pathname.split("/").pop() ?? ""));
    else html = page("Not Found", "<h1>Not found</h1>");

    response.writeHead(200, { "content-type": "text/html" });
    response.end(html);
  })();
});

server.listen(port, () => {
  console.log(`[qubitor-explorer-lite] listening on http://127.0.0.1:${port}`);
});
