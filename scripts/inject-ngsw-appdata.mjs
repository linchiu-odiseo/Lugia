// Post-build hook: inyecta `appData.version` en cada `ngsw.json` generado por
// `ng build`. La versión SemVer se lee de `.env` (APP_VERSION).
//
// ¿Por qué postbuild y no parte de scripts/build-env.mjs?
// `ng build` regenera `ngsw.json` desde cero y descarta cualquier mutación
// previa. Tenemos que correr después del build. El hook `postbuild` en
// package.json se ejecuta automáticamente tras `npm run build`.
//
// `appData` es un campo arbitrario que Angular expone en `VersionEvent.appData`
// vía `SwUpdate.versionUpdates`. El cliente lo lee para mostrar SemVer humano
// (1.0.0) en el modal de actualización, en lugar del hash del SW (a3f2b9c...).
//
// Silencioso si no encuentra `ngsw.json` (caso development/test). Falla con
// exit 1 si `APP_VERSION` está ausente en `.env` o si la mutación rompe.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const envPath = resolve(repoRoot, '.env');

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

let env;
try {
  env = parseEnv(readFileSync(envPath, 'utf8'));
} catch (err) {
  if (err.code === 'ENOENT') {
    // Sin .env no hay build; algún hook upstream ya falló.
    console.warn('postbuild: no .env found, skipping ngsw appData injection');
    process.exit(0);
  }
  throw err;
}

if (!env.APP_VERSION || env.APP_VERSION.startsWith('<')) {
  console.error('✘ postbuild: APP_VERSION ausente o con placeholder en .env');
  process.exit(1);
}

const distRoot = resolve(repoRoot, 'dist');
if (!existsSync(distRoot)) {
  // Caso normal en development/test — no se generó dist/.
  process.exit(0);
}

let mutated = 0;
for (const projectDir of readdirSync(distRoot)) {
  const ngswCandidate = join(distRoot, projectDir, 'browser', 'ngsw.json');
  if (!existsSync(ngswCandidate) || !statSync(ngswCandidate).isFile()) continue;
  try {
    const ngsw = JSON.parse(readFileSync(ngswCandidate, 'utf8'));
    ngsw.appData = { ...(ngsw.appData ?? {}), version: env.APP_VERSION };
    writeFileSync(ngswCandidate, `${JSON.stringify(ngsw, null, 2)}\n`);
    console.log(`✓ ngsw.json appData.version = ${env.APP_VERSION} (${ngswCandidate})`);
    mutated += 1;
  } catch (err) {
    console.error(`✘ Error inyectando appData en ${ngswCandidate}: ${err.message}`);
    process.exit(1);
  }
}

if (mutated === 0) {
  console.log('postbuild: no ngsw.json found in dist/, skipping');
}
