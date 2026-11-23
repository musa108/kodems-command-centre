import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { AnalyticsService, Filters } from './analytics.service';
import { CurrentUser, Perm } from '../common/decorators';
import { AuthUser } from '../common/auth.types';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { scopeWhere } from '../common/scope';

const fq = z.object({ from: z.string().optional(), to: z.string().optional(), lgaId: z.string().uuid().optional(), category: z.string().optional(), severity: z.string().optional(), status: z.string().optional() });
const esc = (v: any) => { const s = v == null ? '' : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe; }; // CSV-injection safe

@Controller('analytics')
export class AnalyticsController {
  constructor(private svc: AnalyticsService, private prisma: PrismaService, private audit: AuditService) {}
  @Get('overview') @Perm('analytics.read') overview(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.overview(u, fq.parse(q)); }
  @Get('incidents') @Perm('analytics.read') incidents(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.incidents(u, fq.parse(q)); }
  @Get('response-performance') @Perm('analytics.read') rp(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.responsePerformance(u, fq.parse(q)); }
  @Get('affected-population') @Perm('analytics.read') ap(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.affected(u, fq.parse(q)); }
  @Get('relief-distribution') @Perm('analytics.read') rel(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.relief(u, fq.parse(q)); }
  @Get('shelter-occupancy') @Perm('analytics.read') sh(@CurrentUser() u: AuthUser, @Query() q: any) { return this.svc.shelters(u, fq.parse(q)); }

  /** Exports respect permissions AND geographic scope (same query path as the on-screen data), and are audited. */
  @Get('export') @Perm('analytics.read', 'analytics.export')
  async export(@CurrentUser() u: AuthUser, @Query() q: any, @Res() res: Response) {
    const f: Filters = fq.parse(q); const format = String(q.format || 'csv'); const dataset = String(q.dataset || 'incidents');
    if (!['csv', 'xlsx', 'pdf'].includes(format)) throw new BadRequestException({ code: 'BAD_FORMAT', message: 'format must be csv, xlsx or pdf' });
    let title = '', cols: string[] = [], rows: any[][] = [];
    if (dataset === 'incidents') {
      const d = await this.prisma.incident.findMany({ where: this.svc.incWhere(u, f), include: { lga: true, category: true }, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 20000 });
      title = 'Incidents'; cols = ['Ref', 'Title', 'Category', 'Severity', 'Status', 'LGA', 'Estimated affected', 'Created (UTC)']; rows = d.map(i => [i.ref, i.title, i.category.label, i.severity, i.status, i.lga.name, i.estAffected ?? '', i.createdAt.toISOString()]);
    } else if (dataset === 'relief') {
      const r = await this.svc.relief(u, f); title = 'Relief items'; cols = ['Item', 'Unit', 'Received', 'Distributed', 'Damaged/Expired']; rows = r.items.map((i: any) => [i.name, i.unit, i.received, i.distributed, i.lost]);
    } else if (dataset === 'shelters') {
      const s = await this.svc.shelters(u, f); title = 'Shelter occupancy'; cols = ['Shelter', 'LGA', 'Status', 'Capacity', 'Occupancy', 'Utilisation %']; rows = s.data.map(x => [x.name, x.lga, x.status, x.capacity, x.occupancy, x.utilisation]);
    } else if (dataset === 'households') {
      if (!u.permissions.has('population.read')) throw new BadRequestException({ code: 'FORBIDDEN', message: 'No access' });
      const h = await this.prisma.affectedHousehold.findMany({ where: { ...scopeWhere(u) }, include: { lga: true, incident: { select: { ref: true } } }, take: 20000 });
      title = 'Affected households (no personal names)'; cols = ['Household', 'Incident', 'LGA', 'Size', 'Damage', 'Displacement']; rows = h.map(x => [x.ref, x.incident.ref, x.lga.name, x.size, x.damage, x.displacement]);
    } else throw new BadRequestException({ code: 'BAD_DATASET', message: 'Unknown dataset' });
    await this.audit.log(u, { action: 'analytics.export', entityType: 'export', after: { dataset, format, rows: rows.length, filters: f } });
    const stamp = `Generated ${new Date().toISOString()} UTC · period ${f.from ?? 'all'} → ${f.to ?? 'now'}${u.lgaScope ? ' · scope-limited' : ''}`;
    const name = `kodems-${dataset}-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`); res.send([`# ${title} — ${stamp}`, cols.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')); return; }
    if (format === 'xlsx') {
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(title.slice(0, 30)); ws.addRow([`${title} — ${stamp}`]); ws.addRow(cols).font = { bold: true }; rows.forEach(r => ws.addRow(r.map(v => typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v)));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`); res.send(Buffer.from(await wb.xlsx.writeBuffer())); return;
    }
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`); doc.pipe(res);
    doc.fontSize(14).text(`KOSEMA — ${title}`); doc.fontSize(8).text(stamp).moveDown(); doc.fontSize(8).text(cols.join('  |  '), { underline: true });
    rows.slice(0, 2000).forEach(r => doc.text(r.map(v => String(v ?? '')).join('  |  '))); if (rows.length > 2000) doc.text(`… ${rows.length - 2000} more rows; use CSV/Excel for the full dataset.`); doc.end();
  }
}
