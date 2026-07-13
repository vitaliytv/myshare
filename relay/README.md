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

Before running the relay, register a public OAuth2 client once, against the target Ory deployment.
This Hydra CLI version has no `--pkce`/`--pkce-enforced` flags — PKCE (S256, confirmed via
`code_challenge_methods_supported` in the discovery doc) is handled per-request by supplying
`code_challenge`/`code_challenge_method` on the authorize call; the client registration itself only
needs `--token-endpoint-auth-method none` (public client, no client_secret) and an explicit
`--audience` so issued access tokens carry a matching `aud` claim for the relay to verify:

```sh
kubectl -n ory-dev exec deploy/hydra -- hydra create oauth2-client \
  --endpoint http://127.0.0.1:4445 \
  --id myshare \
  --name myshare \
  --grant-type authorization_code,refresh_token \
  --response-type code \
  --scope openid,offline,email,profile \
  --redirect-uri "myshare://oauth/callback" \
  --token-endpoint-auth-method none \
  --audience myshare \
  --format json
```

Already done against the nitra dev environment (`https://id.nitra.dev`, GKE context `ai`, namespace
`ory-dev`) — `client_id: myshare`, `audience: ["myshare"]`, `redirect_uris: ["myshare://oauth/callback"]`.
For a self-hosted deployment against a different Ory instance, run the equivalent command against
that instance's Hydra admin API (internal-only — reach it via `kubectl exec`/port-forward into the
Hydra pod, not exposed publicly) and adjust `--id`/`--audience` to match your own `MYSHARE_CLIENT_ID`.

## Running

```sh
HYDRA_ISSUER=https://id.nitra.dev/oauth2 \
MYSHARE_CLIENT_ID=myshare \
RELAY_DB_PATH=/var/lib/myshare/relay.sqlite \
PORT=8787 \
bun run start
```

Verified live against the dev environment: `GET https://id.nitra.dev/oauth2/.well-known/openid-configuration`
resolves `authorization_endpoint`/`token_endpoint` at `https://id.nitra.dev/oauth2/oauth2/{auth,token}`
(the login-ui gateway does double up the `/oauth2` prefix — confirms why the client resolves these via
discovery instead of hardcoding `<issuer>/oauth2/{auth,token}`), and `jwks_uri` at
`https://id.nitra.dev/oauth2/.well-known/jwks.json` (distinct from jwt-bridge's root-level JWKS).

**TLS is required, not optional.** The Android client target (Android 16+) blocks cleartext traffic
by default — `http://`/`ws://` relay endpoints will simply fail to connect from the phone. Put the
relay behind a TLS-terminating reverse proxy (or serve `wss://`/`https://` directly) before pointing
a device at it.

## Endpoints

- `POST /sync/links/push`, `GET /sync/links/pull?since=<seq>`
- `POST /sync/translations/push`, `GET /sync/translations/pull?since=<seq>`
- `GET /sync/ws` (upgrade) — first client frame must be `{type: 'hello', token, deviceId, linksSince, translationsSince}`

All HTTP endpoints require `Authorization: Bearer <hydra access token>`.

## Client (Tauri) login flow

The desktop/Android app doesn't hardcode the `/oauth2/auth` and `/oauth2/token` paths — it resolves
them via OIDC discovery (`GET <issuer>/.well-known/openid-configuration`) before starting a login.
This sidesteps the ambiguity of whether a given Ory deployment's gateway doubles up the `/oauth2`
prefix (e.g. `hydra/README.md`'s dev flow shows `/oauth2/oauth2/auth` through the login-ui nginx
proxy) — discovery always returns the correct absolute endpoint for that deployment.
