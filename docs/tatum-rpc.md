# Tatum RPC For DeepSignal

DeepSignal can use Tatum as its Sui RPC infrastructure layer while keeping the existing Walrus storage and Seal encryption flow unchanged.

## What This Changes

- Walrus remains the storage layer.
- Seal remains the encryption layer.
- Sui remains the chain.
- Tatum becomes the configurable RPC provider for wallet, transaction, and chain reads.

DeepSignal now exposes this in the UI through:

- a global `Network Infrastructure` panel;
- lightweight RPC diagnostics;
- switchable Tatum/default Sui RPC fallback controls;
- submission proof metadata that includes the RPC provider.

## Required Environment Variables

For the client-facing RPC selection:

```bash
NEXT_PUBLIC_SUI_RPC_URL=https://sui-testnet.gateway.tatum.io
NEXT_PUBLIC_TATUM_ENABLED=true
```

Optional legacy/default fallback values:

```bash
VITE_SUI_NETWORK=testnet
VITE_SUI_FULLNODE_URL=https://fullnode.testnet.sui.io:443
VITE_RPC_URL=https://fullnode.testnet.sui.io:443
```

Optional secret for local proxy mode:

```bash
TATUM_API_KEY=your_tatum_key_here
```

## Example Tatum Endpoints

- Testnet: `https://sui-testnet.gateway.tatum.io`
- Mainnet: `https://sui-mainnet.gateway.tatum.io`

## Setup

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUI_NETWORK` to `testnet` or `mainnet`.
3. Set `NEXT_PUBLIC_SUI_RPC_URL` to the matching Tatum endpoint.
4. Set `NEXT_PUBLIC_TATUM_ENABLED=true`.
5. Keep `VITE_SUI_FULLNODE_URL` or `VITE_RPC_URL` configured for the default Sui fallback.
6. If you want to avoid exposing an API key during local development, set `TATUM_API_KEY` before running `vite dev` or `vite preview`.

## API Key Behavior

DeepSignal does not inject `TATUM_API_KEY` into the browser bundle.

When `TATUM_API_KEY` is present during local dev or preview:

- Vite proxies requests through `/api/tatum/sui-rpc`;
- the proxy adds the `x-api-key` header server-side;
- the UI still labels the provider as `Tatum RPC`.

For static production hosting, use one of these approaches:

- expose a public or unrestricted Tatum gateway URL directly in `NEXT_PUBLIC_SUI_RPC_URL`; or
- provide your own server-side reverse proxy route and point `NEXT_PUBLIC_SUI_RPC_URL` at that route.

## Fallback Behavior

If the active Tatum RPC endpoint becomes unavailable:

- DeepSignal shows a friendly diagnostics error;
- operators can switch back to the default Sui RPC from the `Network Infrastructure` panel;
- Walrus and Seal behavior remain unchanged.

## Troubleshooting

### Tatum toggle is on, but the app still shows `Sui Fullnode`

Check:

- `NEXT_PUBLIC_TATUM_ENABLED=true`
- `NEXT_PUBLIC_SUI_RPC_URL` points to a `gateway.tatum.io` endpoint

### RPC diagnostics fail immediately

Check:

- the Tatum endpoint matches the configured network;
- `VITE_SUI_NETWORK` is aligned with the endpoint;
- your network allows outbound HTTPS to the configured gateway;
- if your Tatum gateway requires authentication, make sure your local proxy or server proxy is attaching `x-api-key`.

### Walrus works but submission proof does not show a transaction digest

That digest is recorded when a submission receipt is registered on Sui. Wallet-optional response storage still works without that on-chain receipt step.

### Public routes must remain wallet-optional

This integration does not change that. `/f/:formId`, roadmap pages, and recovery flows still remain accessible without a wallet.

## References

- [Tatum Sui RPC reference](https://docs.tatum.io/reference/rpc-sui)
- [Tatum Sui gateway overview](https://tatum.io/chain/sui)
