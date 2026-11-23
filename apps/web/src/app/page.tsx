import Image from 'next/image';
import Link from 'next/link';
import { Activity, ArrowRight, BellRing, Boxes, Landmark, Map as MapIcon, ShieldCheck, Siren, Truck, Tent, FileCheck2 } from 'lucide-react';
import { Logo } from '@/components/layout/shell';

const FEATURES = [
  { icon: FileCheck2, t: 'Reports & verification', d: 'Search, review, assign, verify, reject with a reason, flag duplicates, attach notes and follow the full status history.' },
  { icon: Siren, t: 'Incident command', d: 'Create incidents from verified reports or directly. Record severity, ownership, decisions, evidence, updates and resolution.' },
  { icon: MapIcon, t: 'Geospatial operations', d: 'Filter and layer incidents, teams, shelters and warehouses. Verified boundary overlays appear only when authoritative data is supplied.' },
  { icon: Truck, t: 'Teams & deployments', d: 'Manage team capabilities and availability; assign, reassign and track deployments through field completion.' },
  { icon: Boxes, t: 'Relief & stock control', d: 'Record receipts and movements, reconcile stock, approve allocations and tie distributions to approved requests.' },
  { icon: Tent, t: 'Shelters & households', d: 'Track shelter capacity and occupancy, and manage affected households and persons with protected, audited access.' },
  { icon: BellRing, t: 'Alerts & notifications', d: 'Review and approve public alerts with an amendment history. SMS, email and push remain clearly marked until configured.' },
  { icon: Activity, t: 'Analytics & exports', d: 'Review incidents, response performance, affected population, relief and occupancy using scoped reports and exports.' },
];

const JOURNEY = [
  ['01', 'A report is received', 'Capture an emergency report with its category, location and available supporting details. It enters a visible work queue for review.'],
  ['02', 'An officer verifies it', 'An authorised verifier investigates, records notes and chooses to verify, reject with a reason or flag a duplicate. A report never becomes an incident silently.'],
  ['03', 'The incident is coordinated', 'Link one or more verified reports, set severity and ownership, record decisions and updates, and follow the event on the operational map.'],
  ['04', 'Teams are assigned', 'A coordinator assigns an available team and tracks acceptance, travel, arrival and completion. Reassignment and cancellation require a recorded reason.'],
  ['05', 'Support is accounted for', 'Manage shelter occupancy, affected households, stock movements and relief allocations. Distributions are tied to approved allocations.'],
  ['06', 'The response is reviewed', 'Resolve and close with summaries, preserve the event history, then use performance views and permission-scoped exports to learn from the response.'],
];

const PHOTO = 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Confluence_state.jpg';
const RIVER_PHOTO = 'https://upload.wikimedia.org/wikipedia/commons/3/3d/View_of_River_Niger_and_River_Venue_from_the_top_of_Mount_Patti_in_Lokoja_%28Confluence_city%29.jpg';

