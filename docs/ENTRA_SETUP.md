# Per-user auth with Microsoft Entra ID

Out of the box the server uses one shared `MCP_AUTH_TOKEN`. This guide adds **per-user sign-in**: anyone connecting the MCP signs in with their Microsoft account in your tenant, Conditional Access/MFA apply, and you can revoke one person without rotating anything. Both auth methods work side by side — enabling Entra does not break existing token-based connections.

**Trust model:** Entra controls *who can use the connector*. ConnectWise access itself still runs as the API member you configured — scope that member's PSA security role accordingly. (Per-request CW member impersonation is possible but rarely worth the complexity.)

## What the server does once configured

- Accepts `Authorization: Bearer <Entra JWT>` — validated for signature (tenant JWKS), issuer, audience, and expiry
- Serves OAuth discovery metadata at `/.well-known/oauth-protected-resource` (RFC 9728) so MCP clients find your tenant automatically
- Returns 401s with a `WWW-Authenticate` challenge pointing at that metadata

## 1. Create the app registration (admin required)

> Requires **Application Administrator** or **Global Administrator** in the tenant. A standard user gets `Insufficient privileges to complete the operation` — if you hit that, switch to your admin account (or PIM-elevate) and re-run.

Sign in as the admin (`az login --tenant <your-tenant>`) and run:

```bash
TENANT=$(az account show --query tenantId -o tsv)

# 1) App registration: single-tenant, public client (PKCE, no secret) with
#    claude.ai's callback and localhost (for Claude Code / Desktop)
APP=$(az ad app create --display-name "ConnectWise MCP" \
  --sign-in-audience AzureADMyOrg \
  --public-client-redirect-uris "https://claude.ai/api/mcp/auth_callback" "http://localhost" \
  -o json)
APP_ID=$(echo "$APP" | jq -r .appId)
OBJ_ID=$(echo "$APP" | jq -r .id)
SCOPE_ID=$(uuidgen | tr 'A-Z' 'a-z')

# 2) Expose an API scope (access_as_user) under api://<appId>
az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$OBJ_ID" --body "{
  \"identifierUris\": [\"api://$APP_ID\"],
  \"api\": {
    \"oauth2PermissionScopes\": [{
      \"id\": \"$SCOPE_ID\",
      \"value\": \"access_as_user\",
      \"type\": \"User\",
      \"isEnabled\": true,
      \"adminConsentDisplayName\": \"Access ConnectWise MCP\",
      \"adminConsentDescription\": \"Allows access to the ConnectWise MCP server as the signed-in user.\",
      \"userConsentDisplayName\": \"Access ConnectWise MCP\",
      \"userConsentDescription\": \"Allows access to the ConnectWise MCP server on your behalf.\"
    }]
  }
}"

# 3) Pre-authorize the app for its own scope so users never see a consent prompt
#    (must be a separate call after the scope exists)
az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$OBJ_ID" --body "{
  \"api\": { \"preAuthorizedApplications\": [{ \"appId\": \"$APP_ID\", \"delegatedPermissionIds\": [\"$SCOPE_ID\"] }] }
}"

# 4) Service principal so the app is usable in the tenant
az ad sp create --id "$APP_ID" -o none

echo "AZURE_TENANT_ID=$TENANT"
echo "AZURE_CLIENT_ID=$APP_ID"
```

### Portal alternative

Entra admin center → **App registrations → New registration**: single tenant, no redirect URI yet → after creating: **Authentication → Add a platform → Mobile and desktop applications** (⚠️ not Web, not SPA — Web demands a client secret and SPA origin-binds tokens; both break MCP clients) → add `https://claude.ai/api/mcp/auth_callback` and `http://localhost` → **Expose an API**: set Application ID URI to `api://<client-id>`, add scope `access_as_user` (admins and users can consent), then under "Authorized client applications" add the app's own client ID for that scope.

## 2. Wire it into the container app

Not secrets — these are public identifiers:

```bash
az containerapp update -n connectwise-mcp -g rg-connectwise-mcp \
  --set-env-vars AZURE_TENANT_ID=<tenant-guid> AZURE_CLIENT_ID=<app-client-guid>
```

Verify: `curl https://<fqdn>/.well-known/oauth-protected-resource` should return JSON listing your tenant's authorization server (404 means the env vars aren't live yet).

## 3. Connect clients with sign-in

- **claude.ai** — Settings → Connectors → Add custom connector → URL `https://<fqdn>/mcp` (no token in the URL). Open **Advanced settings** and set **OAuth Client ID** to your `AZURE_CLIENT_ID`, leave the secret blank (Entra has no Dynamic Client Registration, so the id must be supplied). Connecting pops the Microsoft sign-in.
- **Claude Code** — `claude mcp add --transport http connectwise https://<fqdn>/mcp`, then `/mcp` → Authenticate opens the browser flow (uses the `http://localhost` redirect).

To go Entra-only (kill the shared token): remove the env var —
`az containerapp update -n connectwise-mcp -g rg-connectwise-mcp --remove-env-vars MCP_AUTH_TOKEN`

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Insufficient privileges` creating the app | You need App Administrator / Global Administrator (step 1 note) |
| `AADSTS50011` redirect URI mismatch | Callback not registered, or registered under Web/SPA instead of Mobile & desktop |
| `AADSTS65001` consent error | Pre-authorization (step 1.3) missing and user consent is disabled in the tenant — re-run step 3 of the script or grant admin consent |
| 401 with `WWW-Authenticate: Bearer resource_metadata=...` | Token invalid/expired/wrong audience — confirm the client requested scope `api://<client-id>/access_as_user` |
| `/.well-known/oauth-protected-resource` returns 404 | `AZURE_TENANT_ID`/`AZURE_CLIENT_ID` not set on the app |
| Sign-in works but tools error | That's ConnectWise-side: check `CW_PSA_*` secrets and the API member's security role |
