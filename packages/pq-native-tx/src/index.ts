import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { concatHex, encodeAbiParameters, getAddress, http, keccak256, numberToHex, stringToHex, toRlp, type Hex } from "viem";
import {
  QUBITOR_ACCOUNT_CREATION_CODE,
  QUBITOR_ACCOUNT_FACTORY,
  QUBITOR_ACCOUNT_READINESS_REGISTRY,
  QUBITOR_SECURITY_MODE_REGISTRY,
} from "./system-contracts.js";

export type { Hex };

export const QUBITOR_PQ_TX_TYPE = 0x04;
export const QUBITOR_PQ_TX_TYPE_HEX = "0x04" as const;
export const QUBITOR_PQ_TX_CONTEXT = "QUBITOR_PQ_TX_V1";
export const QUBITOR_PQ_ACCOUNT_DOMAIN = "QUBITOR_ACCOUNT_V1";
export const QUBITOR_ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
export const QUBITOR_DEVNET_PQ_SEED =
  "0x5151515151515151515151515151515151515151515151515151515151515151" as const;
export const ML_DSA_65_PUBLIC_KEY_BYTES = ml_dsa65.lengths.publicKey;
export const ML_DSA_65_SECRET_KEY_BYTES = ml_dsa65.lengths.secretKey;
export const ML_DSA_65_SIGNATURE_BYTES = ml_dsa65.lengths.signature;

export interface MLDSA65KeyPair {
  publicKey: Hex;
  privateKey: Hex;
}

export interface MLDSA65SignOptions {
  context?: string | Uint8Array;
  deterministic?: boolean;
}

export interface QubitorPQAccessListEntry {
  address: Hex;
  storageKeys: readonly Hex[];
}

export type QubitorPQNumberish = bigint | number | string;

export interface QubitorPQTxV1Unsigned {
  chainId: QubitorPQNumberish;
  nonce: QubitorPQNumberish;
  gasTipCap: QubitorPQNumberish;
  gasFeeCap: QubitorPQNumberish;
  gas: QubitorPQNumberish;
  account?: Hex;
  factorySalt?: Hex;
  to?: Hex;
  value?: QubitorPQNumberish;
  data?: Hex;
  accessList?: readonly QubitorPQAccessListEntry[];
  pqPublicKey: Hex;
  pqContext?: string;
}

export interface QubitorPQTxV1Signed extends QubitorPQTxV1Unsigned {
  pqSignature: Hex;
}

export interface QubitorPQTxV1SignRequest extends QubitorPQTxV1Unsigned {
  pqPrivateKey: Hex;
}

export interface QubitorPQTxV1SignResult {
  signingHash: Hex;
  signature: Hex;
  rawTransaction: Hex;
  transaction: QubitorPQTxV1Signed;
}

interface NormalizedQubitorPQTxV1 {
  chainId: bigint;
  nonce: bigint;
  gasTipCap: bigint;
  gasFeeCap: bigint;
  gas: bigint;
  account: Hex;
  factorySalt: Hex;
  to: Hex;
  value: bigint;
  data: Hex;
  accessList: readonly QubitorPQAccessListEntry[];
  pqPublicKey: Hex;
  pqContext: string;
  pqSignature?: Hex;
}

type RlpHex = Hex | readonly RlpHex[];

export function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToBytes(hex: Hex, label = "hex"): Uint8Array {
  if (!hex.startsWith("0x")) throw new Error(`${label} must start with 0x`);
  const value = hex.slice(2);
  if (value.length % 2 !== 0) throw new Error(`${label} must have an even number of hex characters`);
  if (!/^[0-9a-fA-F]*$/.test(value)) throw new Error(`${label} contains non-hex characters`);

  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function assertByteLength(value: Uint8Array, expected: number | undefined, label: string) {
  if (expected !== undefined && value.length !== expected) {
    throw new Error(`${label} must be ${expected} bytes, got ${value.length}`);
  }
}

function assertHexBytes(value: Hex, label: string, expectedBytes?: number): Hex {
  if (!/^0x[0-9a-fA-F]*$/.test(value)) throw new Error(`${label} must be 0x-prefixed hex`);
  const byteLength = (value.length - 2) / 2;
  if (!Number.isInteger(byteLength)) throw new Error(`${label} must have an even number of hex characters`);
  if (expectedBytes !== undefined && byteLength !== expectedBytes) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${byteLength}`);
  }
  return value.toLowerCase() as Hex;
}

function asciiBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x7f) throw new Error("ML-DSA context must be ASCII");
    out[i] = code;
  }
  return out;
}

function contextBytes(context: string | Uint8Array = QUBITOR_PQ_TX_CONTEXT): Uint8Array {
  return typeof context === "string" ? asciiBytes(context) : context;
}

function messageBytes(message: Hex | Uint8Array): Uint8Array {
  return typeof message === "string" ? hexToBytes(message, "message") : message;
}

export function generateMLDSA65KeyPair(seed?: Uint8Array | Hex): MLDSA65KeyPair {
  const seedBytes = typeof seed === "string" ? hexToBytes(seed, "seed") : seed;
  if (seedBytes) assertByteLength(seedBytes, ml_dsa65.lengths.seed, "seed");

  const keypair = ml_dsa65.keygen(seedBytes);
  return {
    publicKey: bytesToHex(keypair.publicKey),
    privateKey: bytesToHex(keypair.secretKey),
  };
}

export function signMLDSA65(
  message: Hex | Uint8Array,
  privateKey: Hex | Uint8Array,
  options: MLDSA65SignOptions = {},
): Hex {
  const secretKey = typeof privateKey === "string" ? hexToBytes(privateKey, "privateKey") : privateKey;
  assertByteLength(secretKey, ML_DSA_65_SECRET_KEY_BYTES, "privateKey");

  const signature = ml_dsa65.sign(messageBytes(message), secretKey, {
    context: contextBytes(options.context),
    extraEntropy: options.deterministic === false ? undefined : false,
  });
  return bytesToHex(signature);
}

function quantityToBigInt(value: QubitorPQNumberish | undefined, label: string): bigint {
  if (value === undefined) return 0n;
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${label} must be non-negative`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    const parsed = BigInt(trimmed);
    if (parsed < 0n) throw new Error(`${label} must be non-negative`);
    return parsed;
  }
  if (/^[0-9]+$/.test(trimmed)) return BigInt(trimmed);
  throw new Error(`${label} must be a bigint, safe integer, decimal string, or hex quantity`);
}

