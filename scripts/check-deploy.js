import { readFileSync } from 'node:fs';

// O ID provisório permite validar o build, mas nunca publicar sem banco.
const configuration = readFileSync('wrangler.jsonc', 'utf8');
const id = configuration.match(/"id"\s*:\s*"([a-f0-9]{32})"/i)?.[1];
if (!id || /^0+$/.test(id)) {
  console.error('Configure hyperdrive[0].id em wrangler.jsonc antes do deploy. Consulte README.md: Supabase e deploy na Cloudflare.');
  process.exit(1);
}
