"use client";

/**
 * Canonical genesis/system addresses (from the gateway `/chain` doc and
 * qubitor_getNetworkSecurityStatus), plus the event ABI fragments the
 * explorer recognizes. Decoding is best-effort: logs are fetched by address
 * and decoded opportunistically, so an unknown signature degrades to a raw
 * row instead of hiding the event.
 */

import { type AbiEvent, type Log, decodeEventLog, parseAbiItem } from "viem";

export const SYSTEM = {
  mldsa65Precompile: "0x0000000000000000000000000000000000000100",
  securityModeRegistry: "0x0000000000000000000000000000000000000201",
  accountReadinessRegistry: "0x0000000000000000000000000000000000000202",
  qubitorAccountFactory: "0x0000000000000000000000000000000000000203",
  bridgeRegistry: "0x0000000000000000000000000000000000000301",
  bridgeGuardianVerifier: "0x0000000000000000000000000000000000000302",
  nativeBridgeVault: "0x0000000000000000000000000000000000000303",
} as const;

export const SYSTEM_LABEL: Record<string, string> = {
  [SYSTEM.mldsa65Precompile]: "ML-DSA-65 Verify Precompile",
  [SYSTEM.securityModeRegistry]: "SecurityModeRegistry",
  [SYSTEM.accountReadinessRegistry]: "AccountReadinessRegistry",
  [SYSTEM.qubitorAccountFactory]: "QubitorAccountFactory",
  [SYSTEM.bridgeRegistry]: "QubitorNativeBridge · Registry",
  [SYSTEM.bridgeGuardianVerifier]: "QubitorNativeBridge · GuardianVerifier",
  [SYSTEM.nativeBridgeVault]: "QubitorNativeBridge · Vault",
};

/**
 * Event fragments. These are the signatures the explorer tags specially;
 * anything else still renders as a generic event row.
 */
export const EVENT_ABI: AbiEvent[] = [
  parseAbiItem(
    "event AccountCreated(address indexed account, bytes32 indexed pqPublicKeyCommitment, bytes32 salt)",
  ),
  parseAbiItem(
    "event ExecutedPQ(address indexed target, uint256 value, bytes data, uint256 nonce)",
  ),
  parseAbiItem(
    "event PQKeyRotated(bytes32 indexed previousPublicKeyCommitment, bytes32 indexed newPublicKeyCommitment, uint256 nonce)",
  ),
  parseAbiItem(
    "event SecurityModeRecorded(address indexed account, uint8 mode)",
  ),
  parseAbiItem(
    "event ReadinessRecorded(address indexed account, uint8 readiness)",
  ),
  parseAbiItem(
    "event TreasuryReceived(address indexed from, uint256 amount)",
  ),
  parseAbiItem(
    "event TreasuryTransferred(address indexed to, uint256 amount, uint256 nonce)",
  ),
  parseAbiItem(
    "event PolicyRecorded(bytes32 indexed policyId, uint256 nonce)",
  ),
] as AbiEvent[];

export type DecodedEvent = {
  name: string;
  args: Record<string, unknown>;
  known: boolean;
};

/** Try each known fragment; fall back to a raw (unknown) descriptor. */
export function decodeKnownLog(log: Log): DecodedEvent {
  for (const ev of EVENT_ABI) {
    try {
      const decoded = decodeEventLog({
        abi: [ev],
        data: log.data,
        topics: log.topics,
      });
      return {
        name: decoded.eventName as string,
        args: (decoded.args as Record<string, unknown>) ?? {},
        known: true,
      };
    } catch {
      // try next fragment
    }
  }
  return {
    name: log.topics?.[0]?.slice(0, 10) ?? "UNKNOWN",
    args: {},
    known: false,
  };
}

/** Addresses whose logs power the live PQ event feed + proof reconstruction. */
export const WATCHED_ADDRESSES: string[] = [
  SYSTEM.qubitorAccountFactory,
  SYSTEM.securityModeRegistry,
  SYSTEM.accountReadinessRegistry,
  SYSTEM.bridgeRegistry,
  SYSTEM.nativeBridgeVault,
];
