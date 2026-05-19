/**
 * QubitScan datasheet backdrop — paper sheet with a black graph-paper grid
 * and a very soft edge-darken. The literal inverse of the landing's dark
 * grid/noise/vignette. Fixed, behind the ink lattice canvas, never
 * interactive.
 */
export function ExplorerBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-20">
      <div className="absolute inset-0 bg-qb-black" />
      <div className="qx-grid absolute inset-0" />
      <div className="qx-vignette absolute inset-0" />
    </div>
  );
}