function assertUint64(value: bigint, label: string) {
  if (value > 0xffffffffffffffffn) throw new Error(`${label} must fit in uint64`);
}

function quantityToRlpHex(value: bigint): Hex {
  return value === 0n ? "0x" : numberToHex(value);
}

function assertAscii(value: string, label: string): string {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x7f) throw new Error(`${label} must be ASCII`);
  }
  return value;
}

function normalizeQubitorPQAccessList(
  accessList: readonly QubitorPQAccessListEntry[] = [],
): readonly QubitorPQAccessListEntry[] {
  return accessList.map((entry, index) => ({
    address: getAddress(entry.address) as Hex,
    storageKeys: entry.storageKeys.map((storageKey, storageKeyIndex) =>
      assertHexBytes(storageKey, `accessList[${index}].storageKeys[${storageKeyIndex}]`, 32),
    ),
  }));
}

function serializeQubitorPQAccessList(accessList: readonly QubitorPQAccessListEntry[]): readonly RlpHex[] {
  return accessList.map((entry) => [entry.address, entry.storageKeys] as const);
}

function normalizeQubitorPQTxV1(tx: QubitorPQTxV1Signed): NormalizedQubitorPQTxV1 & { pqSignature: Hex };
function normalizeQubitorPQTxV1(tx: QubitorPQTxV1Unsigned): NormalizedQubitorPQTxV1;
function normalizeQubitorPQTxV1(tx: QubitorPQTxV1Unsigned | QubitorPQTxV1Signed): NormalizedQubitorPQTxV1 {
  const chainId = quantityToBigInt(tx.chainId, "chainId");
  const nonce = quantityToBigInt(tx.nonce, "nonce");
  const gas = quantityToBigInt(tx.gas, "gas");
  assertUint64(nonce, "nonce");
  assertUint64(gas, "gas");

  const factorySalt = assertHexBytes(tx.factorySalt ?? QUBITOR_ZERO_HASH, "factorySalt", 32);
  const pqPublicKey = assertHexBytes(tx.pqPublicKey, "pqPublicKey", ML_DSA_65_PUBLIC_KEY_BYTES);
  const account = deriveQubitorPQAccountAddress(pqPublicKey, factorySalt);
  if (tx.account && getAddress(tx.account) !== account) {
    throw new Error("account must match the QubitorPQTxV1 publicKey/factorySalt binding");
  }

  const normalized: NormalizedQubitorPQTxV1 = {
    chainId,
    nonce,
    gasTipCap: quantityToBigInt(tx.gasTipCap, "gasTipCap"),
    gasFeeCap: quantityToBigInt(tx.gasFeeCap, "gasFeeCap"),
    gas,
    account,
    factorySalt,
    to: tx.to ? (getAddress(tx.to) as Hex) : "0x",
    value: quantityToBigInt(tx.value, "value"),
    data: assertHexBytes(tx.data ?? "0x", "data"),
    accessList: normalizeQubitorPQAccessList(tx.accessList),
    pqPublicKey,
    pqContext: assertAscii(tx.pqContext ?? QUBITOR_PQ_TX_CONTEXT, "pqContext"),
  };

  if ("pqSignature" in tx && tx.pqSignature !== undefined) {
    normalized.pqSignature = assertHexBytes(tx.pqSignature, "pqSignature", ML_DSA_65_SIGNATURE_BYTES);
  }

  return normalized;
}

