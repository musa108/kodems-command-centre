import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { scopeWhere } from '../common/scope';

const mapQ = z.object({ severity: z.string().optional(), category: z.string().optional(), lgaId: z.string().uuid().optional(), status: z.string().optional(),
  from: z.string().optional(), to: z.string().optional(), q: z.string().max(80).optional() });
const csv = (s?: string) => s ? s.split(',').filter(Boolean) : undefined;

@Controller()
export class GeographyController {
  constructor(private prisma: PrismaService) {}

  @Get('geography/lgas') @Perm('dashboard.read') async lgas(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.lga.findMany({ where: u.lgaScope === null ? {} : { id: { in: u.lgaScope } }, orderBy: { name: 'asc' } });
    return { data: rows.map(r => ({ id: r.id, name: r.name, code: r.code })) };
  }
  @Get('geography/wards') @Perm('dashboard.read') async wards(@CurrentUser() u: AuthUser, @Query('lgaId') lgaId?: string) {
    return { data: await this.prisma.ward.findMany({ where: { ...(lgaId ? { lgaId } : {}), ...scopeWhere(u) }, orderBy: { name: 'asc' }, take: 500 }) };
  }
  @Get('geography/communities') @Perm('dashboard.read') async communities(@CurrentUser() u: AuthUser, @Query('lgaId') lgaId?: string, @Query('wardId') wardId?: string) {
    return { data: await this.prisma.community.findMany({ where: { ...(lgaId ? { lgaId } : {}), ...(wardId ? { wardId } : {}), ...scopeWhere(u) }, orderBy: { name: 'asc' }, take: 500 }) };
  }
  /** Boundary GeoJSON from PostGIS. Empty until a verified dataset is imported (npm run boundaries:import). */
  @Get('geography/boundaries') @Perm('map.read')
  async boundaries(@CurrentUser() u: AuthUser) {
    const rows: any[] = await this.prisma.$queryRawUnsafe(`SELECT id, kind, "refId", name, source, "isPlaceholder", ST_AsGeoJSON(geom)::json AS geometry FROM geographic_boundaries WHERE geom IS NOT NULL`);
    const ok = rows.filter(r => u.lgaScope === null || r.kind !== 'LGA' || u.lgaScope.includes(r.refId));
    return { type: 'FeatureCollection', features: ok.map(r => ({ type: 'Feature', geometry: r.geometry, properties: { id: r.id, kind: r.kind, refId: r.refId, name: r.name, source: r.source, placeholder: r.isPlaceholder } })) };
  }

  @Get('map/incidents') @Perm('map.read', 'incidents.read')
  async incidents(@CurrentUser() u: AuthUser, @Query() raw: any) {
    const f = mapQ.parse(raw);
    const where: any = { ...scopeWhere(u) };
    if (f.severity) where.severity = { in: csv(f.severity) };
    if (f.status) where.status = { in: csv(f.status) }; else where.status = { notIn: ['CLOSED'] };
    if (f.category) where.category = { key: { in: csv(f.category) } };
    if (f.lgaId) where.lgaId = f.lgaId;
    if (f.from || f.to) where.createdAt = { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to) : undefined };
    if (f.q) where.OR = [{ ref: { contains: f.q, mode: 'insensitive' } }, { title: { contains: f.q, mode: 'insensitive' } }];
    const canTeams = u.permissions.has('map.teams') && u.permissions.has('deployments.read');
    const rows = await this.prisma.incident.findMany({ where, take: 1000, orderBy: { createdAt: 'desc' }, include: { category: true, lga: true,
      deployments: canTeams ? { where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'] } }, include: { team: { select: { name: true } } } } : false } });
    // No reporter PII is ever included in map payloads.
    return { data: rows.map(i => ({ id: i.id, ref: i.ref, title: i.title, category: i.category.key, categoryLabel: i.category.label, severity: i.severity, status: i.status, lat: i.lat, lng: i.lng, lga: i.lga.name, lgaId: i.lgaId, createdAt: i.createdAt,
      teams: canTeams ? (i as any).deployments.map((d: any) => d.team.name) : undefined })) };
  }
  @Get('map/teams') @Perm('map.read', 'map.teams', 'teams.read')
  async teams(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.responseTeam.findMany({ where: { ...scopeWhere(u) }, include: { category: true, lga: true } });
    return { data: rows.map(t => ({ id: t.id, code: t.code, name: t.name, status: t.status, category: t.category.label, lga: t.lga.name, lat: t.lastLat ?? t.baseLat, lng: t.lastLng ?? t.baseLng, lastLocationAt: t.lastLocationAt })).filter(t => t.lat != null) };
  }
  @Get('map/shelters') @Perm('map.read', 'shelters.read')
  async shelters(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.shelter.findMany({ where: { ...scopeWhere(u), lat: { not: null } }, include: { lga: true, _count: { select: { registrations: { where: { checkOutAt: null } } } } } });
    return { data: rows.map(s => ({ id: s.id, code: s.code, name: s.name, status: s.status, capacity: s.capacity, occupancy: s._count.registrations, lga: s.lga.name, lat: s.lat, lng: s.lng })) };
  }
  @Get('map/warehouses') @Perm('map.read', 'relief.inventory.read')
  async warehouses(@CurrentUser() u: AuthUser) {
    const rows = await this.prisma.warehouse.findMany({ where: { ...scopeWhere(u), lat: { not: null } }, include: { lga: true } });
    return { data: rows.map(w => ({ id: w.id, code: w.code, name: w.name, status: w.status, lga: w.lga.name, lat: w.lat, lng: w.lng })) };
  }
}
