import { runNftOwnershipCheckApi } from "../src/lib/nftOwnershipApi";

type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (value: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const rpcUrls = [
    process.env.NEXT_PUBLIC_SUI_RPC_URL || "",
    process.env.VITE_SUI_FULLNODE_URL || "",
    process.env.VITE_RPC_URL || "",
  ].filter(Boolean);

  if (rpcUrls.length === 0) {
    return res.status(500).json({ ok: false, error: "Server RPC URL is not configured." });
  }

  const payload = await runNftOwnershipCheckApi(req.body ?? {}, rpcUrls);
  return res.status(payload.ok ? 200 : 502).json(payload);
}
