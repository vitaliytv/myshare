# myshare-relay

Self-hosted sync coordinator for `myshare`'s shared links and translation cache. Run it on a machine
you control (home server, VPS) — it is a single-owner relay, not multi-tenant SaaS: one deployment
serves the deployer's own devices, authenticated through their own Ory (Kratos/Hydra) identity.

## Auth

The relay does **not** implement its own registration/login — accounts and sessions live entirely in
Ory. The relay only verifies Hydra-issued OAuth2 access-token JWTs (`strategies.access_token: jwt` in
`hydra.yaml`) against Hydra's own JWKS (`<issuer>/.well-known/jwks.json`). This is a different JWKS
from the ory stack's `jwt-bridge` (`/.well-known/jwks.json` at the root, Hasura-shaped, cookie-only) —
do not point `HYDRA_ISSUER` at that one.

Before running the relay, register a public (PKCE) Hydra OAuth2 client once, against the target Ory
deployment:

```sh
docker compose exec hydra hydra create client \
  --endpoint http://127.0.0.1:4445 \
  --name "myshare" \
  --grant-type authorization_code,refresh_token \
  --response-type code \
  --scope openid,offline,email,profile \
  --redirect-uri "myshare://oauth/callback" \
  --token-endpoint-auth-method none \
  --pkce --pkce-enforced
```

(Production: the same command via `kubectl -n ory exec deploy/hydra -- hydra create client --endpoint http://127.0.0.1:4445 …`,
against the internal-only Hydra admin API.) Verify the exact flag names against the installed `oryd/hydra`
CLI version — PKCE flags may differ between releases.

## Running

```sh
HYDRA_ISSUER=https://id.nitra.dev/oauth2 \
MYSHARE_CLIENT_ID=myshare \
RELAY_DB_PATH=/var/lib/myshare/relay.sqlite \
PORT=8787 \
bun run start
```

**TLS is required, not optional.** The Android client target (Android 16+) blocks cleartext traffic
by default — `http://`/`ws://` relay endpoints will simply fail to connect from the phone. Put the
relay behind a TLS-terminating reverse proxy (or serve `wss://`/`https://` directly) before pointing
a device at it.

## Endpoints

- `POST /sync/links/push`, `GET /sync/links/pull?since=<seq>`
- `POST /sync/translations/push`, `GET /sync/translations/pull?since=<seq>`
- `GET /sync/ws` (upgrade) — first client frame must be `{type: 'hello', token, deviceId, linksSince, translationsSince}`

All HTTP endpoints require `Authorization: Bearer <hydra access token>`.