function qubitorPQContextHex(context: string): Hex {
  return stringToHex(context) as Hex;
}

export function deriveQubitorPQAccountAddress(publicKey: Hex, factorySalt: Hex = QUBITOR_ZERO_HASH): Hex {
  const normalizedPublicKey = assertHexBytes(publicKey, "pqPublicKey", ML_DSA_65_PUBLIC_KEY_BYTES);
  const normalizedSalt = assertHexBytes(factorySalt, "factorySalt", 32);
  const constructorArgs = encodeAbiParameters(
    [{ type: "bytes" }, { type: "address" }, { type: "address" }],
    [normalizedPublicKey, QUBITOR_SECURITY_MODE_REGISTRY, QUBITOR_ACCOUNT_READINESS_REGISTRY],
  );
  const initCodeHash = keccak256(concatHex([QUBITOR_ACCOUNT_CREATION_CODE, constructorArgs]));
  const digest = keccak256(
    concatHex([`0xff${QUBITOR_ACCOUNT_FACTORY.slice(2)}${normalizedSalt.slice(2)}${initCodeHash.slice(2)}`]),
  );
  return getAddress(`0x${digest.slice(-40)}`) as Hex;
}

function qubitorPQTxV1SigningFields(tx: NormalizedQubitorPQTxV1): readonly RlpHex[] {
  return [
    qubitorPQContextHex(QUBITOR_PQ_TX_CONTEXT),
    quantityToRlpHex(tx.chainId),
    quantityToRlpHex(tx.nonce),
    quantityToRlpHex(tx.gasTipCap),
    quantityToRlpHex(tx.gasFeeCap),
    quantityToRlpHex(tx.gas),
    tx.account,
    tx.factorySalt,
    tx.to,
    quantityToRlpHex(tx.value),
    tx.data,
    serializeQubitorPQAccessList(tx.accessList),
    tx.pqPublicKey,
    qubitorPQContextHex(tx.pqContext),
  ];
}

function qubitorPQTxV1EnvelopeFields(tx: NormalizedQubitorPQTxV1 & { pqSignature: Hex }): readonly RlpHex[] {
  return [
    quantityToRlpHex(tx.chainId),
    quantityToRlpHex(tx.nonce),
    quantityToRlpHex(tx.gasTipCap),
    quantityToRlpHex(tx.gasFeeCap),
    quantityToRlpHex(tx.gas),
    tx.account,
    tx.factorySalt,
    tx.to,
    quantityToRlpHex(tx.value),
    tx.data,
    serializeQubitorPQAccessList(tx.accessList),
    tx.pqPublicKey,
    qubitorPQContextHex(tx.pqContext),
    tx.pqSignature,
  ];
}

function hashNormalizedQubitorPQTxV1(tx: NormalizedQubitorPQTxV1): Hex {
  return keccak256(concatHex([QUBITOR_PQ_TX_TYPE_HEX, toRlp(qubitorPQTxV1SigningFields(tx))]));
}

export function hashQubitorPQTxV1(tx: QubitorPQTxV1Unsigned): Hex {
  return hashNormalizedQubitorPQTxV1(normalizeQubitorPQTxV1(tx));
}

export function serializeQubitorPQTxV1(tx: QubitorPQTxV1Signed): Hex {
  const normalized = normalizeQubitorPQTxV1(tx);
  return concatHex([QUBITOR_PQ_TX_TYPE_HEX, toRlp(qubitorPQTxV1EnvelopeFields(normalized))]);
}

export function signQubitorPQTxV1(tx: QubitorPQTxV1SignRequest): QubitorPQTxV1SignResult {
  const normalized = normalizeQubitorPQTxV1(tx);
  const signingHash = hashNormalizedQubitorPQTxV1(normalized);
  const signature = signMLDSA65(signingHash, tx.pqPrivateKey, { context: normalized.pqContext });
  const { pqPrivateKey: _pqPrivateKey, ...unsignedTx } = tx;
  const transaction: QubitorPQTxV1Signed = {
    ...unsignedTx,
    account: normalized.account,
    factorySalt: normalized.factorySalt,
    to: tx.to ? (getAddress(tx.to) as Hex) : undefined,
    value: normalized.value.toString(),
    data: normalized.data,
    accessList: normalized.accessList,
    pqContext: normalized.pqContext,
    pqSignature: signature,
  };

  return {
    signingHash,
    signature,
    rawTransaction: serializeQubitorPQTxV1(transaction),
    transaction,
  };
}

export async function jsonRpc<T>(rpcUrl: string, method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? `${method} failed`);
  return payload.result as T;
}

export async function sendRawQubitorPQTxV1(
  rawTransaction: Hex,
  config: { rpcUrl: string },
  method = "qubitor_sendRawPQTransaction",
): Promise<Hex> {
  return jsonRpc<Hex>(config.rpcUrl, method, [assertHexBytes(rawTransaction, "rawTransaction")]);
}

export function createViemTransport(rpcUrl: string) {
  return http(rpcUrl);
}
