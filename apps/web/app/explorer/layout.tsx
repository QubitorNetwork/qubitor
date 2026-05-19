import type { Metadata } from "next";
import Link from "next/link";
import { HeadPoller } from "@/components/explorer/HeadPoller";
import { LiveBadge } from "@/components/explorer/LiveBadge";
import { ExplorerCommandBar } from "@/components/explorer/ExplorerCommandBar";
import { ExplorerBackdrop } from "@/components/explorer/ExplorerBackdrop";
import { ExplorerSceneMount } from "@/components/explorer/ExplorerSceneMount";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://qubitscan.qubitor.org";

const TITLE = "QubitScan — live Qubitor testnet explorer";
const DESCRIPTION =
  "QubitScan reads the live Qubitor testnet: blocks, QubitorPQTxV1 transactions, ML-DSA-65 accounts, the native bridge, and reconstructed post-quantum proofs — straight from the public RPC, no indexer.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · QubitScan",
  },
  description: DESCRIPTION,
  applicationName: "QubitScan",
  category: "technology",
  keywords: [
    "QubitScan",
    "Qubitor",
    "Qubitor testnet",
    "block explorer",
    "post-quantum blockchain",
    "ML-DSA-65",
    "QubitorPQTxV1",
    "post-quantum proofs",
    "EVM L1",
    "chain 91338",
  ],
  alternates: { canonical: "/explorer" },
  openGraph: {
    type: "website",
    siteName: "QubitScan",
    url: "/explorer",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const NAV = [
  { href: "/explorer", label: "Overview" },
  { href: "/explorer/blocks", label: "Blocks" },
  { href: "/explorer/proofs", label: "Proofs" },
  { href: "/", label: "Qubitor ↗" },
];

// Datasheet masthead metadata strip.
const SPEC = [
  ["REV", "0.1"],
  ["NET", "QUBITOR-TESTNET"],
  ["CHAIN", "91338"],
  ["RPC", "testrpc.qubitor.org"],
];

export default function ExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `.qx` scopes the inverted "datasheet" palette to the explorer subtree
    // only — the dark landing is untouched.
    <div className="qx relative min-h-screen">
      <HeadPoller />

      {/* Inverted background: paper graph-grid + faint ink plotter lattice
          that twitches on each new block. Global landing canvas is
          suppressed on /explorer (SceneRootMount), so only this is alive. */}
      <ExplorerBackdrop />
      <ExplorerSceneMount />

      {/* Datasheet masthead */}
      <header className="sticky top-0 z-30 border-b border-qb-line-strong bg-qb-ink">
        <div className="mx-auto max-w-[1440px] px-6 pt-24 md:px-10 md:pt-28">
          <div className="flex flex-col gap-4 pb-3 md:flex-row md:items-end md:gap-8">
            <div className="flex items-baseline gap-3">
              <Link
                href="/explorer"
                data-magnet
                data-cursor="link"
                className="font-display text-2xl font-bold tracking-tight text-qb-bone"
              >
                QUBITSCAN
              </Link>
              <span className="qb-label text-qb-mist">
                // LIVE TESTNET EXPLORER
              </span>
            </div>
            <div className="flex items-center gap-6 md:ml-2">
              <LiveBadge />
            </div>
            <nav
              className="flex flex-wrap gap-5 md:ml-auto"
              aria-label="Explorer"
            >
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  data-magnet
                  data-cursor="link"
                  className="qb-label text-qb-mist transition-colors hover:text-qb-bone"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* spec metadata strip */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-1 border-t border-qb-line py-2">
            {SPEC.map(([k, v]) => (
              <span key={k} className="qb-label text-qb-mist">
                {k}{" "}
                <span className="ml-1 text-qb-bone">{v}</span>
              </span>
            ))}
          </div>

          <div className="py-3">
            <ExplorerCommandBar />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-20">
        {children}
      </main>
    </div>
  );
}
