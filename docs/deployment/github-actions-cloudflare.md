# GitHub Actions → Cloudflare Workers deployment

Repository: `nzxajax-del/webkas-fam-sos-v2`  
Worker: `webkas-fam-sos-v2`  
Config: `wrangler.jsonc`

The workflow at `.github/workflows/deploy-cloudflare.yml` builds the Vite app and deploys the generated `dist/` static assets to the existing Cloudflare Worker. It runs on pushes to `main` and can also be started manually from GitHub Actions.

## One-time owner setup (required)

GitHub Actions cannot deploy to the Cloudflare account until the repository owner adds two repository Actions secrets:

1. Open https://dash.cloudflare.com/profile/api-tokens and create a **custom API token**. Do not use the Global API Key.
2. Grant the minimum permissions needed for Workers deployment:
   - Account → Workers Scripts → Edit
   - Account → Account Settings → Read (if the token wizard or Wrangler reports this is required)
   Limit the token to the account that owns the Worker. Do not grant unrelated permissions.
3. Copy the Cloudflare Account ID from the account's Workers & Pages overview.
4. In GitHub, open https://github.com/nzxajax-del/webkas-fam-sos-v2/settings/secrets/actions and add:
   - `CLOUDFLARE_API_TOKEN` = the custom API token
   - `CLOUDFLARE_ACCOUNT_ID` = the Cloudflare Account ID
5. Open https://github.com/nzxajax-del/webkas-fam-sos-v2/actions/workflows/deploy-cloudflare.yml and run the workflow, or push a later commit to `main`.

**Never paste either value into ChatGPT, source code, issues, or commits.** Enter them only in GitHub's secret form. If Cloudflare rejects the token, inspect the workflow log for the exact missing permission and add only that permission.

## Safety and verification

- This deploys only the frontend/static assets for the existing Worker named above.
- Supabase URL, database, and credentials are not changed by this workflow.
- Never configure a Supabase service-role key in frontend variables.
- Keep Netlify intact as fallback and stay on free tiers; do not enable paid features.
- A successful workflow means the build and deploy command completed. Afterward, visit https://webkas-fam-sos-v2.nzxajax.workers.dev/ and verify login/register plus Supabase connectivity.
- Keep cash operations disabled until full acceptance tests pass.