export default function Landing() {
  return <div className="min-h-screen overflow-hidden bg-[#f8f7f2] text-[#15253b]">
    <header className="relative z-10 border-b border-[#e8e5db] bg-[#fbfaf6]/95">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <nav aria-label="Primary" className="flex items-center gap-7 text-sm font-semibold text-[#263851]">
          <a href="#capabilities" className="hidden transition-colors hover:text-[#a97c2b] sm:block">What we do</a>
          <a href="#assurance" className="hidden transition-colors hover:text-[#a97c2b] sm:block">Trust & accountability</a>
          <Link href="/login" className="rounded-full bg-[#122b46] px-5 py-2.5 text-white shadow-sm transition hover:bg-[#1b3f61]">Staff sign in <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
        </nav>
      </div>
    </header>

    <main>
      <section className="relative isolate border-b border-[#e8e5db] bg-[#f5f2e8]">
        <div className="pointer-events-none absolute -left-32 top-16 h-80 w-80 rounded-full bg-[#e7d3a1]/25 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[.92fr_1.08fr] lg:gap-14 lg:py-20">
          <div className="relative z-10">
            <p className="mb-6 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[.17em] text-[#84621f]">
              <Landmark className="h-5 w-5 shrink-0" aria-hidden /> Kogi State Emergency Management Agency
            </p>
            <h1 className="max-w-2xl font-display text-[3.25rem] font-medium leading-[1.03] tracking-[-.045em] text-[#102945] sm:text-6xl lg:text-[4.35rem]">
              Where the rivers meet, <span className="text-[#9b752f]">we come together.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#526174] sm:text-xl sm:leading-9">
              One coordinated view of emergency reports, response teams, relief and shelter operations across Kogi State.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/login" className="inline-flex items-center gap-3 rounded-full bg-[#122b46] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#122b46]/15 transition hover:-translate-y-0.5 hover:bg-[#1b3f61]">
                Enter the command centre <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#capabilities" className="rounded-full px-5 py-3 text-sm font-bold text-[#243b55] transition hover:bg-white/70">Explore the platform</a>
            </div>
            <div className="mt-8 flex items-start gap-3 border-l-2 border-[#c6a65e] pl-4 text-sm leading-6 text-[#647083]">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9b752f]" aria-hidden />
              <p>For authorised KOSEMA personnel and partner agencies. Access is controlled and activity is audited.</p>
            </div>
          </div>

          <figure className="relative min-h-[390px] overflow-hidden rounded-[1.6rem] bg-[#304b57] shadow-[0_28px_70px_-28px_rgba(16,41,69,.5)] sm:min-h-[490px]">
            <Image src={PHOTO} alt="Lokoja and the Niger–Benue confluence, seen from Mount Patti in Kogi State" fill priority sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#081b2d]/85 via-[#102b3a]/10 to-[#102b3a]/5" />
            <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-white/30 bg-[#102b3a]/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[.18em] text-white backdrop-blur-md sm:left-7 sm:top-7">
              <MapIcon className="h-3.5 w-3.5" /> The heart of Kogi
            </div>
            <figcaption className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[#f1d99f]">Lokoja · Mount Patti</p>
              <p className="mt-2 max-w-md font-display text-3xl leading-tight sm:text-4xl">At the confluence, every community is connected.</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/25 pt-3 text-[10px] text-white/75">
                <span>Niger and Benue rivers · Kogi State</span>
                <a href="https://commons.wikimedia.org/wiki/File:Confluence_state.jpg" target="_blank" rel="noreferrer" className="underline decoration-white/50 underline-offset-2 hover:text-white">Photo: Dotun55 / Wikimedia Commons · CC BY-SA 4.0</a>
              </div>
            </figcaption>
          </figure>
        </div>
        <div className="mx-auto max-w-7xl px-5 pb-8 sm:px-8 lg:pb-10">
          <div className="grid gap-3 border-t border-[#ded9c9] pt-5 text-sm text-[#6c7480] sm:grid-cols-3">
            <p><span className="font-display text-2xl text-[#173452]">Listen</span><span className="ml-3">Community reports, clearly recorded</span></p>
            <p><span className="font-display text-2xl text-[#173452]">Coordinate</span><span className="ml-3">Teams, information and decisions</span></p>
            <p><span className="font-display text-2xl text-[#173452]">Account</span><span className="ml-3">Relief and actions, fully traceable</span></p>
          </div>
        </div>
      </section>

      <section id="capabilities" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-5 md:grid-cols-[.8fr_1.2fr] md:items-end">
          <div><p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-[#97712e]">One joined-up response</p><h2 className="max-w-lg font-display text-4xl leading-tight tracking-[-.025em] text-[#102945] sm:text-5xl">Built for the realities of Kogi.</h2></div>
          <p className="max-w-2xl text-base leading-7 text-[#5b6878] md:justify-self-end">From river communities to the hills and highways, KOSEMA teams need trusted information and clear coordination. The Command Centre brings those workflows into one accountable system.</p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{FEATURES.map(f => <article key={f.t} className="group rounded-2xl border border-[#e8e5db] bg-white/75 p-5 transition duration-200 hover:-translate-y-1 hover:border-[#d5c69e] hover:bg-white hover:shadow-[0_16px_35px_-25px_rgba(16,41,69,.4)] sm:p-6"><div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-[#f3efe3] transition group-hover:bg-[#efe4c8]"><f.icon className="h-5 w-5 text-[#806124]" aria-hidden /></div><h3 className="font-display text-xl font-semibold text-[#173452]">{f.t}</h3><p className="mt-2 text-sm leading-6 text-[#647083]">{f.d}</p></article>)}</div>
      </section>

      <section id="journey" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-3xl"><p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-[#97712e]">How the Command Centre is used</p><h2 className="font-display text-4xl leading-tight tracking-[-.025em] text-[#102945] sm:text-5xl">One clear path from first report to learning.</h2><p className="mt-4 text-base leading-7 text-[#5b6878]">KODEMS is designed to keep information, decisions and follow-up connected. Each handoff has an owner, an action and a record.</p></div>
          <ol className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{JOURNEY.map(([n, title, detail]) => <li key={n} className="relative rounded-2xl border border-[#e8e5db] bg-[#fbfaf6] p-6"><span className="font-display text-3xl text-[#b58b3b]">{n}</span><h3 className="mt-4 font-display text-2xl text-[#173452]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#647083]">{detail}</p></li>)}</ol>
          <div className="mt-7 flex flex-col gap-3 rounded-2xl bg-[#112b45] p-6 text-white sm:flex-row sm:items-center sm:justify-between"><p className="font-semibold">Designed for the people coordinating response.</p><p className="text-sm leading-6 text-white/70">Verification officers · response coordinators · relief and shelter teams · administrators · monitoring and evaluation officers</p></div>
        </div>
      </section>

      <section className="border-y border-[#e8e5db] bg-[#f2efe5]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
          <div><p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-[#97712e]">A Kogi-wide perspective</p><h2 className="max-w-xl font-display text-4xl leading-tight tracking-[-.025em] text-[#102945] sm:text-5xl">Local context matters in every response.</h2><p className="mt-5 max-w-xl text-base leading-7 text-[#5b6878]">The map brings reports, incidents, response teams, shelters and warehouses into a shared operational view. Officers can filter the work to their permitted area while statewide teams coordinate across locations.</p>
            <ul className="mt-6 space-y-3 text-sm leading-6 text-[#405269]"><li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b58b3b]" />Kogi’s 21 LGA names are available for organising and filtering records.</li><li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b58b3b]" />Incident locations use spatial queries for proximity and map views.</li><li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b58b3b]" />Official boundaries, wards, settlements and flood-risk overlays are not invented; they appear only after verified data is supplied.</li></ul>
          </div>
          <figure className="relative min-h-[330px] overflow-hidden rounded-[1.4rem] bg-[#304b57] shadow-[0_25px_60px_-28px_rgba(16,41,69,.45)] sm:min-h-[410px]">
            <Image src={RIVER_PHOTO} alt="View of the Niger and Benue rivers from Mount Patti in Lokoja, Kogi State" fill sizes="(max-width: 1024px) 100vw, 55vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#081b2d]/85 via-transparent to-transparent" />
            <figcaption className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7"><p className="font-display text-2xl">Kogi’s geography, kept in view.</p><a href="https://commons.wikimedia.org/wiki/File:View_of_River_Niger_and_River_Venue_from_the_top_of_Mount_Patti_in_Lokoja_(Confluence_city).jpg" target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] text-white/80 underline decoration-white/50 underline-offset-2">Photo: Samlokoja / Wikimedia Commons · CC BY-SA 4.0</a></figcaption>
          </figure>
        </div>
      </section>

      <section id="assurance" className="bg-[#112b45] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 sm:py-16 md:grid-cols-[.8fr_1.2fr] md:items-center">
          <div><p className="mb-3 text-xs font-bold uppercase tracking-[.2em] text-[#e5c879]">Trust is operational</p><h2 className="font-display text-4xl leading-tight sm:text-5xl">Every action has a record.</h2><p className="mt-4 max-w-md text-sm leading-6 text-white/70">Sensitive information and emergency decisions deserve careful handling at every step.</p></div>
          <div className="grid gap-6 sm:grid-cols-3">{[['Scoped access', 'Permissions are checked on every request and limited to an officer’s authorised area.'], ['Audited decisions', 'Key changes, approvals and access to protected records are recorded.'], ['Privacy by design', 'Affected-person information is protected with access controls and audit trails.']].map(([t, d]) => <div key={t} className="border-t border-white/20 pt-4"><ShieldCheck className="mb-4 h-5 w-5 text-[#e5c879]" aria-hidden /><h3 className="font-semibold text-white">{t}</h3><p className="mt-2 text-sm leading-6 text-white/65">{d}</p></div>)}</div>
        </div>
      </section>
    </main>
    <footer className="bg-[#f8f7f2]"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 sm:px-8 md:flex-row md:items-center md:justify-between"><Logo /><p className="max-w-3xl text-xs leading-5 text-[#687384]">© Kogi State Emergency Management Agency. This public page shows no live or fabricated incident figures. Demonstration records inside the system are labelled DEMO.</p></div></footer>
  </div>;
}
