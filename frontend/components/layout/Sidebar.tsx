"use client";

import Link from "next/link";
import { useStoredBoolean } from "@/lib/useStoredBoolean";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, type ElementType } from "react";
import { auth } from "@/lib/auth";
import { authApi, type WorkspaceRead } from "@/lib/api";
import { FileText, Sun, ClipboardList, Users, Workflow, Columns2, Map, GitBranch, FolderOpen, PenTool, Building2, HardHat, Handshake, Settings, CreditCard, User, ShieldCheck, ChevronLeft, ChevronRight, ClockCheck, CalendarRange, MessageSquare, Umbrella, Wrench, CheckSquare, Receipt, Search, X, BarChart2, BriefcaseBusiness } from "lucide-react";

type NavItem = { href: string; label: string; icon: ElementType; admin?: boolean; staffing?: boolean; agency?: boolean };
const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Heute", icon: Sun },
  { href: "/dashboard/people", label: "Menschen", icon: Users },
  { href: "/dashboard/applications", label: "Bewerbungen", icon: ClipboardList },
  { href: "/dashboard/communication", label: "Nachrichten", icon: MessageSquare },
  { href: "/dashboard/analytics", label: "Auswertungen", icon: BarChart2 },
];
const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Recruiting", items: [
    { href: "/dashboard/jobs", label: "Stellen", icon: BriefcaseBusiness },
    { href: "/dashboard/interviews", label: "Interviews", icon: CalendarRange },
    { href: "/dashboard/offers", label: "Angebote & Freigaben", icon: FileText },
    { href: "/dashboard/candidates", label: "Talentsuche", icon: Search },
    { href: "/dashboard/pipeline", label: "Pipeline", icon: Workflow },
    { href: "/dashboard/processes", label: "Prozesse", icon: Workflow },
    { href: "/dashboard/agents", label: "Agenten & Aufgaben", icon: Workflow },
    { href: "/dashboard/kanban", label: "Kanban", icon: Columns2 },
    { href: "/dashboard/partner", label: "Vermittlungen", icon: Handshake, agency: true },
    { href: "/dashboard/cooperations", label: "Firmenkooperationen", icon: Handshake },
  ] },
  { label: "Personal & Organisation", items: [
    { href: "/dashboard/zeitarbeit/workers", label: "Mitarbeitende", icon: HardHat },
    { href: "/dashboard/onboarding", label: "Onboarding", icon: CheckSquare },
    { href: "/dashboard/zeitarbeit/tasks", label: "Aufgaben", icon: CheckSquare },
    { href: "/dashboard/zeitarbeit/time-approval", label: "Freigaben", icon: ClockCheck },
    { href: "/dashboard/zeitarbeit/absences", label: "Abwesenheiten", icon: Umbrella },
    { href: "/dashboard/documents", label: "Dokumente", icon: FolderOpen },
    { href: "/dashboard/zeitarbeit/equipment", label: "Ausrüstung", icon: Wrench },
    { href: "/dashboard/zeitarbeit/payroll", label: "Lohnabrechnung", icon: Receipt },
    { href: "/dashboard/org-charts", label: "Organigramm", icon: GitBranch },
  ] },
  { label: "Disposition", items: [
    { href: "/dashboard/zeitarbeit", label: "Aufträge", icon: Building2, staffing: true },
    { href: "/dashboard/zeitarbeit/pool", label: "Personalpool", icon: Users, staffing: true },
    { href: "/dashboard/zeitarbeit/assignments", label: "Einsätze", icon: CalendarRange },
    { href: "/dashboard/canvas", label: "Canvas", icon: PenTool, staffing: true },
    { href: "/dashboard/map", label: "Karte", icon: Map },
    { href: "/dashboard/mobility", label: "Einsatz- & Fahrplanung", icon: Map },
  ] },
  { label: "Verwaltung", items: [
    { href: "/dashboard/finance", label: "Finanzen & Rechnungen", icon: Receipt },
    { href: "/dashboard/members", label: "Team & Zugänge", icon: Users, admin: true },
    { href: "/dashboard/teams", label: "Teams", icon: Users, admin: true },
    { href: "/dashboard/settings", label: "Firma", icon: Settings },
    { href: "/dashboard/branding", label: "Markenauftritt", icon: PenTool },
    { href: "/dashboard/plan", label: "Plan", icon: CreditCard, admin: true },
    { href: "/dashboard/connections", label: "E-Mail & Kalender", icon: CalendarRange },
    { href: "/settings", label: "Konto", icon: User },
  ] },
];
interface SidebarProps { isAdmin?: boolean; collapsed?: boolean; onToggle?: (collapsed: boolean) => void; unreadMessages?: number }

