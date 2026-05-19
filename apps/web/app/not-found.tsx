import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative flex min-h-[100svh] w-full flex-col items-center justify-center px-6 text-center">
      <div className="qb-grid absolute inset-0 opacity-[0.10]" aria-hidden />
      <div className="absolute inset-0 qb-vignette" aria-hidden />

      <Image
        src="/brand/logo-vector.png"
        alt=""
        width={96}
        height={96}
        priority
        className="opacity-90"
      />
      <span className="qb-label mt-8 text-qb-mist">SIGNAL LOST · 404</span>
      <h1 className="qb-display mt-6 max-w-[18ch] text-[clamp(2.5rem,6vw,5rem)] text-qb-bone">
        The path you were following does not exist on this chain.
      </h1>
      <p className="qb-body mt-6 max-w-[52ch] text-qb-mist">
        Either the resource was relocated, or the link was forged with a key
        that no longer authorizes.
      </p>
      <Link
        href="/"
        data-cursor="link"
        className="qb-label mt-10 inline-flex items-center gap-3 border border-qb-line-strong px-5 py-3 text-qb-bone transition-colors duration-500 hover:bg-qb-bone hover:text-qb-black"
      >
        Return to overture
        <span aria-hidden className="inline-block h-px w-6 bg-qb-line-strong" />
      </Link>
    </main>
  );
}
