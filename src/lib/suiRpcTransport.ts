import {
  JsonRpcError,
  SuiHTTPStatusError,
  type JsonRpcTransport,
  type JsonRpcTransportRequestOptions,
} from "@mysten/sui/jsonRpc";

class BrowserSafeSuiJsonRpcTransport implements JsonRpcTransport {
  #requestId = 0;
  #url: string;

  constructor(url: string) {
    this.#url = url;
  }

  async request<T = unknown>(input: JsonRpcTransportRequestOptions): Promise<T> {
    this.#requestId += 1;

    const response = await fetch(this.#url, {
      method: "POST",
      signal: input.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.#requestId,
        method: input.method,
        params: input.params,
      }),
    });

    if (!response.ok) {
      throw new SuiHTTPStatusError(
        `Unexpected status code: ${response.status}`,
        response.status,
        response.statusText,
      );
    }

    const data = await response.json();

    if ("error" in data && data.error != null) {
      throw new JsonRpcError(data.error.message, data.error.code);
    }

    return data.result as T;
  }
}

export function createBrowserSafeSuiTransport(url: string): JsonRpcTransport {
  return new BrowserSafeSuiJsonRpcTransport(url);
}
