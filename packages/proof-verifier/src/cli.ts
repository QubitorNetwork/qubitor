#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { defaultQubitorRpcUrl, getConfiguredQubitorNetwork } from "@qubitor/chain-config";
import {
  type ProofBundle,
  ProofVerificationError,
  createHttpRpcClient,
  verifyProofBundle,
} from "./index.js";

interface CliOptions {
  rpcUrl: string;
  bundles: string[];
  json: boolean;
  help: boolean;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.bundles.length === 0) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const rpc = createHttpRpcClient(options.rpcUrl);
  const results: Array<Record<string, unknown>> = [];
  let failed = false;

  for (const bundlePath of options.bundles) {
    try {
      const bundle = await loadBundle(bundlePath);
      const report = await verifyProofBundle(bundle, { rpc });
      results.push({ bundle: bundlePath, ...report });
      if (!options.json) {
        console.log(
          `[qubitor-proof-verifier] ok ${report.proofType} ${report.subject} (${report.blockCount} blocks, ${report.transactionCount} txs, ${report.eventCount} events, ${report.checkCount} checks)`,
        );
      }
    } catch (error) {
      failed = true;
      if (error instanceof ProofVerificationError) {
        results.push({ bundle: bundlePath, ok: false, failures: error.failures });
        if (!options.json) {
          console.error(`[qubitor-proof-verifier] failed ${bundlePath}`);
          for (const failure of error.failures) {
            console.error(`- ${failure}`);
          }
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ bundle: bundlePath, ok: false, failures: [message] });
        if (!options.json) console.error(`[qubitor-proof-verifier] failed ${bundlePath}: ${message}`);
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: !failed, rpcUrl: options.rpcUrl, results }, null, 2));
  }
  if (failed) process.exit(1);
}

function parseArgs(args: string[]): CliOptions {
  const bundles: string[] = [];
  const network = getConfiguredQubitorNetwork();
  let rpcUrl = process.env.QUBITOR_RPC_URL ?? defaultQubitorRpcUrl(network);
  let json = false;
  let help = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--rpc") {
      rpcUrl = requireValue(args, ++index, "--rpc");
      continue;
    }
    if (arg === "--bundle") {
      bundles.push(requireValue(args, ++index, "--bundle"));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    }
    bundles.push(arg);
  }

  return { rpcUrl, bundles, json, help };
}

function requireValue(args: string[], index: number, name: string) {
  const value = args[index];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

async function loadBundle(bundlePath: string): Promise<ProofBundle> {
  const body = bundlePath.startsWith("http://") || bundlePath.startsWith("https://")
    ? await fetchText(bundlePath)
    : await readFile(bundlePath, "utf8");
  return JSON.parse(body) as ProofBundle;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

function printUsage() {
  console.log(`Usage:
  pnpm proofs:verify --rpc http://127.0.0.1:18545/rpc --bundle proof.json
  pnpm proofs:verify --rpc http://127.0.0.1:18545/rpc proof-a.json proof-b.json

Options:
  --rpc <url>       Ethereum JSON-RPC URL. Defaults to QUBITOR_RPC_URL or devnet gateway.
  --bundle <path>   JSON proof bundle path or URL. Can be repeated.
  --json            Emit machine-readable verification results.
  -h, --help        Show this help.
`);
}

void main().catch((error) => {
  console.error(`[qubitor-proof-verifier] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
