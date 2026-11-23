import type { Me } from './types';
/** UI hint only. The API is authoritative; hiding a control is never a security mechanism. */
export const can = (me: Me | null | undefined, ...perms: string[]) => !!me && perms.every(p => me.permissions.includes(p));
export const canAny = (me: Me | null | undefined, ...perms: string[]) => !!me && perms.some(p => me.permissions.includes(p));
export interface NavItem { href: string; label: string; icon: string; perm?: string[]; any?: string[] }
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Operations', items: [
    { href: '/dashboard', label: 'Command Centre', icon: 'layout-dashboard', perm: ['dashboard.read'] },
    { href: '/reports', label: 'Reports', icon: 'inbox', perm: ['reports.read'] },
    { href: '/incidents', label: 'Incidents', icon: 'siren', perm: ['incidents.read'] },
    { href: '/map', label: 'Map', icon: 'map', perm: ['map.read'] },
    { href: '/teams', label: 'Response teams', icon: 'users', perm: ['teams.read'] },
    { href: '/deployments', label: 'Deployments', icon: 'truck', perm: ['deployments.read'] } ] },
  { group: 'Humanitarian', items: [
    { href: '/households', label: 'Affected persons', icon: 'house', perm: ['population.read'] },
    { href: '/relief', label: 'Relief & inventory', icon: 'package', perm: ['relief.inventory.read'] },
    { href: '/shelters', label: 'Shelters', icon: 'tent', perm: ['shelters.read'] } ] },
  { group: 'Communication', items: [
    { href: '/alerts', label: 'Public alerts', icon: 'megaphone', perm: ['alerts.read'] },
    { href: '/notifications', label: 'Notifications', icon: 'bell', perm: ['notifications.read'] },
    { href: '/analytics', label: 'Analytics', icon: 'chart-column', perm: ['analytics.read'] } ] },
  { group: 'Administration', items: [
    { href: '/admin/users', label: 'Users & roles', icon: 'user-cog', perm: ['users.manage'] },
    { href: '/admin/config', label: 'Reference data', icon: 'settings', perm: ['config.manage'] },
    { href: '/admin/audit', label: 'Audit log', icon: 'scroll-text', perm: ['audit.read'] },
    { href: '/admin/health', label: 'System health', icon: 'activity', perm: ['system.health'] } ] },
];