export function Sidebar({ isAdmin: adminProp, collapsed: collapsedProp, onToggle, unreadMessages = 0 }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceRead | null>(null);
  const [stored, setStored] = useStoredBoolean("sidebar-collapsed");
  const [role, setRole] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const isCollapsed = collapsedProp ?? stored;
  const isAdmin = adminProp ?? role === "admin";
  useEffect(() => {
    const token = auth.getAccess(); if (!token) return;
    authApi.workspace(token).then(setWorkspace).catch(() => {});
    if (adminProp === undefined) authApi.me(token).then(u => setRole(u.role)).catch(() => {});
  }, [adminProp]);
  useEffect(() => {
    function keydown(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); dialog.current?.showModal(); } }
    // Only the visible sidebar owns the shortcut (desktop and mobile share this component).
    const listener = (event: KeyboardEvent) => { if (dialog.current?.parentElement?.getClientRects().length) keydown(event); };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  if (adminProp === undefined && role !== "admin" && role !== "recruiter") return null;
  const allowed = (item: NavItem) => (!item.admin || isAdmin) && (!item.staffing || workspace?.type === "zeitarbeit") && (!item.agency || workspace?.type !== "internal_hr");
  const groups = GROUPS.map(group => ({ ...group, items: group.items.filter(allowed) }));
  const all = [...PRIMARY, ...groups.flatMap(group => group.items)];
  if (isAdmin && !workspace) all.push({ href: "/admin", label: "Admin Hub", icon: ShieldCheck });
  const active = (href: string) => ["/dashboard", "/dashboard/zeitarbeit"].includes(href) ? pathname === href : pathname.startsWith(href);
  function itemLink({ href, label, icon: Icon }: NavItem) {
    return <Link key={href} href={href} aria-label={label} title={isCollapsed ? label : undefined} aria-current={active(href) ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium transition-colors ${active(href) ? "border-white/20 bg-white/10 text-[var(--nf-sidebar-ink)]" : "text-[var(--nf-sidebar-muted)] hover:bg-white/10 hover:text-white"}`}><Icon size={18} className="shrink-0" aria-hidden="true" />{!isCollapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}{href.endsWith("/messages") && unreadMessages > 0 && <span className="rounded-full bg-[var(--nf-lime)] px-1.5 py-0.5 text-[10px] text-[var(--nf-ink)]">{unreadMessages > 9 ? "9+" : unreadMessages}</span>}</Link>;
  }
  return <aside className={`fixed left-0 top-14 z-40 flex h-[calc(100dvh-3.5rem)] flex-col border-r border-white/10 bg-[var(--nf-forest)] ${isCollapsed ? "w-16" : "w-60"}`}>
    <button onClick={() => onToggle ? onToggle(!isCollapsed) : setStored(!isCollapsed)} aria-label={isCollapsed ? "Navigation aufklappen" : "Navigation einklappen"} aria-expanded={!isCollapsed} className="flex min-h-11 items-center justify-end border-b border-white/10 px-5 text-[var(--nf-sidebar-muted)]">{isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
    <div className="p-2"><button onClick={() => dialog.current?.showModal()} aria-label="Suche öffnen" className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-[var(--nf-sidebar-muted)]"><Search size={17} className="shrink-0" />{!isCollapsed && <><span className="flex-1 text-left">Suchen</span><kbd className="text-xs text-[var(--nf-sidebar-muted)]">⌘ K</kbd></>}</button></div>
    <nav aria-label="Arbeitsbereiche" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {PRIMARY.map(itemLink)}
      {groups.map(group => group.items.length > 0 && (isCollapsed ? <div key={group.label} className="mt-3 border-t border-white/10 pt-2">{group.items.map(itemLink)}</div> : <details key={group.label} open={group.items.some(item => active(item.href))} className="pt-3"><summary className="min-h-11 cursor-pointer select-none rounded-lg px-3 py-3 text-xs font-semibold text-[var(--nf-sidebar-muted)] hover:bg-white/10 hover:text-white">{group.label}</summary><div className="space-y-1">{group.items.map(itemLink)}</div></details>))}
      {isAdmin && !workspace && itemLink({ href: "/admin", label: "Admin Hub", icon: ShieldCheck })}
    </nav>
    {!isCollapsed && <div className="border-t border-white/10 p-4"><p className="truncate text-xs font-medium text-[var(--nf-sidebar-ink)]">{workspace?.name ?? "Palmscout"}</p><p className="mt-1 text-xs text-[var(--nf-sidebar-muted)]">{workspace?.type === "internal_hr" ? "HR-Arbeitsbereich" : workspace?.type === "zeitarbeit" ? "Disposition & Recruiting" : "Recruiting & Vermittlung"}</p></div>}
    <dialog ref={dialog} aria-label="Globale Suche" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} className="fixed inset-0 m-auto w-[min(36rem,calc(100vw-2rem))] max-h-[80dvh] overflow-y-auto rounded-[var(--nf-radius)] border border-[var(--nf-line)] bg-[var(--nf-surface)] p-0 text-[var(--nf-ink)] shadow-2xl backdrop:bg-[rgb(23_63_49_/_55%)]">
      <form onSubmit={e => { e.preventDefault(); dialog.current?.close(); router.push(`/dashboard/people?q=${encodeURIComponent(query)}`); }} className="flex items-center gap-3 border-b border-[var(--nf-line)] p-4"><Search size={20} className="shrink-0 text-[var(--nf-forest)]" /><input autoFocus aria-label="Bereiche oder Menschen suchen" value={query} onChange={e => setQuery(e.target.value)} placeholder="Bereich, Name oder Fähigkeit …" className="min-h-11 min-w-0 flex-1 bg-transparent outline-none" /><button type="button" aria-label="Suche schließen" onClick={() => dialog.current?.close()} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-[var(--nf-soft)]"><X size={18} /></button></form>
      <div className="space-y-1 p-3">{query.trim() && <Link onClick={() => dialog.current?.close()} href={`/dashboard/people?q=${encodeURIComponent(query.trim())}`} className="block rounded-lg bg-[var(--nf-soft)] px-4 py-3 text-sm font-medium text-[var(--nf-forest)]">Menschen nach „{query}“ durchsuchen</Link>}{all.filter(item => item.label.toLocaleLowerCase("de").includes(query.toLocaleLowerCase("de"))).map(item => <Link key={item.href} onClick={() => dialog.current?.close()} href={item.href} className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm hover:bg-[var(--nf-soft)]"><item.icon size={16} aria-hidden="true" />{item.label}</Link>)}</div>
    </dialog>
  </aside>;
}
