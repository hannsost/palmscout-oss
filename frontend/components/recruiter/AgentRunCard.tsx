"use client";

import { useState } from "react";
import { agentApi, agentStates, sourceLabels, type AgentOptions, type AgentRun } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import { AgentRunDetails } from "./AgentRunDetails";

type Action = (work: (token: string) => Promise<unknown>, success: string) => Promise<boolean>;

export function AgentRunCard({ run, agentName, options, busy, action }: {
  run: AgentRun; agentName?: string; options: AgentOptions | null; busy: boolean; action: Action;
}) {
  const [note, setNote] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const draft = run.structured_output;
  async function copy() {
    try {
      await navigator.clipboard.writeText(run.output || "");
      setCopyMessage("Freigegebenen Entwurf kopiert.");
    } catch { setCopyMessage("Kopieren nicht möglich. Du kannst den Text markieren und manuell kopieren."); }
  }
  return <article id={`run-${run.id}`} className="min-w-0 space-y-3 rounded-xl border border-gray-200 bg-white p-5">
    <h3 className="break-words font-semibold">{run.source.task_title} · {agentStates[run.status] || run.status}</h3>
    <p className="text-sm text-gray-600">{agentName} · {run.source.title} · Versuch {run.attempts}/{run.max_attempts}</p>
    {run.source.instructions && <p className="whitespace-pre-wrap break-words text-sm">Prüfhinweise: {run.source.instructions}</p>}
    {run.output && <p className="text-xs font-medium text-gray-600">Ergebnis aus {run.output_origin === "ai" ? `KI · ${run.provider_model}` : run.output_origin === "rule" ? "Regelprüfung" : "Vorlage"}</p>}
    {draft ? <div className="space-y-4 rounded-lg bg-slate-50 p-4">
      <h4 className="break-words font-semibold">{draft.title}</h4>
      <p className="text-xs text-slate-600">KI-Entwurf auf Basis des gespeicherten Stellenstands. Quellenzitate wurden abgeglichen; Aussagen und fachliche Eignung bitte prüfen.</p>
      {draft.sections.map((section, index) => <section key={index} className="space-y-2">
        <h5 className="break-words text-sm font-semibold">{section.heading}</h5>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{section.body}</p>
        <details className="text-xs text-slate-600">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">Stellenbezug für „{section.heading}“</summary>
          <ul className="space-y-2 border-l-2 border-slate-300 pl-3">{section.evidence.map((evidence, i) => <li key={i} className="break-words"><span className="font-medium">{sourceLabels[evidence.field]}:</span> <q>{evidence.quote}</q></li>)}</ul>
        </details>
      </section>)}
      {draft.open_questions.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <h5 className="text-sm font-semibold">Noch zu klären</h5>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{draft.open_questions.map((question, i) => <li className="break-words" key={i}>{question}</li>)}</ul>
      </div>}
      {run.status === "approved" && <Button variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal py-2" onClick={copy}>Freigegebenen Entwurf kopieren</Button>}
      {copyMessage && <p role="status" className="text-sm">{copyMessage}</p>}
      {run.input_tokens !== null && run.output_tokens !== null && <p className="text-xs text-slate-600">Vom KI-Dienst gemeldet: {run.input_tokens} Eingabe- und {run.output_tokens} Ausgabetokens.</p>}
    </div> : run.output && <p className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-4 text-sm">{run.output}</p>}
    {["failed", "blocked"].includes(run.status) && <p className="text-sm text-amber-800">Der Auftrag konnte nicht abgeschlossen werden. Prüfe KI-Dienst, Agentenstatus, Zugänge und Stellenversion; anschließend kann ein neuer Auftrag angelegt werden.</p>}
    {run.status === "awaiting_review" && run.reviewer_id === options?.current_user_id && <div className="space-y-3">
      {draft && <p className="text-sm text-gray-700">Prüfe Stellenbezüge, Formulierungen und offene Fragen. Die Freigabe bestätigt den Entwurf; Veröffentlichung oder Versand erfolgen separat.</p>}
      <label className="block text-sm">Prüfvermerk<textarea maxLength={2000} className="mt-1 block min-h-20 w-full rounded-md border border-gray-300 px-3 py-2" value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || note.trim().length < 5} onClick={() => action(token => agentApi.review(token, run, "approve", note), "Ergebnis freigegeben; Aufgabe abgeschlossen.")}>Ergebnis freigeben</Button>
        <Button variant="outline" disabled={busy || note.trim().length < 5} onClick={() => action(token => agentApi.review(token, run, "reject", note), "Ergebnis verworfen.")}>Ergebnis verwerfen</Button>
      </div>
    </div>}
    {run.review_note && <p className="break-words text-sm text-gray-700">Prüfvermerk: {run.review_note}</p>}
    <AgentRunDetails run={run} members={options?.members || []} />
    {!["approved", "rejected", "cancelled"].includes(run.status) && (options?.can_manage || [run.delegated_by, run.reviewer_id].includes(options?.current_user_id || "")) && <Button variant="outline" disabled={busy} onClick={() => action(token => agentApi.cancel(token, run), "Auftrag abgebrochen.")}>Auftrag abbrechen</Button>}
  </article>;
}
