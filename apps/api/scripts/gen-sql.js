/* Generates prisma/migrations/0001_init/migration.sql from schema.prisma (DMMF). Re-run when the schema changes, then add a NEW numbered folder for the diff — never edit an applied migration. */
const { getDMMF } = require('@prisma/internals'); const fs = require('fs'); const path = require('path');
const schemaPath = path.join(__dirname, '../prisma/schema.prisma'); const src = fs.readFileSync(schemaPath, 'utf8');
const q = s => `"${s}"`;
const PRIM = { String: 'TEXT', Int: 'INTEGER', BigInt: 'BIGINT', Float: 'DOUBLE PRECISION', Boolean: 'BOOLEAN', DateTime: 'TIMESTAMP(3)', Json: 'JSONB', Decimal: 'DECIMAL(65,30)' };
const NATIVE = { Uuid: 'UUID' };
(async () => {
  const d = (await getDMMF({ datamodel: src })).datamodel; const out = [];
  d.enums.forEach(e => out.push(`CREATE TYPE ${q(e.name)} AS ENUM (${e.values.map(v => `'${v.name}'`).join(', ')});`));
  const tname = m => q(m.dbName || m.name);
  const idxs = {}; let cur = null;
  src.split('\n').forEach(l => { const m = l.match(/^model (\w+)/); if (m) cur = m[1]; const i = l.match(/@@index\(\[([^\]]+)\]\)/); if (i && cur) (idxs[cur] ??= []).push(i[1].split(',').map(x => x.trim())); });
  const fks = [];
  for (const m of d.models) {
    const cols = [];
    for (const f of m.fields) {
      if (f.kind === 'object') { if (f.relationFromFields?.length) fks.push({ m, f }); continue; }
      let t = f.kind === 'enum' ? q(f.type) : f.nativeType ? NATIVE[f.nativeType[0]] : PRIM[f.type];
      if (!t) throw new Error(`no type for ${m.name}.${f.name}`);
      const auto = f.default && f.default.name === 'autoincrement';
      if (auto) t = f.type === 'BigInt' ? 'BIGSERIAL' : 'SERIAL';
      if (f.isList) t += '[]';
      let c = `  ${q(f.name)} ${t}`;
      if (!f.isRequired && !f.isList) c += ''; else c += ' NOT NULL';
      if (f.hasDefaultValue && !auto) {
        const df = f.default;
        if (df.name === 'uuid') c += ' DEFAULT gen_random_uuid()'; else if (df.name === 'now') c += ' DEFAULT CURRENT_TIMESTAMP';
        else if (typeof df !== 'object' || df.name === undefined) c += ` DEFAULT ${f.kind === 'enum' || f.type === 'String' ? `'${df}'` : df}`;
        else throw new Error('unsupported default ' + JSON.stringify(df));
      }
      cols.push(c);
    }
    const pk = m.primaryKey ? m.primaryKey.fields : m.fields.filter(f => f.isId).map(f => f.name);
    cols.push(`  PRIMARY KEY (${pk.map(q).join(', ')})`);
    m.fields.filter(f => f.isUnique && f.kind !== 'object').forEach(f => cols.push(`  CONSTRAINT ${q(`${m.dbName || m.name}_${f.name}_key`)} UNIQUE (${q(f.name)})`));
    (m.uniqueFields || []).forEach(u => cols.push(`  CONSTRAINT ${q(`${m.dbName || m.name}_${u.join('_')}_key`)} UNIQUE (${u.map(q).join(', ')})`));
    out.push(`CREATE TABLE ${tname(m)} (\n${cols.join(',\n')}\n);`);
    (idxs[m.name] || []).forEach(ix => out.push(`CREATE INDEX ${q(`${m.dbName || m.name}_${ix.join('_')}_idx`)} ON ${tname(m)} (${ix.map(q).join(', ')});`));
  }
  const byName = Object.fromEntries(d.models.map(m => [m.name, m]));
  fks.forEach(({ m, f }) => { const t = byName[f.type]; out.push(`ALTER TABLE ${tname(m)} ADD CONSTRAINT ${q(`${m.dbName || m.name}_${f.relationFromFields.join('_')}_fkey`)} FOREIGN KEY (${f.relationFromFields.map(q).join(', ')}) REFERENCES ${tname(t)} (${f.relationToFields.map(q).join(', ')}) ON DELETE RESTRICT ON UPDATE CASCADE;`); });
  const dir = path.join(__dirname, '../prisma/migrations/0001_init'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'migration.sql'), `-- Generated from schema.prisma by scripts/gen-sql.js\n${out.join('\n\n')}\n`);
  console.log('wrote', out.length, 'statements');
})();
