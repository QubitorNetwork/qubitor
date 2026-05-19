"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const SceneRoot = dynamic(
  () => import("./SceneRoot").then((m) => m.SceneRoot),
  { ssr: false },
);

/**
 * Mounts the landing canvas globally — EXCEPT on the explorer, which renders
 * its own chain-reactive lattice (components/explorer/ExplorerScene). Keeping
 * the suppression here guarantees only one WebGL context is ever alive.
 */
export function SceneRootMount() {
  const pathname = usePathname();
  if (pathname?.startsWith("/explorer")) return null;
  return <SceneRoot />;
}
