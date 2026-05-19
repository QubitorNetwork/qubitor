import { LINKS, BRAND } from "@/lib/copy";

export function Footer() {
  return (
    <footer className="relative border-t border-qb-line px-6 py-10 md:px-10">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <p className="qb-label text-qb-mist">
          © {new Date().getFullYear()} {BRAND.name} Network · Devnet · Chain ID{" "}
          {BRAND.chainId}
        </p>
        <div className="flex flex-wrap gap-6">
          <a
            data-magnet
            data-cursor="link"
            className="qb-label text-qb-mist hover:text-qb-bone"
            href={LINKS.docs}
            target="_blank"
            rel="noreferrer noopener"
          >
            Docs
          </a>
          <a
            data-magnet
            data-cursor="link"
            className="qb-label text-qb-mist hover:text-qb-bone"
            href={LINKS.threatModel}
            target="_blank"
            rel="noreferrer noopener"
          >
            Threat model
          </a>
          <a
            data-magnet
            data-cursor="link"
            className="qb-label text-qb-mist hover:text-qb-bone"
            href={LINKS.github}
            target="_blank"
            rel="noreferrer noopener"
          >
            Github
          </a>
          <a
            data-magnet
            data-cursor="link"
            className="qb-label text-qb-mist hover:text-qb-bone"
            href={LINKS.twitter}
            target="_blank"
            rel="noreferrer noopener"
          >
            X
          </a>
          <a
            data-magnet
            data-cursor="link"
            className="qb-label text-qb-mist hover:text-qb-bone"
            href={LINKS.community}
            target="_blank"
            rel="noreferrer noopener"
          >
            Community
          </a>
        </div>
      </div>
    </footer>
  );
}
