import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LenisProvider } from "@/components/lenis/LenisProvider";
import { NavBar } from "@/components/ui/NavBar";
import { Footer } from "@/components/ui/Footer";
import { ProgressBar } from "@/components/ui/ScrollProgress";
import { DataTape } from "@/components/ui/DataTape";
import { Scanlines } from "@/components/ui/Scanlines";
import { SceneRootMount } from "@/components/canvas/SceneRootMount";
import { SiteShell } from "@/components/ui/SiteShell";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["400", "500", "700"],
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Qubitor Network — A post-quantum security layer for value",
  description:
    "Qubitor is a mineable EVM L1 with ML-DSA-native smart accounts. No EOA anywhere.",
  openGraph: {
    title: "Qubitor Network",
    description:
      "A post-quantum security layer for value. ML-DSA-65 native smart accounts on a mineable EVM L1.",
    type: "website",
  },
  metadataBase: new URL("https://qubitor.network"),
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="bg-qb-black text-qb-bone antialiased">
        <a href="#top" className="qb-skip">
          Skip to content
        </a>
        <LenisProvider>
          <SiteShell>
            <SceneRootMount />
            <Scanlines />
            <div className="relative z-10">
              <NavBar />
              <DataTape />
              <ProgressBar />
              <main id="top">{children}</main>
              <Footer />
            </div>
          </SiteShell>
        </LenisProvider>
      </body>
    </html>
  );
}
