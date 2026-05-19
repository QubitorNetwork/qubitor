# @qubitor/web

Marketing site for Qubitor Network — a post-quantum EVM L1 with ML-DSA-native smart accounts.

## Run

```sh
# from repo root
pnpm install
pnpm --filter @qubitor/web dev      # http://localhost:3000
pnpm --filter @qubitor/web typecheck
pnpm --filter @qubitor/web build
```

## Stack

- Next.js 15 app router · React 19
- Tailwind CSS v4 (`@import "tailwindcss"` + `@theme` tokens)
- React Three Fiber + Three.js (hero `DottedTorus`, section accents `WaveField`, `OrbitRings`)
- 2D Canvas `GlitchBust` overlay (no extra WebGL context)
- Lenis smooth scroll · GSAP ScrollTrigger
- Strict monochrome design tokens (`--color-qb-*`) match the brand graphics

## Editing copy

All page copy lives in [`lib/copy.ts`](./lib/copy.ts). Update there; sections are typed against the constants.

## Brand assets

Copied from the source `QUBITOR FULL GRAPHICS V2/` into `public/brand/`:

- `logo.png`, `logo-vector.png` — the Q mark
- `bg/BG1.png … BG10.png` — particle / wave / glitch backdrops, also used as `prefers-reduced-motion` fallbacks for the WebGL scenes
- `flyers/*.png` — section imagery (`quantum risk`, `smart accounts`, etc.)
- `personas/*.png` — the hooded oracle persona
- `icons/*.png` — pack icons

## Accessibility & performance

- Every WebGL canvas has a static-PNG fallback under `prefers-reduced-motion: reduce`.
- One landmark `<main>`, one `<section>` per page section with `aria-labelledby` to its `<h2>`.
- Visible focus ring (1px white + 4px offset) on all interactive elements.
- Canvases run at `dpr={[1, 1.5]}`, `frameloop` is throttled by RAF in `GlitchBust`.
