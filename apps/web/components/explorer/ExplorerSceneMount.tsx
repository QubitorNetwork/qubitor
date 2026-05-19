"use client";

import dynamic from "next/dynamic";

const ExplorerScene = dynamic(
  () => import("./ExplorerScene").then((m) => m.ExplorerScene),
  { ssr: false },
);

/** Client-only wrapper, mirroring SceneRootMount, so the server layout can
 *  render the explorer canvas without SSR. */
export function ExplorerSceneMount() {
  return <ExplorerScene />;
}
