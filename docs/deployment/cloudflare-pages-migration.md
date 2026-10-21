# Cloudflare Pages migration — WEBKAS FAM SOS V2

Status: prepared; Cloudflare account authorization and first deployment must be completed by the repository owner.

## Scope and safety

- Repository: `nzxajax-del/webkas-fam-sos-v2`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Framework preset: `React (Vite)`
- Node.js version: `22` (the project requires Node >=22.12)
- Existing Supabase project and database remain unchanged.
- Keep Netlify configuration and project in place as a fallback. Do not delete or disconnect it.
- Never add Supabase service-role keys or bootstrap tokens to Cloudflare environment variables for this frontend.

## Create the Pages project

1. Sign in to Cloudflare at https://dash.cloudflare.com/ using the account owner.
2. Open **Workers & Pages** and choose **Create application** → **Pages** → **Connect to Git** (wording may vary).
3. Authorize Cloudflare's GitHub app for only the repository `nzxajax-del/webkas-fam-sos-v2`, if the UI allows repository-level access.
4. Select repository `nzxajax-del/webkas-fam-sos-v2` and production branch `main`.
5. Set framework preset to **React (Vite)**, build command `npm run build`, and output directory `dist`.
6. Ensure Node.js is at least 22.12. If the build environment lets you set environment variables, set `NODE_VERSION=22` only if Cloudflare's default Node version is incompatible; verify the actual build log.
7. Add frontend environment variables only if required by the current app:
   - `VITE_SUPABASE_URL=https://lzciyzibqbujshoizlbu.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the existing Supabase publishable/anon key from the Supabase project's API settings.
   
   The app currently has public fallback configuration in `src/lib/supabase.js`; never use a service-role key in the browser.
8. Start the first deployment and wait for the build to complete. Do not enable cash operations in Supabase.

## After the first deployment

- Open the generated `*.pages.dev` URL and verify it loads the application, not a preparation/placeholder page.
- Verify login/register screens render and browser console/network has no missing assets or Supabase configuration errors.
- Verify the app is connected to the existing Supabase project; do not create a new database.
- Full end-to-end acceptance tests and admin bootstrap remain release gates. Cash operations must stay disabled until they pass.
- Only after the Pages deployment is verified should the Pages URL be treated as the new candidate production URL. Keep Netlify intact.
- If using Supabase Auth redirect allowlists or email redirect URLs, add the exact Pages URL in Supabase Auth URL configuration only after the URL is known; do not remove existing URLs.

## Official references

- Cloudflare Pages Git integration: https://developers.cloudflare.com/pages/configuration/git-integration/
- Cloudflare Pages build configuration: https://developers.cloudflare.com/pages/configuration/build-configuration/
