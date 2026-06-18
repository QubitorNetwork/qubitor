import assert from "node:assert/strict";
import http from "node:http";
import { qubitorAdminControlSurfaces, qubitorDevnet } from "@qubitor/chain-config";

interface RpcPayload {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: unknown[];
}

interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.equal(typeof address, "object");
      assert.notEqual(address, null);
      resolve((address as { port: number }).port);
    });
  });
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const upstreamCalls: RpcPayload[] = [];
const upstream = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    const payload = JSON.parse(body) as RpcPayload;
    upstreamCalls.push(payload);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: payload.id ?? null,
        result: payload.method === "eth_chainId" ? "0x164ca" : { method: payload.method, params: payload.params ?? [] },
      }),
    );
  });
});

const upstreamPort = await listen(upstream);
process.env.QUBITOR_RPC_GATEWAY_DISABLE_LISTEN = "1";
process.env.QUBITOR_RPC_URL = `http://127.0.0.1:${upstreamPort}`;

const gatewayModule = await import("./index.js");
const gateway = gatewayModule.createRpcGatewayServer();
const gatewayPort = await listen(gateway);
const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;

async function postRpc(payload: unknown): Promise<{ status: number; body: RpcResponse | RpcResponse[]; cors: string | null }> {
  const response = await fetch(`${gatewayUrl}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://0xq.app" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: (await response.json()) as RpcResponse | RpcResponse[],
    cors: response.headers.get("access-control-allow-origin"),
  };
}

try {
  assert.equal(qubitorDevnet.chainId, 91337);
  assert.equal(qubitorAdminControlSurfaces.some((surface) => surface.id === "pq-native-faucet-treasury"), true);
  assert.equal(qubitorAdminControlSurfaces.some((surface) => surface.id === "faucet-gas-payer"), false);

  assert.equal(gatewayModule.isAllowedPublicRpcMethod("eth_chainId"), true);
  assert.equal(gatewayModule.isAllowedPublicRpcMethod("qubitor_sendRawPQTransaction"), true);
  assert.equal(gatewayModule.isAllowedPublicRpcMethod("qubitor_getMiningStatus"), true);
  assert.equal(gatewayModule.isAllowedPublicRpcMethod("trace_block"), false);
  assert.equal(gatewayModule.isBlockedRpcMethod("admin_nodeInfo"), true);
  assert.equal(gatewayModule.isBlockedRpcMethod("debug_verbosity"), true);
  assert.equal(gatewayModule.isBlockedRpcMethod("txpool_status"), true);

  assert.deepEqual(Object.keys(gatewayModule.publicHealthPayload()).sort(), ["chainId", "network", "ok"]);
  const health = await fetch(`${gatewayUrl}/health`);
  assert.equal(health.status, 200);
  const healthBody = (await health.json()) as Record<string, unknown>;
  assert.equal(healthBody.ok, true);
  assert.equal("upstreamRpcUrl" in healthBody, false);

  upstreamCalls.length = 0;
  const allowed = await postRpc({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
  assert.equal(allowed.status, 200);
  assert.equal((allowed.body as RpcResponse).result, "0x164ca");
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0]?.method, "eth_chainId");
  assert.equal(allowed.cors, "*");

  upstreamCalls.length = 0;
  const pqSubmit = await postRpc({
    jsonrpc: "2.0",
    id: 6,
    method: "qubitor_sendRawPQTransaction",
    params: ["0x04"],
  });
  assert.equal(pqSubmit.status, 200);
  assert.equal((pqSubmit.body as RpcResponse).error, undefined);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0]?.method, "qubitor_sendRawPQTransaction");

  for (const method of [
    "admin_nodeInfo",
    "debug_verbosity",
    "personal_listAccounts",
    "miner_start",
    "txpool_status",
    "engine_exchangeCapabilities",
    "trace_block",
  ]) {
    upstreamCalls.length = 0;
    const blocked = await postRpc({ jsonrpc: "2.0", id: method, method, params: [] });
    assert.equal(blocked.status, 200);
    assert.equal((blocked.body as RpcResponse).error?.code, -32601);
    assert.match((blocked.body as RpcResponse).error?.message ?? "", /not available/);
    assert.equal(upstreamCalls.length, 0);
  }

  upstreamCalls.length = 0;
  const batch = await postRpc([
    { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    { jsonrpc: "2.0", id: 2, method: "admin_nodeInfo", params: [] },
  ]);
  assert.equal(batch.status, 200);
  assert.equal(Array.isArray(batch.body), true);
  const batchBody = batch.body as RpcResponse[];
  assert.equal(batchBody[0]?.result, "0x164ca");
  assert.equal(batchBody[1]?.error?.code, -32601);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0]?.method, "eth_chainId");

  const tooManyBatchItems = Array.from({ length: gatewayModule.MAX_RPC_BATCH_SIZE + 1 }, (_, id) => ({
    jsonrpc: "2.0",
    id,
    method: "eth_chainId",
    params: [],
  }));
  const tooLargeBatch = await postRpc(tooManyBatchItems);
  assert.equal((tooLargeBatch.body as RpcResponse).error?.code, -32600);

  const tooManyParams = await postRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "eth_call",
    params: Array.from({ length: gatewayModule.MAX_RPC_PARAMS + 1 }, () => "0x"),
  });
  assert.equal((tooManyParams.body as RpcResponse).error?.code, -32602);

  const malformed = await postRpc("{not-json");
  assert.equal(malformed.status, 200);
  assert.equal((malformed.body as RpcResponse).error?.code, -32700);

  const oversized = await fetch(`${gatewayUrl}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(gatewayModule.MAX_RPC_BODY_BYTES + 1),
  });
  assert.equal(oversized.status, 413);

  assert.equal(gatewayModule.validateRpcRequest({ jsonrpc: "2.0", id: 4, method: "eth_chainId", params: [] }), undefined);
  assert.equal(
    gatewayModule.validateRpcRequest({ jsonrpc: "2.0", id: 5, method: "eth_chainId", params: { bad: true } })
      ?.error?.code,
    -32602,
  );

  console.log("@qubitor/rpc-gateway tests passed");
} finally {
  await close(gateway);
  await close(upstream);
}
