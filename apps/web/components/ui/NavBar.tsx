import Image from "next/image";
import { LINKS } from "@/lib/copy";

export function NavBar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-5 md:px-10">
      <a
        href="#hero"
        data-magnet
        data-cursor="link"
        className="flex items-center gap-3"
        aria-label="Qubitor — home"
      >
        <Image
          src="/brand/logo-vector.png"
          alt=""
          width={36}
          height={36}
          priority
          className="opacity-90"
        />
        <span className="qb-label text-qb-bone">QUBITOR</span>
      </a>

      <nav className="hidden gap-8 md:flex" aria-label="Primary">
        <a
          href="#quantum-risk"
          data-magnet
          data-cursor="link"
          className="qb-label hover:text-qb-bone"
        >
          Risk
        </a>
        <a
          href="#smart-accounts"
          data-magnet
          data-cursor="link"
          className="qb-label hover:text-qb-bone"
        >
          Accounts
        </a>
        <a
          href="#network"
          data-magnet
          data-cursor="link"
          className="qb-label hover:text-qb-bone"
        >
          Network
        </a>
        <a
          href="#roadmap"
          data-magnet
          data-cursor="link"
          className="qb-label hover:text-qb-bone"
        >
          Roadmap
        </a>
      </nav>

      <a
        href={LINKS.github}
        target="_blank"
        rel="noreferrer noopener"
        data-magnet
        data-cursor="link"
        className="qb-label border border-qb-line-strong px-3 py-2 text-qb-bone hover:bg-qb-bone hover:text-qb-black"
      >
        Github
      </a>
    </header>
  );
}
