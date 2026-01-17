import { ethers } from "ethers";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    // read body (robust)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8") || "{}";

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return res.status(400).json({ ok: false, error: "Bad JSON body" });
    }

    const txHash = String(body?.txHash || "").trim();
    const payer = String(body?.payer || "").trim();

    if (!/^0x([A-Fa-f0-9]{64})$/.test(txHash)) {
      return res.status(400).json({ ok: false, error: "Bad txHash" });
    }
    if (!ethers.isAddress(payer)) {
      return res.status(400).json({ ok: false, error: "Bad payer address" });
    }

    // constants
    const RECEIVER = "0x3B5Ca729ae7D427616873f5CD0B9418243090c4c";
    const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base :contentReference[oaicite:0]{index=0}
    const AMOUNT = ethers.parseUnits("9", 6); // 9 USDC (6 decimals)

    // Base public RPC :contentReference[oaicite:1]{index=1}
    const rpcUrl = process.env.BASE_RPC_URL || "https://mainnet.base.org";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return res.status(200).json({ ok: false, error: "Tx not found yet (try again)" });
    if (receipt.status !== 1) return res.status(200).json({ ok: false, error: "Tx failed" });

    // must be USDC contract call
    if (!receipt.to || receipt.to.toLowerCase() !== USDC_BASE.toLowerCase()) {
      return res.status(200).json({ ok: false, error: "Not a USDC transfer tx" });
    }

    // parse ERC20 Transfer logs
    const iface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ]);

    const payerLc = payer.toLowerCase();
    const receiverLc = RECEIVER.toLowerCase();

    let matched = false;

    for (const log of receipt.logs) {
      if (!log.address || log.address.toLowerCase() !== USDC_BASE.toLowerCase()) continue;
      try {
        const pl = iface.parseLog(log);
        if (pl?.name !== "Transfer") continue;

        const from = String(pl.args.from).toLowerCase();
        const to = String(pl.args.to).toLowerCase();
        const value = pl.args.value;

        if (from === payerLc && to === receiverLc && value === AMOUNT) {
          matched = true;
          break;
        }
      } catch {}
    }

    if (!matched) {
      return res.status(200).json({ ok: false, error: "Transfer not matching (from/to/amount)" });
    }

    const latest = await provider.getBlockNumber();
    const confirmations = latest - receipt.blockNumber;

    return res.status(200).json({ ok: true, txHash, confirmations });
  } catch (e) {
    console.log("verify error:", e);
    return res.status(500).json({ ok: false, error: "Server error", details: String(e?.message || e) });
  }
}
