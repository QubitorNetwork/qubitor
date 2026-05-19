/**
 * Pure hex / bignum / address / time formatters. No deps, no "use client" —
 * safe to import anywhere.
 */

export function hexToBigInt(hex: string | undefined | null): bigint {
  if (!hex) return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

export function hexToNumber(hex: string | undefined | null): number {
  return Number(hexToBigInt(hex));
}

/** wei → QBT string, trimmed, up to `maxFrac` decimals. */
export function formatQbt(wei: bigint, maxFrac = 4): string {
  const neg = wei < 0n;
  const v = neg ? -wei : wei;
  const whole = v / 10n ** 18n;
  const frac = v % 10n ** 18n;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (maxFrac === 0 || frac === 0n) return `${neg ? "-" : ""}${wholeStr}`;
  let fracStr = frac.toString().padStart(18, "0").slice(0, maxFrac);
  fracStr = fracStr.replace(/0+$/, "");
  return `${neg ? "-" : ""}${wholeStr}${fracStr ? `.${fracStr}` : ""}`;
}

/** Middle-truncate a hash/address: 0x1234…cdef */
export function truncate(s: string | undefined | null, head = 6, tail = 4): string {
  if (!s) return "";
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function isAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}

export function isTxHash(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s.trim());
}

export function isBlockNumber(s: string): boolean {
  return /^\d+$/.test(s.trim()) || /^0x[0-9a-fA-F]+$/.test(s.trim());
}

/** Unix seconds → "12s ago" / "3m ago" / "2h ago". */
export function timeAgo(unixSeconds: number, now = Date.now()): string {
  const diff = Math.max(0, Math.floor(now / 1000 - unixSeconds));
  if (diff < 1) return "now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/** Tx type byte → human label. 0x04 is the Qubitor PQ-native envelope. */
export function txTypeLabel(type: string | undefined): string {
  switch (type) {
    case "0x4":
    case "0x04":
      return "QubitorPQTxV1";
    case "0x2":
    case "0x02":
      return "EIP-1559";
    case "0x1":
    case "0x01":
      return "EIP-2930";
    case "0x0":
    case "0x00":
    case undefined:
      return "Legacy";
    default:
      return `Type ${type}`;
  }
}

export function isPqTx(type: string | undefined): boolean {
  return type === "0x4" || type === "0x04";
}
