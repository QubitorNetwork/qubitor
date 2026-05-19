"use client";

import { Cursor } from "@/components/ui/Cursor";
import { PageCurtain } from "@/components/ui/PageCurtain";
import { SectionIndex } from "@/components/ui/SectionIndex";
import { useMagnet } from "@/lib/useMagnet";

/**
 * Client-only shell: mounts the HUD cursor, the page-load curtain, the
 * section indicator, and installs magnetic-hover behavior on any element
 * carrying `data-magnet`. Layout passes children through.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  useMagnet("[data-magnet]");
  return (
    <>
      <PageCurtain />
      <Cursor />
      <SectionIndex />
      {children}
    </>
  );
}
