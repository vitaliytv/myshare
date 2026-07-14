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

- `GET /health` — plain `200 ok`, no auth. Used by k8s liveness/readiness probes and the GKE `HealthCheckPolicy`.
- `POST /sync/links/push`, `GET /sync/links/pull?since=<seq>`
- `POST /sync/translations/push`, `GET /sync/translations/pull?since=<seq>`
- `GET /sync/ws` (upgrade) — first client frame must be `{type: 'hello', token, deviceId, linksSince, translationsSince}`

All endpoints except `/health` require `Authorization: Bearer <hydra access token>`.

## Kubernetes deployment (kustomize)

`k8s/base` and `k8s/main` mirror the base/main overlay pattern used across `/Users/vitalii/www/nitra/ory`
(same shared GKE cluster `nitraai`, context `ai`, same shared Gateway `gw` in namespace `default`):

- **`k8s/base`** → namespace `myshare-dev`, image `.../c/dev/relay:latest`, `HYDRA_ISSUER=https://id.nitra.dev/oauth2`,
  `https://nitra.dev/relay-myshare/*`, 1Gi PVC, `nodeSelector.preem: "true"` (preemptible node pool).
- **`k8s/main`** → namespace `myshare`, image `.../c/main/relay:latest`, `HYDRA_ISSUER=https://id.7n.ai/oauth2`,
  `https://7n.ai/relay-myshare/*`, 5Gi PVC, `nodeSelector.preem: "false"`.

Routed as a **path prefix under the existing bare `nitra.dev`/`7n.ai` hostnames** (both already resolve to
the shared Gateway — same address as `id.nitra.dev`), not a dedicated `relay.nitra.dev` subdomain — no new
DNS record needed. `nitra.dev`/`7n.ai` are also claimed by unrelated `gt-dev`/`gt-main` HTTPRoutes
(`gt-site`, `hasura`, …) with a catch-all `/` `PathPrefix` — Gateway API resolves overlapping routes on the
same hostname by longest-path-prefix precedence, so `/relay-myshare` always wins over their `/` for its own
paths, with a `URLRewrite`/`ReplacePrefixMatch` filter stripping the prefix before it reaches the relay
(the relay's own routes are `/health`, `/sync/...`, unprefixed).

Resources per overlay: `Namespace`, `PersistentVolumeClaim` (sqlite db file — single `ReadWriteOnce` volume,
`Deployment.strategy: Recreate` so the old pod releases the volume before the new one binds it; **no sqlite/local-disk
precedent existed elsewhere in `ory`'s manifests**, everything else there is CNPG/Postgres), `Deployment`, `Service` +
headless `Service` (`relay-hl`, used by the `HealthCheckPolicy` and `HTTPRoute` backends), `HealthCheckPolicy`
(`networking.gke.io/v1`), `NetworkPolicy` (same three GCP Gateway ingress CIDRs `35.191.0.0/16`/`130.211.0.0/22`/`10.10.0.0/23`
as `ory`'s services, plus `0.0.0.0/0:443` egress since `HYDRA_ISSUER`'s JWKS is fetched over the public internet, not
in-cluster), `HTTPRoute` (`gateway.networking.k8s.io/v1beta1`, attaches to the same shared `gw` Gateway `ory` uses).

Validate before applying:

```sh
kubectl kustomize relay/k8s/base   # or k8s/main
```

**Before the first `kubectl apply -k relay/k8s/main`** (prod overlay only — dev needs nothing extra since
`nitra.dev` and its Hydra client are already live), one thing needs to exist that this repo can't provision
on its own: **a separate Hydra OAuth2 client registration against the prod Ory instance** (`https://id.7n.ai`)
— the `myshare` client documented above was only registered against the dev instance (`id.nitra.dev`).

There is **no CI/CD pipeline wired up** for this — `kubectl apply -k relay/k8s/<overlay>` and image
rollout (`kubectl set image deployment/relay main=<image>`) are manual steps, deliberately: automating
`kubectl apply` against a shared cluster on every push is a separate decision the deployer should make
explicitly (network policies and routes affect shared infrastructure), not something bundled silently
with these manifests.

### Verified live in `myshare-dev` (2026-07-13)

Built the image (`docker buildx build --platform linux/amd64 -f relay/Dockerfile --push .` — **must**
target `linux/amd64` explicitly; a plain `docker build` on Apple Silicon produces an arm64 image that
fails to pull on the cluster's `n2d` (x86_64) nodes with `no match for platform in manifest`), pushed to
`us-central1-docker.pkg.dev/nitraai/c/dev/relay:latest`, applied `k8s/base`, rolled out. Pod reaches
`Running`/`Ready`. `HTTPRoute` shows `Accepted`+`Reconciled` against the shared Gateway, and — since
`nitra.dev` already has a public DNS record — the live path route works end-to-end with **no DNS step at
all**: `curl https://nitra.dev/relay-myshare/health` → `200`, unauthenticated
`POST https://nitra.dev/relay-myshare/sync/links/push` → `401`.

Fixed three bugs found only by actually deploying (not visible from `kubectl kustomize` alone):

- **`Dockerfile`**: `bun install --filter relay` matched *zero* workspace members (bun's `--filter`
  matches by `package.json` `name`, and this package is named `myshare-relay`, not `relay`) — install
  silently no-op'd, shipping an image with an empty `node_modules`. Fixed to `--filter ./relay`
  (path-based filter, always correct regardless of package name).
- **`deployment.yaml`**: first rollout crash-looped with `SQLiteError: unable to open database file` —
  the GCE-PD-backed PVC mounts `root:root 0755` by default, and the non-root container (`runAsUser:
  1000`) couldn't create the sqlite file under `/data`. Fixed by adding `securityContext.fsGroup: 1000`
  at the pod level, which makes kubelet `chown` the mounted volume to that group on attach.
- **`hr.yaml`**: originally used a dedicated `relay.nitra.dev` subdomain, which needed a new DNS record
  this repo can't provision. Switched to a `/relay-myshare` path prefix under the already-resolving bare
  `nitra.dev`/`7n.ai` hostnames (with a `URLRewrite` filter to strip the prefix) — zero new DNS.

## Client (Tauri) login flow

The desktop/Android app doesn't hardcode the `/oauth2/auth` and `/oauth2/token` paths — it resolves
them via OIDC discovery (`GET <issuer>/.well-known/openid-configuration`) before starting a login.
This sidesteps the ambiguity of whether a given Ory deployment's gateway doubles up the `/oauth2`
prefix (e.g. `hydra/README.md`'s dev flow shows `/oauth2/oauth2/auth` through the login-ui nginx
proxy) — discovery always returns the correct absolute endpoint for that deployment.
