export const BRAND = {
  name: "Qubitor",
  tagline: "A post-quantum security layer for value.",
  chainId: 91337,
  gasCoin: "QBT",
  precompile: "0x0000000000000000000000000000000000000100",
  consensus: "PoW EVM · CoreGeth fork",
  signature: "ML-DSA-65 (NIST FIPS 204)",
};

// TODO(launch): replace the placeholder org/handles below with the canonical
// Qubitor GitHub org URL, real X/Twitter handle, and real community channel
// before going live. The current values are stubs derived from the existing
// research repo and may not match the production org.
export const LINKS = {
  // TODO(launch): point at the canonical Qubitor docs URL
  docs: "https://github.com/Quantx256hash/QubitorNetwork/tree/main/docs",
  // TODO(launch): point at the canonical Qubitor org repo
  github: "https://github.com/Quantx256hash/QubitorNetwork",
  // TODO(launch): real X/Twitter handle
  twitter: "https://x.com/qubitornetwork",
  // TODO(launch): real Telegram/Discord URL
  community: "https://t.me/qubitornetwork",
  threatModel:
    "https://github.com/Quantx256hash/QubitorNetwork/blob/main/docs/security/threat-model.md",
};

export const HERO = {
  eyebrow: "Qubitor Network · Post-Quantum L1",
  headline: "A post-quantum security layer for value.",
  subhead:
    "Qubitor is a mineable EVM L1 with ML-DSA-native smart accounts. No EOA anywhere.",
  ctas: [
    { label: "Read Docs", href: "#cta", external: false },
    { label: "View GitHub", href: "https://github.com/Quantx256hash/QubitorNetwork", external: true },
    { label: "Join Community", href: "#cta", external: false },
  ],
  reticle: `CHAIN ID 91337 · DEVNET LIVE`,
};

export const QUANTUM_RISK = {
  eyebrow: "01 · The Risk",
  headline: "Quantum risk is not just about wallets.",
  body: [
    "A working quantum adversary against ECDSA does not stop at user keys. It propagates into every privileged signature path the chain depends on: bridge guardians, sequencer operators, validator keys, treasury authorities, governance executors, faucet signers.",
    "The legacy assumption that an externally owned account is a safe default no longer holds. The cost of being wrong is not a slow migration — it is a silent forge.",
  ],
  quote: {
    text: "Breaking ECDSA alone cannot move default Qubitor Account funds.",
    source: "docs/security/threat-model.md",
  },
  bullets: [
    "Validators, guardians, sequencers, upgrade keys.",
    "Bridges, faucets, deployer accounts, governance.",
    "Any ‘onlyOwner’ fallback that touches user value.",
  ],
};

export const SMART_ACCOUNTS = {
  eyebrow: "02 · The Account",
  headline: "Smart accounts built for the post-quantum era.",
  body: [
    "Default Qubitor Accounts have no ECDSA owner, no admin key, and no legacy onlyOwner control path. Every execution and key rotation is gated by an ML-DSA-65 signature verified by a native EVM precompile.",
    "The signed message binds the action domain, chain ID, account address, current nonce, and call hash. Replay is rejected across nonces, accounts, and chains.",
  ],
  flow: [
    { label: "Wallet", detail: "ML-DSA-65 signature over (target, value, data, nonce)" },
    { label: "QubitorAccount", detail: "executePQ(target,value,data,nonce,signature)" },
    { label: "Precompile", detail: "0x…0100 verifies the signature" },
    { label: "Execution", detail: "Nonce consumed · call dispatched" },
  ],
  stats: [
    { value: "0", label: "ECDSA owners", icon: "/brand/icons/key.png" },
    { value: "ML-DSA-65", label: "Native verifier precompile", icon: "/brand/icons/qubitor.png" },
    { value: "Genesis", label: "Installed account contracts", icon: "/brand/icons/terminal.png" },
  ],
};

export const NETWORK = {
  eyebrow: "03 · The Network",
  headline: "A quantum-native EVM L1.",
  body: [
    "Mineable proof-of-work, standard Ethereum JSON-RPC, plus Qubitor helper methods for PQ transaction submission. Legacy Ethereum transaction types are disabled on Qubitor-native networks.",
  ],
  tiles: [
    { label: "Chain ID", value: "91337", note: "Devnet" },
    { label: "Gas coin", value: "QBT", note: "Native, paid by the account" },
    { label: "Consensus", value: "PoW EVM", note: "CoreGeth fork" },
    { label: "PQ verifier", value: "0x…0100", note: "ML-DSA-65 precompile" },
    { label: "Account model", value: "PQ Native", note: "No EOA anywhere" },
    { label: "Tx envelope", value: "QubitorPQTxV1", note: "Account pays its own gas" },
  ],
  services: [
    "rpc-gateway",
    "faucet-api",
    "pq-relayer-api",
    "indexer",
    "explorer-lite",
  ],
};

