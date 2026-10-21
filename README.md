# WEBKAS FAM SOS V2

Fondasi website kas baru untuk Fam SOS.

## Hosting Netlify
- Build command: `npm run build`
- Publish directory: `dist`
- Build/SPA settings are defined in `netlify.toml`.
- Connect this GitHub repository to Netlify to enable automatic deploys from `main`.

## Status
Saat ini repository berisi scaffold UI dan konfigurasi hosting. Fitur login, database, pembayaran, dan kalkulasi kas belum siap produksi. Jangan gunakan untuk transaksi nyata.

## Environment
Copy `.env.example` to `.env.local` for local development once Supabase public key is approved for frontend use. Never use a service-role key in the browser.

Blueprint and safety constraints: [MASTER_BLUEPRINT.md](./MASTER_BLUEPRINT.md).
