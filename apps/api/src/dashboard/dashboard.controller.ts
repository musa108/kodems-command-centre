import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { scopeWhere } from '../common/scope';

@Controller('dashboard')
export class DashboardController {
  constructor(private analytics: AnalyticsService, private prisma: PrismaService) {}
  @Get('overview') @Perm('dashboard.read')
  async overview(@CurrentUser() u: AuthUser, @Query() q: any) {
    const o = await this.analytics.overview(u, { from: q.from, to: q.to, lgaId: q.lgaId });
    const demoCount = await this.prisma.incident.count({ where: { isDemo: true, ...scopeWhere(u) } });
    return { ...o, environment: process.env.APP_ENV || 'development', containsDemoData: demoCount > 0 };
  }
  @Get('incident-summary') @Perm('dashboard.read', 'incidents.read')
  async incidentSummary(@CurrentUser() u: AuthUser, @Query() q: any) {
    const where: any = { ...scopeWhere(u), status: { in: ['OPEN', 'ASSESSMENT', 'RESPONSE_ACTIVE', 'RECOVERY'] }, ...(q.lgaId ? { lgaId: q.lgaId } : {}) };
    const [active, incoming] = await Promise.all([
      this.prisma.incident.findMany({ where, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 8, include: { category: true, lga: true } }),
      this.prisma.incidentReport.findMany({ where: { ...scopeWhere(u), status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, ...(q.lgaId ? { lgaId: q.lgaId } : {}) }, orderBy: [{ suggestedSeverity: 'desc' }, { submittedAt: 'asc' }], take: 8, include: { category: true, lga: true } })]);
    return { activeIncidents: active.map(i => ({ id: i.id, ref: i.ref, title: i.title, severity: i.severity, status: i.status, category: i.category.label, lga: i.lga.name, createdAt: i.createdAt })),
      incomingReports: incoming.map(r => ({ id: r.id, ref: r.ref, severity: r.suggestedSeverity, status: r.status, category: r.category.label, lga: r.lga.name, submittedAt: r.submittedAt, description: r.description.slice(0, 100) })) };
  }
  @Get('response-summary') @Perm('dashboard.read', 'deployments.read')
  async responseSummary(@CurrentUser() u: AuthUser) {
    const d = await this.prisma.deployment.findMany({ where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SITE'] }, incident: { ...scopeWhere(u) } }, orderBy: { assignedAt: 'desc' }, take: 10, include: { team: { select: { name: true } }, incident: { select: { ref: true, title: true } } } });
    return { deployments: d.map(x => ({ id: x.id, ref: x.ref, status: x.status, team: x.team.name, incident: x.incident.ref, incidentTitle: x.incident.title, assignedAt: x.assignedAt })) };
  }
  @Get('recent-activity') @Perm('dashboard.read')
  async recent(@CurrentUser() u: AuthUser) {
    // Activity feed derived from incident timelines (scope-filtered) — no PII.
    const rows = await this.prisma.incidentUpdate.findMany({ where: { incident: { ...scopeWhere(u) } }, orderBy: { at: 'desc' }, take: 15, include: { incident: { select: { id: true, ref: true } } } });
    return { data: rows.map(r => ({ id: r.id, at: r.at, type: r.type, text: r.body, incidentId: r.incident.id, incidentRef: r.incident.ref })) };
  }
}
