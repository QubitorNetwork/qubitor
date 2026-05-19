import { getAddress, isAddress, type Hex } from "viem";

export interface AccountRequest {
  publicKey: Hex;
  salt?: Hex;
}

export interface RelayRequest {
  accountAddress: Hex;
  target: Hex;
  valueWei: bigint;
  data: Hex;
  nonce: bigint;
  signature: Hex;
  publicKey?: Hex;
  salt?: Hex;
}

export interface RotateRequest {
  accountAddress: Hex;
  newPublicKey: Hex;
  nonce: bigint;
  signature: Hex;
  publicKey?: Hex;
  salt?: Hex;
}

export interface RawPQTransactionRequest {
  rawTransaction: Hex;
  waitForReceipt?: boolean;
}

function asHex(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`${label} must be a 0x-prefixed hex string`);
  }
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`${label} contains non-hex characters`);
  }
  return value as Hex;
}

function asAddress(value: unknown, label: string): Hex {
  const address = asHex(value, label);
  if (!isAddress(address)) throw new Error(`${label} must be a valid address`);
  return getAddress(address) as Hex;
}

function asBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error(`${label} must be a decimal integer`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n) throw new Error(`${label} must be non-negative`);
  return parsed;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  throw new Error(`${label} must be a boolean`);
}

export function parseAccountRequest(body: Record<string, unknown>): AccountRequest {
  return {
    publicKey: asHex(body.publicKey, "publicKey"),
    salt: body.salt === undefined ? undefined : asHex(body.salt, "salt"),
  };
}

export function parseRelayRequest(body: Record<string, unknown>): RelayRequest {
  return {
    accountAddress: asAddress(body.accountAddress, "accountAddress"),
    target: asAddress(body.target, "target"),
    valueWei: asBigInt(body.valueWei, "valueWei"),
    data: body.data === undefined ? "0x" : asHex(body.data, "data"),
    nonce: asBigInt(body.nonce, "nonce"),
    signature: asHex(body.signature, "signature"),
    publicKey: body.publicKey === undefined ? undefined : asHex(body.publicKey, "publicKey"),
    salt: body.salt === undefined ? undefined : asHex(body.salt, "salt"),
  };
}

export function parseRotateRequest(body: Record<string, unknown>): RotateRequest {
  return {
    accountAddress: asAddress(body.accountAddress, "accountAddress"),
    newPublicKey: asHex(body.newPublicKey, "newPublicKey"),
    nonce: asBigInt(body.nonce, "nonce"),
    signature: asHex(body.signature, "signature"),
    publicKey: body.publicKey === undefined ? undefined : asHex(body.publicKey, "publicKey"),
    salt: body.salt === undefined ? undefined : asHex(body.salt, "salt"),
  };
}

export function parseRawPQTransactionRequest(body: Record<string, unknown>): RawPQTransactionRequest {
  return {
    rawTransaction: asHex(body.rawTransaction, "rawTransaction"),
    waitForReceipt: body.waitForReceipt === undefined ? undefined : asBoolean(body.waitForReceipt, "waitForReceipt"),
  };
}
