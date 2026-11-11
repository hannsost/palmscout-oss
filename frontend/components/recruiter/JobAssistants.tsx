"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import type { JobPosting } from "@/lib/api";
import { agentApi, type AgentCapability, type AgentOptions, type AgentRun, type ManagedAgent } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import { AgentRunCard } from "./AgentRunCard";

const choices = [
  { value: "ai_job_ad", title: "Stellenanzeige", description: "Klare Aufgaben, Anforderungen und belegte Rahmenbedingungen." },
  { value: "ai_interview_kit", title: "Interviewleitfaden", description: "Fachliche Fragen und Rückfragen passend zur ausgeschriebenen Aufgabe." },
  { value: "ai_outreach_draft", title: "Ansprache", description: "Eine kurze Gesprächseinladung auf Basis dieser Stelle." },
] as const;
const field = "mt-1 block min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

export function JobAssistants({ job }: { job: JobPosting }) {
  const [options, setOptions] = useState<AgentOptions | null>(null);
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [capability, setCapability] = useState<AgentCapability>("ai_job_ad");
  const [agentId, setAgentId] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [authorize, setAuthorize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const requestKey = useRef("");
  const submitting = useRef(false);
  const alive = useRef(true);
  const loadGeneration = useRef(0);
  const eligible = agents.filter(agent => agent.enabled && agent.capability === capability);
  const selected = eligible.find(agent => agent.id === agentId);
  const choice = choices.find(item => item.value === capability)!;
  const load = useCallback(async () => {
    const token = auth.getAccess();
    if (!token) return;
    const generation = ++loadGeneration.current;
    try {
      const [settings, registry, results] = await Promise.all([agentApi.options(token), agentApi.list(token), agentApi.runs(token, job.id)]);
      if (alive.current && generation === loadGeneration.current) {
        setOptions(settings); setAgents(registry); setRuns(results); setLoadError("");
      }
    } catch {
      if (alive.current && generation === loadGeneration.current) {
        setLoadError("Die Stellenassistenz konnte nicht geladen werden. Bitte erneut versuchen.");
      }
    }
  }, [job.id]);
  useEffect(() => {
    alive.current = true;
    const refresh = () => { void load(); };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { alive.current = false; loadGeneration.current += 1; clearInterval(timer); };
  }, [load]);

  async function action(work: (token: string) => Promise<unknown>, success: string) {
    const token = auth.getAccess();
    if (!token || submitting.current) return false;
    submitting.current = true; setBusy(true); setActionError(""); setMessage("");
    try { await work(token); await load(); setMessage(success); return true; }
    catch (e) { setActionError(e instanceof Error ? e.message : "Der Auftrag konnte nicht gespeichert werden."); return false; }
    finally { submitting.current = false; setBusy(false); }
  }
  async function assign(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !options?.ai_available || !authorize) return;
    requestKey.current ||= crypto.randomUUID();
    if (await action(token => agentApi.assign(token, selected, {
      job_id: job.id, reviewer_id: reviewer, title: `${choice.title}: ${job.title}`.slice(0, 300),
      instructions: "", authorize_ai: authorize, request_key: requestKey.current,
    }), "Entwurf beauftragt. Das Ergebnis erscheint hier zur Prüfung.")) {
      requestKey.current = ""; setAuthorize(false);
    }
  }

  return <section aria-label="KI-Stellenassistenz" className="min-w-0 space-y-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-slate-950">KI-Stellenassistenz</h2><p className="mt-1 max-w-2xl text-sm text-slate-700">Bereite den nächsten Recruiting-Schritt vor – mit Stellenbezug, offenen Fragen und Prüfung im Team.</p></div>
      <Link href="/dashboard/agents" className="inline-flex min-h-11 items-center text-sm font-medium text-blue-800 underline">Agenten verwalten</Link>
    </div>
    {loadError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{loadError} <button className="min-h-11 underline" onClick={() => { void load(); }}>Erneut laden</button></div>}
    {actionError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
    {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    <form onSubmit={assign} onChange={() => { requestKey.current = ""; }} className="space-y-4">
      <fieldset disabled={busy}>
        <legend className="mb-2 text-sm font-medium">Was möchtest du vorbereiten?</legend>
        <div className="grid gap-3 sm:grid-cols-3">{choices.map(item => <label key={item.value} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${capability === item.value ? "border-blue-600 bg-white ring-1 ring-blue-600" : "border-slate-200 bg-white"}`}>
          <input className="mt-1" type="radio" name="recruiting-assistant" value={item.value} checked={capability === item.value} onChange={() => { setCapability(item.value); setAgentId(""); setReviewer(""); setAuthorize(false); }} />
          <span><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-relaxed text-slate-600">{item.description}</span></span>
        </label>)}</div>
      </fieldset>
      {!options && !loadError && <p className="text-sm text-slate-600">Stellenassistenz wird geladen …</p>}
      {options && !options.ai_available && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Der KI-Dienst ist noch nicht betriebsbereit. Die Administration muss einen Dienst einrichten und für Agenten freigeben. Bestehende Entwürfe bleiben sichtbar.</p>}
      {options && eligible.length === 0 && <p className="text-sm text-slate-700">Für „{choice.title}“ ist noch kein aktiver Agent eingerichtet. {options.can_manage ? <Link className="font-medium text-blue-800 underline" href={`/dashboard/agents?capability=${capability}`}>Passenden Agenten anlegen</Link> : "Bitte die Firmenadministration um Einrichtung."}</p>}
      {eligible.length > 0 && <fieldset disabled={busy} className="space-y-4">
        <legend className="sr-only">Entwurf beauftragen</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="min-w-0 text-sm">Ausführender Assistent<select required className={field} value={agentId} onChange={e => { setAgentId(e.target.value); setReviewer(""); setAuthorize(false); }}><option value="">Bitte auswählen</option>{eligible.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
          <label className="min-w-0 text-sm">Ergebnisprüfung durch<select required className={field} value={reviewer} onChange={e => setReviewer(e.target.value)}><option value="">Bitte auswählen</option>{options?.members.filter(member => !selected?.four_eyes || member.id !== options.current_user_id).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        </div>
        {selected?.four_eyes && options?.members.every(member => member.id === options.current_user_id) && <p className="text-sm text-amber-900">Dieser Agent benötigt eine zweite HR-Person für die Ergebnisprüfung.</p>}
        <details className="text-sm text-slate-700"><summary className="min-h-11 cursor-pointer py-3 font-medium">Welche Daten werden verwendet?</summary><p>Übermittelt werden Stellentitel, Unternehmen, Beschreibung, Arbeitsort, Anforderungen und hinterlegte Gehaltsgrenzen. Bewerberprofile und Prüfhinweise sind nicht Teil dieses Auftrags. Im Entwurf kannst du den gespeicherten Eingabestand und Quellenzitate prüfen.</p></details>
        <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" required className="mt-1" checked={authorize} onChange={e => setAuthorize(e.target.checked)} />Ich gebe diese Stellenangaben für den eingerichteten KI-Dienst frei.</label>
        <Button type="submit" disabled={busy || !selected || !reviewer || !authorize || !options?.ai_available || job.publication_status === "archived"}>{busy ? "Wird beauftragt …" : "Entwurf vorbereiten"}</Button>
        <p className="text-xs text-slate-600">Der Entwurf wird zur Prüfung gespeichert. Veröffentlichung und Versand bleiben eigene Schritte.</p>
      </fieldset>}
    </form>
    {runs.length > 0 && <div role="region" aria-label="Entwürfe für diese Stelle" className="space-y-4"><h3 className="text-base font-semibold">Entwürfe und Prüfungen</h3>{runs.map(run => <AgentRunCard key={run.id} run={run} agentName={agents.find(agent => agent.id === run.agent_id)?.name} options={options} busy={busy} action={action} />)}</div>}
  </section>;
}
