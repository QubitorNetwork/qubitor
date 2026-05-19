"use client";

/**
 * Split a single text node into per-character spans, preserving spaces.
 * Returns the array of OUTER span elements (with `data-char`). Each outer
 * span contains an inner `[data-char-inner]` span — GSAP can scrub the outer
 * (yPercent, opacity) while a CSS animation drifts the inner without
 * conflicting transforms.
 *
 * Re-running on the same element is a no-op if it's already been split.
 */
export function splitChars(el: HTMLElement): HTMLSpanElement[] {
  if (el.dataset.split === "chars") {
    return Array.from(el.querySelectorAll<HTMLSpanElement>("span[data-char]"));
  }
  const text = el.textContent ?? "";
  el.textContent = "";
  el.dataset.split = "chars";

  const spans: HTMLSpanElement[] = [];
  const words = text.split(/(\s+)/);
  let charIndex = 0;
  for (const word of words) {
    if (/^\s+$/.test(word)) {
      const space = document.createElement("span");
      space.innerHTML = "&nbsp;";
      space.style.display = "inline-block";
      el.appendChild(space);
      continue;
    }
    const wordWrap = document.createElement("span");
    wordWrap.style.display = "inline-block";
    wordWrap.style.whiteSpace = "nowrap";
    for (const ch of Array.from(word)) {
      const outer = document.createElement("span");
      outer.dataset.char = "";
      outer.style.display = "inline-block";
      outer.style.willChange = "transform, opacity";

      const inner = document.createElement("span");
      inner.dataset.charInner = "";
      inner.style.display = "inline-block";
      // Stagger the idle drift via per-char animation-delay (set in CSS).
      inner.style.setProperty("--qb-char-i", String(charIndex));
      inner.textContent = ch;

      outer.appendChild(inner);
      wordWrap.appendChild(outer);
      spans.push(outer);
      charIndex++;
    }
    el.appendChild(wordWrap);
  }
  return spans;
}
