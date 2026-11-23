try { process.loadEnvFile(); } catch { /* no .env */ }
/* Import a VERIFIED administrative boundary GeoJSON into geographic_boundaries (PostGIS).
   Usage: npm -w apps/api run boundaries:import -- --file lga.geojson --kind LGA --name-property NAME --source "Dataset name, publisher, licence, date" [--placeholder]
   Features are matched to existing LGAs by name; unmatched features are rejected (never silently created). Re-running replaces the previous import for the same --source. */
import { readFileSync } from 'fs'; import { Client } from 'pg';
const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };
(async () => {
  const file = arg('file'), kind = (arg('kind') ?? 'LGA').toUpperCase(), prop = arg('name-property') ?? 'NAME', source = arg('source'); const placeholder = process.argv.includes('--placeholder');
  if (!file || !source) throw new Error('--file and --source (dataset provenance) are required');
  if (!['LGA', 'WARD', 'OVERLAY'].includes(kind)) throw new Error('--kind must be LGA, WARD or OVERLAY');
  const gj = JSON.parse(readFileSync(file, 'utf8')); if (gj.type !== 'FeatureCollection') throw new Error('Expected a GeoJSON FeatureCollection');
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const lgas = (await c.query('SELECT id, name FROM lgas')).rows; let ok = 0; const rejected: string[] = [];
  try {
    await c.query('BEGIN'); await c.query('DELETE FROM geographic_boundaries WHERE source = $1', [source]);
    for (const f of gj.features) {
      const name = String(f.properties?.[prop] ?? ''); const lga = kind === 'LGA' ? lgas.find((l: any) => norm(l.name) === norm(name)) : undefined;
      if (kind === 'LGA' && !lga) { rejected.push(name || '(unnamed)'); continue; }
      const r = await c.query(`INSERT INTO geographic_boundaries(id, kind, "refId", name, source, "isPlaceholder", geom) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))) RETURNING id`, [kind, lga?.id ?? null, name, source, placeholder, JSON.stringify(f.geometry)]);
      if (r.rowCount) ok++;
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { await c.end(); }
  console.log(`imported ${ok} ${kind} feature(s) from "${source}"${rejected.length ? `; REJECTED (no matching LGA): ${rejected.join(', ')}` : ''}`);
})().catch(e => { console.error(e.message); process.exit(1); });
