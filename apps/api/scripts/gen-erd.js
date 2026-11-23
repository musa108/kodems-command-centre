/* Generates docs/ERD.md (Mermaid) from schema.prisma so the diagram cannot drift from the data model. */
const { getDMMF } = require('@prisma/internals'); const fs = require('fs'); const path = require('path');
(async () => {
  const d = (await getDMMF({ datamodel: fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8') })).datamodel; const t = m => m.dbName || m.name; const byName = Object.fromEntries(d.models.map(m => [m.name, m]));
  const groups = { 'Identity & access': ['User', 'Role', 'Permission', 'UserRole', 'RolePermission', 'UserScope', 'Session', 'PasswordResetToken'], 'Geography': ['Lga', 'Ward', 'Community', 'GeographicBoundary', 'RefCategory'], 'Reports & incidents': ['IncidentReport', 'ReportMedia', 'ReportNote', 'ReportStatusHistory', 'Incident', 'IncidentReportLink', 'IncidentUpdate', 'IncidentMedia', 'IncidentStatusHistory', 'IncidentAssignment'], 'Response operations': ['ResponseTeam', 'TeamMember', 'TeamCapability', 'TeamEquipment', 'Vehicle', 'Deployment', 'DeploymentUpdate', 'DeploymentStatusHistory'], 'Affected population': ['AffectedHousehold', 'AffectedPerson', 'HouseholdNeed', 'DamageAssessment', 'Beneficiary'], 'Relief & shelters': ['ReliefItem', 'Warehouse', 'InventoryTransaction', 'ReliefAllocation', 'AllocationItem', 'ReliefDistribution', 'DistributionItem', 'Shelter', 'ShelterRegistration', 'ShelterOccupancyHistory'], 'Notifications, alerts & governance': ['Notification', 'NotificationPreference', 'PublicAlert', 'AlertApproval', 'NotificationDeliveryLog', 'AuditLog', 'SystemSetting', 'IntegrationConfig', 'OutboxEvent', 'IdempotencyRecord'] };
  let out = '# Entity relationship diagrams\n\n> Generated from `apps/api/prisma/schema.prisma` by `npm -w apps/api run db:erd`. Do not edit by hand.\n> PostGIS `geom` columns (incidents, incident_reports, shelters, warehouses, response_teams, geographic_boundaries) are added by migration `0002` and are not modelled in Prisma.\n\n';
  for (const [g, names] of Object.entries(groups)) {
    out += `## ${g}\n\n\`\`\`mermaid\nerDiagram\n`; const set = new Set(names);
    for (const n of names) { const m = byName[n]; out += `  ${t(m)} {\n`; m.fields.filter(f => f.kind !== 'object').slice(0, 12).forEach(f => { out += `    ${f.type.replace(/\W/g, '')} ${f.name}${f.isId ? ' PK' : ''}${f.relationName ? ' FK' : ''}\n`; }); out += '  }\n'; }
    for (const n of names) for (const f of byName[n].fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) { const target = byName[f.type]; if (set.has(f.type)) out += `  ${t(target)} ${f.isRequired ? '||' : '|o'}--o{ ${t(byName[n])} : "${f.name}"\n`; }
    out += '```\n\n';
  }
  const cross = []; for (const m of d.models) for (const f of m.fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) cross.push(`${t(m)} → ${t(byName[f.type])}`);
  out += `## Foreign-key inventory (${cross.length})\n\n${cross.map(c => `- ${c}`).join('\n')}\n`;
  fs.mkdirSync(path.join(__dirname, '../../../docs'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '../../../docs/ERD.md'), out); console.log('ERD written;', d.models.length, 'models');
})();
