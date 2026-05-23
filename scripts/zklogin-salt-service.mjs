import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number.parseInt(process.env.ZKLOGIN_SALT_PORT || "8787", 10);
const HOST = process.env.ZKLOGIN_SALT_HOST || "127.0.0.1";
const SECRET = process.env.ZKLOGIN_SALT_SECRET || "deepsignal-local-zklogin-salt";
const NAMESPACE = process.env.ZKLOGIN_SALT_NAMESPACE || "deepsignal.zklogin.local.v1";

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function deriveUserSalt({ provider, iss, aud, sub }) {
  const digestHex = createHmac("sha256", SECRET)
    .update(`${NAMESPACE}:${provider}:${iss}:${aud}:${sub}`)
    .digest("hex");
  return BigInt(`0x${digestHex}`).toString(10);
}

const server = createServer((request, response) => {
  const requestId = randomUUID();

  if (request.method === "OPTIONS") {
    writeJson(response, 204, {});
    return;
  }

  if (request.method !== "POST" || request.url !== "/zklogin") {
    writeJson(response, 404, {
      error: "Not found.",
      requestId,
    });
    return;
  }

  const chunks = [];

  request.on("data", (chunk) => {
    chunks.push(chunk);
  });

  request.on("end", () => {
    try {
      const raw = Buffer.concat(chunks).toString("utf8");
      const payload = raw ? JSON.parse(raw) : {};
      const provider = typeof payload.provider === "string" ? payload.provider.trim() : "";
      const iss = typeof payload.iss === "string" ? payload.iss.trim() : "";
      const aud = typeof payload.aud === "string" ? payload.aud.trim() : "";
      const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";

      if (!provider || !iss || !aud || !sub) {
        writeJson(response, 400, {
          error: "provider, iss, aud, and sub are required.",
          requestId,
        });
        return;
      }

      writeJson(response, 200, {
        userSalt: deriveUserSalt({ provider, iss, aud, sub }),
        requestId,
      });
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid request body.",
        requestId,
      });
    }
  });

  request.on("error", (error) => {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected request failure.",
      requestId,
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`zkLogin salt service listening on http://${HOST}:${PORT}/zklogin`);
});
