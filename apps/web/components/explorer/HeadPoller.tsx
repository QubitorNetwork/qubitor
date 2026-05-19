"use client";

import { useNetworkStatus } from "@/lib/qubitor/hooks";

/**
 * Invisible. Mounted once in the explorer layout so the global head store
 * stays fresh on every explorer route (LiveBadge, DataTape, the SceneRoot
 * canvas all read from it).
 */
export function HeadPoller() {
  useNetworkStatus();
  return null;
}