export const PERSONA = {
  eyebrow: "04 · The Guardian",
  headline: "Keeper of the post-quantum field.",
  body:
    "A face cut from quantum dust. Eyes lit from within. The Qubitor figure is the mind behind the field — the long memory of every signature the chain has verified. Beneath every transaction is a key, and beneath every key is the question of who is still awake.",
  marquee: [
    "THE NEW PARADIGM",
    "QUANTUM-NATIVE",
    "NO EOA ANYWHERE",
    "BRIDGE SECURITY STARTS WITH THE KEY",
    "VALIDATORS · GUARDIANS · OPERATORS",
    "ML-DSA-65 · FIPS 204",
  ],
};

export const ROADMAP = {
  eyebrow: "05 · The Path",
  headline: "Devnet. Testnet. Mainnet.",
  body:
    "Each phase is gated by a reproducible local proof — not a roadmap promise. The commands below are the same ones the CI runs.",
  milestones: [
    {
      phase: "Devnet",
      status: "Live",
      date: "Q1 2026",
      summary:
        "PQ-native acceptance: ML-DSA verifier, no-EOA gas, genesis-installed account contracts, faucet and admin vault on PQ.",
      command: "pnpm devnet:acceptance",
    },
    {
      phase: "Testnet",
      status: "Readiness gating",
      date: "Q3 2026",
      summary:
        "Public testnet is blocked until the devnet proof is repeated with dedicated bootnodes, public RPC, and signed launch material.",
      command: "pnpm testnet:readiness",
    },
    {
      phase: "Mainnet",
      status: "Release gate",
      date: "2027 · post-audit",
      summary:
        "Production protocol/admin coverage: treasury, upgrade, bridge guardian, governance — every privileged authority on a Qubitor Account or stricter PQ policy.",
      command: "pnpm pq-native:acceptance",
    },
  ],
};

export const RUN_IT = {
  eyebrow: "06 · The Proof",
  headline: "Verify it yourself.",
  body:
    "Every claim has a script. The same acceptance check our CI runs is one command away — and writes a portable proof bundle you can re-verify against live RPC.",
  command: "pnpm devnet:acceptance",
  output: [
    "→ qubitor-node build · ok",
    "→ coregeth fork up · chain id 91337",
    "→ genesis-installed account contracts · ok",
    "→ ml-dsa-65 verifier precompile @ 0x…0100 · ok",
    "→ executePQ smoke · ok",
    "→ rotatePQKey smoke · ok",
    "→ pq admin vault top-up + faucet claim · ok",
    "→ proof pack written → artifacts/proofs/devnet/2026-05-15T08-12-44Z/",
    "✓ devnet acceptance · 47 checks · 0 fail",
  ],
  followups: [
    { label: "pnpm proofs:verify", note: "verify a bundle against live RPC" },
    { label: "pnpm devnet:proof-pack", note: "export a portable evidence folder" },
    { label: "pnpm testnet:readiness", note: "check the public-testnet release gate" },
  ],
};

export const FAQ = {
  eyebrow: "07 · Questions",
  headline: "Things people ask.",
  items: [
    {
      q: "Is mainnet live?",
      a: "No. Public testnet is gated on multi-bootnode launch material and signed release artifacts. Mainnet requires production protocol/admin coverage — every privileged authority on a Qubitor Account or stricter PQ policy.",
    },
    {
      q: "What is ML-DSA-65?",
      a: "NIST FIPS 204 — a module-lattice digital signature scheme designed for resistance against large-scale quantum adversaries. Qubitor verifies it inside the EVM at the precompile 0x…0100.",
    },
    {
      q: 'Why "no EOA anywhere"?',
      a: "ECDSA keys are the primary quantum target. If every Qubitor address is a PQ smart account verified by ML-DSA, breaking ECDSA alone does not move funds — and the same rule applies to bridge guardians, sequencer operators, treasuries, and admin keys.",
    },
    {
      q: "Has the precompile been audited?",
      a: "Not yet. External audit is a release gate before mainnet. The Go implementation derives from Cloudflare CIRCL's ML-DSA-65, and the integration is exercised by Go unit tests, Foundry contract tests, and devnet acceptance smoke.",
    },
    {
      q: "What if ML-DSA itself is broken?",
      a: "Crypto-agility. SLH-DSA (FIPS 205, hash-based) is tracked as the fallback under third_party/sphincsminus — research-only today, not a default signing mode, and not part of the consensus path.",
    },
    {
      q: "How do I verify the devnet locally?",
      a: "Run pnpm devnet:acceptance against a local CoreGeth fork. It produces a portable proof pack under artifacts/proofs/devnet/<timestamp>/ that you can re-verify against live RPC with pnpm proofs:verify.",
    },
    {
      q: "What about bridges?",
      a: "Bridge guardian, withdrawal, and admin authorities are covered by the same threat model — every privileged authority must be a Qubitor Account or stricter PQ policy before it is part of the public claim.",
    },
  ],
};

export const CTA = {
  eyebrow: "08 · Enter",
  headline: "The signature is the chain.",
  body: "Read the docs, read the threat model, run the devnet locally, or follow along as the testnet opens.",
  links: [
    { label: "Read the docs", href: LINKS.docs },
    { label: "GitHub", href: LINKS.github },
    { label: "Threat model", href: LINKS.threatModel },
    { label: "X / Twitter", href: LINKS.twitter },
    { label: "Community", href: LINKS.community },
  ],
};
