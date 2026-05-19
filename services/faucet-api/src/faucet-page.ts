interface FaucetPageOptions {
  networkName: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl?: string;
  faucetAddress: string;
  amountWei: bigint;
  claimWindowMs: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatQbtAmount(value: bigint | string): string {
  const wei = typeof value === "bigint" ? value : BigInt(value);
  const sign = wei < 0n ? "-" : "";
  const absolute = wei < 0n ? -wei : wei;
  const whole = absolute / 1_000_000_000_000_000_000n;
  const fraction = (absolute % 1_000_000_000_000_000_000n).toString().padStart(18, "0");
  const trimmed = fraction.replace(/0+$/, "").slice(0, 6);
  return `${sign}${whole.toString()}${trimmed ? `.${trimmed}` : ""} QBT`;
}

export function renderFaucetPage(options: FaucetPageOptions): string {
  const explorerUrl = options.explorerUrl ?? "";
  const state = JSON.stringify({
    networkName: options.networkName,
    chainId: options.chainId,
    rpcUrl: options.rpcUrl,
    explorerUrl,
    faucetAddress: options.faucetAddress,
    amountWei: options.amountWei.toString(),
    amountLabel: formatQbtAmount(options.amountWei),
    claimWindowSeconds: Math.ceil(options.claimWindowMs / 1000),
  }).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Qubitor Testnet Faucet</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0d1117;
        --panel: #151b23;
        --panel-2: #10161f;
        --border: #2a3340;
        --text: #edf2f7;
        --muted: #9aa8ba;
        --accent: #49d0a8;
        --accent-2: #6ea8fe;
        --error: #ff7b72;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }

      main {
        width: min(960px, calc(100% - 32px));
        margin: 0 auto;
        padding: 48px 0;
      }

      header {
        margin-bottom: 28px;
      }

      .eyebrow {
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h1 {
        margin: 8px 0 10px;
        font-size: clamp(34px, 6vw, 56px);
        line-height: 1;
        letter-spacing: 0;
      }

      p {
        margin: 0;
        color: var(--muted);
        max-width: 700px;
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
        gap: 16px;
        align-items: start;
      }

      section,
      aside {
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--panel);
      }

      section {
        padding: 20px;
      }

      aside {
        overflow: hidden;
      }

      .aside-block {
        padding: 18px;
        border-bottom: 1px solid var(--border);
      }

      .aside-block:last-child {
        border-bottom: 0;
      }

      h2 {
        margin: 0 0 14px;
        font-size: 18px;
        letter-spacing: 0;
      }

      label {
        display: block;
        margin-bottom: 8px;
        color: var(--text);
        font-size: 14px;
        font-weight: 700;
      }

      input {
        width: 100%;
        min-height: 48px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--panel-2);
        color: var(--text);
        padding: 0 14px;
        font: inherit;
        outline: none;
      }

      input:focus {
        border-color: var(--accent);
      }

      button {
        width: 100%;
        min-height: 48px;
        margin-top: 12px;
        border: 0;
        border-radius: 6px;
        background: var(--accent);
        color: #06100d;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      .hint {
        margin-top: 10px;
        font-size: 13px;
      }

      .result {
        margin-top: 16px;
        min-height: 72px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--panel-2);
        padding: 14px;
        color: var(--muted);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .result.success {
        color: var(--text);
        border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
      }

      .result.error {
        color: var(--error);
        border-color: color-mix(in srgb, var(--error) 45%, var(--border));
      }

      dl {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr);
        gap: 8px 12px;
        margin: 0;
      }

      dt {
        color: var(--muted);
      }

      dd {
        margin: 0;
        color: var(--text);
        overflow-wrap: anywhere;
      }

      code,
      pre {
        font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }

      code {
        color: var(--accent-2);
      }

      a {
        color: var(--accent-2);
      }

      .endpoint {
        display: block;
        margin-top: 8px;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--panel-2);
        color: var(--text);
        overflow-wrap: anywhere;
        text-decoration: none;
      }

      @media (max-width: 760px) {
        main {
          padding: 28px 0;
        }

        .layout {
          grid-template-columns: 1fr;
        }

        dl {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="eyebrow">${escapeHtml(options.networkName)}</div>
        <h1>Qubitor Testnet Faucet</h1>
        <p>Request testnet QBT for wallet testing, app development, and testnet transactions. Testnet QBT is not mainnet QBT.</p>
      </header>

      <div class="layout">
        <section>
          <h2>Request QBT</h2>
          <form id="faucet-form">
            <label for="address">Qubitor address</label>
            <input id="address" name="address" placeholder="0x..." autocomplete="off" spellcheck="false" required />
            <button id="submit" type="submit">Request ${escapeHtml(formatQbtAmount(options.amountWei))}</button>
            <p class="hint">One request per address every ${Math.ceil(options.claimWindowMs / 1000)} seconds.</p>
          </form>
          <div id="result" class="result">Paste a Qubitor testnet address to request QBT.</div>
        </section>

        <aside>
          <div class="aside-block">
            <h2>Status</h2>
            <dl>
              <dt>Network</dt>
              <dd id="status-network">${escapeHtml(options.networkName)}</dd>
              <dt>Chain ID</dt>
              <dd id="status-chain">${options.chainId}</dd>
              <dt>Amount</dt>
              <dd id="status-amount">${escapeHtml(formatQbtAmount(options.amountWei))}</dd>
              <dt>Balance</dt>
              <dd id="status-balance">Checking...</dd>
              <dt>Signer</dt>
              <dd id="status-signer">PQ Native</dd>
            </dl>
          </div>

          <div class="aside-block">
            <h2>Links</h2>
            <a class="endpoint" href="/faucet/status">/faucet/status</a>
            <a class="endpoint" href="${escapeHtml(options.rpcUrl)}">${escapeHtml(options.rpcUrl)}</a>
            ${
              explorerUrl
                ? `<a class="endpoint" href="${escapeHtml(explorerUrl)}">${escapeHtml(explorerUrl)}</a>`
                : ""
            }
          </div>
        </aside>
      </div>
    </main>

    <script>
      const faucetPage = ${state};
      const form = document.getElementById("faucet-form");
      const address = document.getElementById("address");
      const submit = document.getElementById("submit");
      const result = document.getElementById("result");

      function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
      }

      function formatWei(value) {
        try {
          const wei = BigInt(value);
          const whole = wei / 1000000000000000000n;
          const fraction = String(wei % 1000000000000000000n).padStart(18, "0").replace(/0+$/, "").slice(0, 6);
          return String(whole) + (fraction ? "." + fraction : "") + " QBT";
        } catch {
          return "unknown";
        }
      }

      function show(message, kind) {
        result.className = "result" + (kind ? " " + kind : "");
        result.textContent = message;
      }

      async function loadStatus() {
        try {
          const response = await fetch("/faucet/status");
          const status = await response.json();
          setText("status-network", status.network || faucetPage.networkName);
          setText("status-chain", String(status.chainId || faucetPage.chainId));
          setText("status-amount", formatWei(status.amountWei || faucetPage.amountWei));
          setText("status-balance", formatWei(status.balanceWei || "0"));
          setText("status-signer", status.signerMode || "PQ Native");
        } catch {
          setText("status-balance", "unavailable");
        }
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const requestedAddress = address.value.trim();
        submit.disabled = true;
        show("Submitting faucet request...", "");

        try {
          const response = await fetch("/faucet/request", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address: requestedAddress }),
          });
          const data = await response.json();

          if (!response.ok || !data.ok) {
            throw new Error(data.error || "faucet request failed");
          }

          const lines = [
            "Faucet request accepted.",
            "Amount: " + formatWei(data.amountWei || faucetPage.amountWei),
            "Transaction: " + data.hash,
          ];
          if (data.explorerUrl) lines.push("Explorer: " + data.explorerUrl);
          show(lines.join("\\n"), "success");
          await loadStatus();
        } catch (error) {
          show(error instanceof Error ? error.message : "faucet request failed", "error");
        } finally {
          submit.disabled = false;
        }
      });

      void loadStatus();
    </script>
  </body>
</html>`;
}
