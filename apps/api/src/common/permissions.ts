/** Single source of truth for permissions and default role bundles. The web client mirrors this list via GET /auth/me. */
export const PERMISSIONS: Record<string, string> = {
  'dashboard.read': 'View command centre dashboard',
  'incidents.read': 'View incidents', 'incidents.create': 'Create incidents', 'incidents.update': 'Update incident details/updates',
  'incidents.assign': 'Assign incident owner/coordinator', 'incidents.severity': 'Change incident severity',
  'incidents.resolve': 'Resolve incidents', 'incidents.close': 'Close incidents', 'incidents.reopen': 'Reopen incidents',
  'reports.read': 'View emergency reports', 'reports.create': 'Submit reports via web channel', 'reports.assign': 'Assign verification officer',
  'incidents.verify': 'Verify reports', 'incidents.reject': 'Reject reports', 'reports.duplicate': 'Mark reports duplicate', 'reports.note': 'Add report notes',
  'teams.read': 'View response teams', 'teams.manage': 'Create/edit teams and members',
  'deployments.read': 'View deployments', 'deployments.assign': 'Assign teams', 'deployments.update': 'Update/complete/reassign deployments',
  'population.read': 'View affected households/persons', 'population.manage': 'Register/edit affected households and persons', 'population.pii': 'View personal names in affected-person records',
  'relief.inventory.read': 'View relief inventory', 'relief.inventory.manage': 'Record stock movements, items, warehouses',
  'relief.allocations.read': 'View allocations', 'relief.allocations.create': 'Create allocations', 'relief.allocations.approve': 'Approve allocations',
  'relief.distributions.record': 'Record distributions', 'relief.distributions.read': 'View distributions',
  'shelters.read': 'View shelters', 'shelters.manage': 'Manage shelters and registrations',
  'notifications.read': 'View own notifications',
  'alerts.read': 'View public alerts', 'alerts.draft': 'Draft public alerts', 'alerts.approve': 'Approve public alerts', 'alerts.publish': 'Publish public alerts',
  'analytics.read': 'View analytics', 'analytics.export': 'Export datasets',
  'users.manage': 'Manage users, roles and scopes', 'config.manage': 'Manage reference data and settings',
  'audit.read': 'View audit logs', 'system.health': 'View system health', 'search.global': 'Use global search',
  'map.read': 'View map layers', 'map.teams': 'See response-team positions',
};

const ALL = Object.keys(PERMISSIONS);
const read = ['dashboard.read','incidents.read','reports.read','teams.read','deployments.read','map.read','notifications.read','search.global','alerts.read','shelters.read','relief.inventory.read','relief.allocations.read','relief.distributions.read','population.read','analytics.read'];

export interface RoleDef { key: string; name: string; description: string; permissions: string[]; scopeRequired?: boolean; mfaRequired?: boolean }

export const ROLES: RoleDef[] = [
  { key: 'SUPER_ADMIN', name: 'System Super Administrator', description: 'Full system configuration, users, audit, integrations, health', permissions: ALL, mfaRequired: true },
  { key: 'AGENCY_ADMIN', name: 'Agency Administrator', description: 'Statewide agency operations, teams, relief, shelters, analytics', mfaRequired: true,
    permissions: ALL.filter(p => !['config.manage'].includes(p)) },
  { key: 'OPS_OFFICER', name: 'Emergency Operations Officer', description: 'Monitor reports, verify, assign, coordinate and escalate',
    permissions: [...read, 'reports.create','reports.assign','incidents.verify','incidents.reject','reports.duplicate','reports.note','incidents.create','incidents.update','incidents.assign','incidents.severity','incidents.resolve','deployments.assign','deployments.update','map.teams','population.manage','alerts.draft'] },
  { key: 'VERIFICATION_OFFICER', name: 'Incident Verification Officer', description: 'Verify, reject or flag duplicate reports',
    permissions: ['dashboard.read','reports.read','incidents.read','incidents.verify','incidents.reject','reports.duplicate','reports.note','notifications.read','search.global','map.read'] },
  { key: 'RESPONSE_COORDINATOR', name: 'Response Coordinator', description: 'Teams, deployments and field progress',
    permissions: [...read, 'teams.manage','deployments.assign','deployments.update','map.teams','incidents.update'] },
  { key: 'RELIEF_OFFICER', name: 'Relief and Logistics Officer', description: 'Inventory, warehouses, allocations, distributions',
    permissions: [...read, 'relief.inventory.manage','relief.allocations.create','relief.allocations.approve','relief.distributions.record','population.pii'] },
  { key: 'SHELTER_COORDINATOR', name: 'Shelter Coordinator', description: 'Evacuation centres, occupancy, registrations',
    permissions: [...read, 'shelters.manage','population.manage','population.pii'] },
  { key: 'ME_OFFICER', name: 'Monitoring and Evaluation Officer', description: 'Analytics, reports, approved exports',
    permissions: [...read, 'analytics.export'] },
  { key: 'LGA_OFFICER', name: 'LGA Emergency Officer', description: 'Local scope only', scopeRequired: true,
    permissions: [...read, 'reports.create','incidents.update','population.manage','deployments.update','map.teams'] },
  { key: 'EXEC_VIEWER', name: 'Read-only Executive Viewer', description: 'Dashboards and summaries, no modifications',
    permissions: ['dashboard.read','incidents.read','reports.read','deployments.read','map.read','analytics.read','notifications.read','shelters.read','alerts.read','relief.inventory.read','search.global'] },
];

export const INCIDENT_CATEGORIES = [
  ['flood','Flood'],['fire','Fire'],['road_accident','Road accident'],['building_collapse','Building collapse'],['security','Security-related emergency'],
  ['medical','Medical emergency'],['disease_outbreak','Disease outbreak'],['displacement','Displacement'],['environmental','Environmental disaster'],['other','Other'],
];
export const TEAM_CATEGORIES = [
  ['search_rescue','Search and rescue'],['medical_response','Medical response'],['fire_response','Fire response'],['flood_response','Flood response'],
  ['security_evacuation','Security and evacuation'],['logistics','Logistics'],['relief_distribution','Relief distribution'],['assessment','Assessment and damage evaluation'],
];
export const RELIEF_CATEGORIES = [
  ['food','Food'],['water','Drinking water'],['medical','Medical supplies'],['clothing','Clothing'],['bedding','Bedding'],['shelter_materials','Shelter materials'],
  ['hygiene','Hygiene supplies'],['equipment','Emergency equipment'],['other','Other approved relief items'],
];

/** Verified against INEC PU directory (partial) and multiple public lists. Names/codes only — NO coordinates or boundaries. */
export const KOGI_LGAS = ['Adavi','Ajaokuta','Ankpa','Bassa','Dekina','Ibaji','Idah','Igalamela-Odolu','Ijumu','Kabba/Bunu','Kogi','Lokoja','Mopa-Muro','Ofu','Ogori/Magongo','Okehi','Okene','Olamaboro','Omala','Yagba East','Yagba West'];
