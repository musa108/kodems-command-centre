'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapIncident } from '@/lib/types';
import { fmtDate, humanize } from '@/lib/format';

const TILES = process.env.NEXT_PUBLIC_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '© OpenStreetMap contributors';
const KOGI_CENTER: [number, number] = [6.75, 7.65]; // lng, lat (approximate state centre for initial view only)
export const SEV_COLOR: Record<string, string> = { CRITICAL: '#B42318', HIGH: '#C26A00', MODERATE: '#B08D3C', LOW: '#1B7A47' };
export interface Layers { incidents: boolean; teams: boolean; shelters: boolean; warehouses: boolean; boundaries: boolean }
interface Pt { id: string; lat: number | null; lng: number | null; [k: string]: any }
const fc = (pts: Pt[], props: (p: Pt) => Record<string, any>) => ({ type: 'FeatureCollection' as const, features: pts.filter(p => p.lat != null && p.lng != null).map(p => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lng!, p.lat!] }, properties: props(p) })) });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function CommandMap({ incidents, teams = [], shelters = [], warehouses = [], boundaries, layers, height = 420, onSelect, focus }: { incidents: MapIncident[]; teams?: Pt[]; shelters?: Pt[]; warehouses?: Pt[]; boundaries?: any; layers: Layers; height?: number; onSelect?: (i: MapIncident) => void; focus?: { lat: number; lng: number } }) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<maplibregl.Map | null>(null); const [ready, setReady] = useState(false); const [err, setErr] = useState<string | null>(null);
  const sel = useRef(onSelect); sel.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    try {
      const m = new maplibregl.Map({ container: el.current, center: KOGI_CENTER, zoom: 7, attributionControl: { compact: true }, style: { version: 8, sources: { base: { type: 'raster', tiles: [TILES], tileSize: 256, attribution: ATTR } }, layers: [{ id: 'base', type: 'raster', source: 'base' }] } });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right'); map.current = m;
      m.on('error', e => { if ((e as any)?.error?.message?.includes('Failed to fetch') || (e as any)?.error?.status) setErr('Base map tiles could not be loaded. Incident layers still work.'); });
      m.on('load', () => {
        const empty = { type: 'FeatureCollection' as const, features: [] };
        m.addSource('boundaries', { type: 'geojson', data: empty }); m.addLayer({ id: 'boundaries-fill', type: 'fill', source: 'boundaries', paint: { 'fill-color': '#1B3F73', 'fill-opacity': 0.06 } }); m.addLayer({ id: 'boundaries-line', type: 'line', source: 'boundaries', paint: { 'line-color': '#1B3F73', 'line-width': 1.2 } });
        m.addSource('incidents', { type: 'geojson', data: empty, cluster: true, clusterRadius: 45, clusterMaxZoom: 11, clusterProperties: { crit: ['+', ['case', ['==', ['get', 'severity'], 'CRITICAL'], 1, 0]] } });
        m.addLayer({ id: 'inc-clusters', type: 'circle', source: 'incidents', filter: ['has', 'point_count'], paint: { 'circle-color': ['case', ['>', ['get', 'crit'], 0], '#B42318', '#13315C'], 'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
        m.addLayer({ id: 'inc-count', type: 'symbol', source: 'incidents', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 }, paint: { 'text-color': '#fff' } });
        m.addLayer({ id: 'inc-pt', type: 'circle', source: 'incidents', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': ['match', ['get', 'severity'], 'CRITICAL', 10, 'HIGH', 8, 7], 'circle-color': ['match', ['get', 'severity'], 'CRITICAL', SEV_COLOR.CRITICAL, 'HIGH', SEV_COLOR.HIGH, 'MODERATE', SEV_COLOR.MODERATE, SEV_COLOR.LOW], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
        m.addLayer({ id: 'inc-crit-ring', type: 'circle', source: 'incidents', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'severity'], 'CRITICAL']], paint: { 'circle-radius': 15, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 2, 'circle-stroke-color': SEV_COLOR.CRITICAL } }); // ring distinguishes critical without colour alone
        for (const [id, color] of [['teams', '#2A5290'], ['shelters', '#1B7A47'], ['warehouses', '#B08D3C']] as const) { m.addSource(id, { type: 'geojson', data: empty }); m.addLayer({ id: `${id}-pt`, type: 'circle', source: id, paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': color, 'circle-stroke-width': 3 } }); }
        m.on('click', 'inc-clusters', async e => { const f = m.queryRenderedFeatures(e.point, { layers: ['inc-clusters'] })[0]; if (!f) return; const z = await (m.getSource('incidents') as maplibregl.GeoJSONSource).getClusterExpansionZoom(f.properties!.cluster_id); m.easeTo({ center: (f.geometry as any).coordinates, zoom: z }); });
        m.on('click', 'inc-pt', e => { const p = e.features?.[0]?.properties as any; if (!p) return; const inc: MapIncident = { ...p, teams: p.teams ? JSON.parse(p.teams) : undefined };
          new maplibregl.Popup({ offset: 12, maxWidth: '280px' }).setLngLat((e.features![0].geometry as any).coordinates).setHTML(`<div style="font:13px Inter,sans-serif"><b>${esc(p.ref)}</b><br/>${esc(p.title)}<br/><span>${esc(p.categoryLabel)} · <b>${esc(humanize(p.severity))}</b> · ${esc(humanize(p.status))}</span><br/><span>LGA: ${esc(p.lga)} · ${esc(fmtDate(p.createdAt))}</span>${inc.teams?.length ? `<br/>Teams: ${esc(inc.teams.join(', '))}` : ''}<br/><a href="/incidents/${encodeURIComponent(p.id)}" style="color:#1B4F9C;font-weight:600">Open full record →</a></div>`).addTo(m); sel.current?.(inc); });
        for (const l of ['inc-clusters', 'inc-pt', 'teams-pt', 'shelters-pt', 'warehouses-pt']) { m.on('mouseenter', l, () => (m.getCanvas().style.cursor = 'pointer')); m.on('mouseleave', l, () => (m.getCanvas().style.cursor = '')); }
        for (const [id, label] of [['teams', 'Team'], ['shelters', 'Shelter'], ['warehouses', 'Warehouse']] as const) m.on('click', `${id}-pt`, e => { const p = e.features?.[0]?.properties as any; new maplibregl.Popup({ offset: 10 }).setLngLat((e.features![0].geometry as any).coordinates).setHTML(`<div style="font:13px Inter,sans-serif"><b>${label}: ${esc(p.name)}</b><br/>${esc(humanize(p.status))} · ${esc(p.lga)}${p.capacity ? `<br/>Occupancy ${esc(p.occupancy)}/${esc(p.capacity)}` : ''}</div>`).addTo(m); });
        setReady(true);
      });
    } catch (e: any) { setErr(e?.message ?? 'Map failed to initialise (WebGL may be unavailable)'); }
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => { const m = map.current; if (!m || !ready) return;
    (m.getSource('incidents') as maplibregl.GeoJSONSource).setData(fc(incidents as any, p => ({ ...p, teams: JSON.stringify((p as any).teams ?? []) })) as any);
    (m.getSource('teams') as maplibregl.GeoJSONSource).setData(fc(teams, p => p) as any); (m.getSource('shelters') as maplibregl.GeoJSONSource).setData(fc(shelters, p => p) as any); (m.getSource('warehouses') as maplibregl.GeoJSONSource).setData(fc(warehouses, p => p) as any);
    if (boundaries) (m.getSource('boundaries') as maplibregl.GeoJSONSource).setData(boundaries);
  }, [incidents, teams, shelters, warehouses, boundaries, ready]);
  useEffect(() => { const m = map.current; if (!m || !ready) return; const vis = (ids: string[], on: boolean) => ids.forEach(i => m.setLayoutProperty(i, 'visibility', on ? 'visible' : 'none'));
    vis(['inc-clusters', 'inc-count', 'inc-pt', 'inc-crit-ring'], layers.incidents); vis(['teams-pt'], layers.teams); vis(['shelters-pt'], layers.shelters); vis(['warehouses-pt'], layers.warehouses); vis(['boundaries-fill', 'boundaries-line'], layers.boundaries); }, [layers, ready]);
  useEffect(() => { if (focus && map.current) map.current.flyTo({ center: [focus.lng, focus.lat], zoom: 12 }); }, [focus]);

  return <div className="relative overflow-hidden rounded-md border border-line" style={{ height }}><div ref={el} className="h-full w-full" role="application" aria-label="Interactive map of Kogi State incidents" />
    {err && <div role="alert" className="absolute inset-x-2 top-2 rounded bg-warn-bg p-2 text-xs font-semibold text-warn">{err}</div>}
    <div className="absolute bottom-6 left-2 rounded-md border border-line bg-white/95 p-2 text-[11px] shadow-card" aria-label="Legend"><p className="mb-1 font-bold uppercase tracking-wide text-navy">Legend</p>
      {(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'] as const).map(s => <p key={s} className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border border-white" style={{ background: SEV_COLOR[s], outline: s === 'CRITICAL' ? `2px solid ${SEV_COLOR.CRITICAL}` : undefined, outlineOffset: 1 }} />{humanize(s)}{s === 'CRITICAL' && ' (ringed)'}</p>)}
      <p className="mt-1 flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-[3px] border-navy-500 bg-white" />Team</p><p className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-[3px] border-ok bg-white" />Shelter</p><p className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-[3px] border-gold bg-white" />Warehouse</p></div></div>;
}
