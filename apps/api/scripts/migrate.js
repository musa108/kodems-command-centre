try { process.loadEnvFile(); } catch { /* no .env: rely on real environment */ }
/* Versioned SQL migration runner: applies prisma/migrations/NNNN_name/migration.sql in order, once, in a transaction each, recorded with checksums
   in _kodems_migrations. Never drops or resets data. Plain JS so the production image can run it: `node scripts/migrate.js`. */
const { Client } = require('pg'); const { readdirSync, readFileSync } = require('fs'); const { createHash } = require('crypto'); const { join } = require('path');
async function migrate(url = process.env.DATABASE_URL) {
  const c = new Client({ connectionString: url }); await c.connect();
  try {
    await c.query('CREATE TABLE IF NOT EXISTS _kodems_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const dir = join(__dirname, '../prisma/migrations'); const applied = new Map((await c.query('SELECT name, checksum FROM _kodems_migrations')).rows.map(r => [r.name, r.checksum]));
    for (const name of readdirSync(dir).filter(n => /^\d{4}_/.test(n)).sort()) {
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8'); const sum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(name)) { if (applied.get(name) !== sum) throw new Error(`Migration ${name} was modified after being applied`); continue; }
      await c.query('BEGIN'); try { await c.query(sql); await c.query('INSERT INTO _kodems_migrations(name, checksum) VALUES ($1,$2)', [name, sum]); await c.query('COMMIT'); console.log('applied', name); } catch (e) { await c.query('ROLLBACK'); throw e; }
    }
  } finally { await c.end(); }
}
module.exports = { migrate };
if (require.main === module) migrate().then(() => console.log('migrations up to date')).catch(e => { console.error(e); process.exit(1); });
