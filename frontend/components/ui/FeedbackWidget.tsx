"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ElementType, FormEvent } from "react";
import { Bug, Check, Lightbulb, MessageCircle, MessageSquare, Palette, X } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  feedbackApi,
  isFeedbackResponse,
  type FeedbackCategory,
  type FeedbackCreate,
  type FeedbackResponse,
} from "@/lib/api";

const CATEGORIES: { value: FeedbackCategory; label: string; icon: ElementType }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "feature", label: "Wunsch", icon: Lightbulb },
  { value: "ux", label: "UX/Design", icon: Palette },
  { value: "general", label: "Allgemein", icon: MessageCircle },
];

const MIN_MESSAGE_LENGTH = 5;
const MAX_MESSAGE_LENGTH = 2000;
const FEEDBACK_ERROR = "Das Feedback konnte nicht gesendet werden. Bitte versuche es erneut.";

type FeedbackDraft = {
  idempotencyKey: string;
  body: FeedbackCreate;
  userId: string | null;
};

function createDraft(category: FeedbackCategory, message: string, userId: string | null): FeedbackDraft {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Für das Feedback ist eine sichere Browser-ID erforderlich.");
  }

  return {
    idempotencyKey: crypto.randomUUID(),
    body: {
      category,
      message,
      page_url: window.location.pathname,
    },
    userId,
  };
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<FeedbackResponse | null>(null);

  const draftRef = useRef<FeedbackDraft | null>(null);
  const submitLockRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const authIdentityRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) triggerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }

    closeRef.current?.focus();
    wasOpenRef.current = true;
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  function markDraftChanged() {
    if (submitLockRef.current) return false;
    // An edit after a failed or completed request deliberately starts a new
    // logical draft and therefore receives a new idempotency key.
    draftRef.current = null;
    setError(null);
    setResponse(null);
    return true;
  }

  function clearUserState() {
    draftRef.current = null;
    setError(null);
    setResponse(null);
    setCategory("general");
    setMessage("");
  }

  function handleCategoryChange(nextCategory: FeedbackCategory) {
    if (nextCategory === category) return;
    if (!markDraftChanged()) return;
    setCategory(nextCategory);
  }

  function handleMessageChange(event: ChangeEvent<HTMLTextAreaElement>) {
    if (submitLockRef.current) return;
    if (event.target.value.trim() === message.trim()) {
      setMessage(event.target.value);
      return;
    }
    if (!markDraftChanged()) return;
    setMessage(event.target.value);
  }

  function handleNewFeedback() {
    if (submitLockRef.current) return;
    draftRef.current = null;
    setError(null);
    setResponse(null);
    setCategory("general");
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React may deliver two submit events before the disabled state renders.
    if (submitLockRef.current) return;

    const token = auth.getAccess();
    if (!token) {
      setAuthenticated(false);
      setError("Bitte melde dich an, um Feedback zu senden.");
      return;
    }

    const userId = auth.getUser()?.sub ?? null;
    if (draftRef.current && draftRef.current.userId !== userId) {
      clearUserState();
      setError("Das Konto wurde gewechselt. Bitte gib das Feedback erneut ein.");
      return;
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < MIN_MESSAGE_LENGTH || trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      setError(`Deine Rückmeldung muss zwischen ${MIN_MESSAGE_LENGTH} und ${MAX_MESSAGE_LENGTH} Zeichen enthalten.`);
      return;
    }

    let draft: FeedbackDraft;
    try {
      draft = draftRef.current ?? createDraft(category, trimmedMessage, userId);
    } catch {
      setError("Feedback kann in diesem Browser nicht sicher vorbereitet werden.");
      return;
    }

    submitLockRef.current = true;
    setSending(true);
    setError(null);
    draftRef.current = draft;

    try {
      const result = await feedbackApi.submit(draft.body, token, draft.idempotencyKey);
      if (!isFeedbackResponse(result)) {
        throw new Error("Die Rückmeldung wurde ohne gültige Referenz bestätigt.");
      }
      if (auth.getUser()?.sub !== draft.userId) {
        clearUserState();
        setAuthenticated(Boolean(auth.getAccess()));
        return;
      }
      setResponse(result);
    } catch {
      // Keep message, body, page path and idempotency key for an exact retry.
      setError(FEEDBACK_ERROR);
    } finally {
      submitLockRef.current = false;
      setSending(false);
    }
  }

  function toggleOpen() {
    if (!open) {
      const currentUserId = auth.getUser()?.sub ?? null;
      if (authIdentityRef.current !== undefined && authIdentityRef.current !== currentUserId) {
        clearUserState();
      }
      authIdentityRef.current = currentUserId;
      setAuthenticated(Boolean(auth.getAccess()));
    }
    setOpen((current) => !current);
  }

  const messageTooShort = message.trim().length < MIN_MESSAGE_LENGTH;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-40 flex h-11 w-11 items-center justify-center gap-1.5 rounded-full bg-blue-600 text-sm font-medium text-white shadow-lg transition-colors hover:bg-blue-700 sm:bottom-[4.5rem] sm:right-5 sm:h-auto sm:w-[7.5rem] sm:px-3 sm:py-2"
        aria-label="Feedback geben"
        aria-expanded={open}
        aria-controls="feedback-dialog"
      >
        <MessageSquare size={14} aria-hidden="true" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          id="feedback-dialog"
          role="dialog"
          aria-labelledby="feedback-dialog-title"
          className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] right-3 z-50 max-h-[min(70vh,32rem)] w-[calc(100vw-1.5rem)] max-w-80 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl sm:bottom-24 sm:right-5"
        >
          <div className="flex items-center justify-between bg-blue-600 px-4 py-3">
            <h2 id="feedback-dialog-title" className="text-sm font-semibold text-white">
              Feedback geben
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-blue-100 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Feedback schließen"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {authenticated === false ? (
            <div className="space-y-3 p-5">
              <p className="text-sm leading-6 text-gray-700">
                Bitte melde dich an, um Feedback zu senden. Ohne Anmeldung wird nichts übermittelt.
              </p>
              <a
                href="/login"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Anmelden
              </a>
            </div>
          ) : authenticated === null ? (
            <p className="p-5 text-sm text-gray-600" role="status">
              Anmeldung wird geprüft …
            </p>
          ) : response ? (
            <div className="space-y-4 p-6 text-center" role="status" aria-live="polite">
              <div className="flex justify-center">
                <div className="rounded-full bg-blue-100 p-3">
                  <Check size={20} className="text-blue-600" aria-hidden="true" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-gray-900">Dein Feedback wurde aufgenommen.</p>
                <p className="text-sm text-gray-600">
                  Referenz: <span className="font-semibold text-gray-900">{response.reference}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleNewFeedback}
                className="min-h-11 w-full rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Neue Rückmeldung
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 p-4">
              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm leading-5 text-red-700">
                  {error}
                </p>
              )}

              <fieldset disabled={sending}>
                <legend className="sr-only">Feedback-Kategorie</legend>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => handleCategoryChange(item.value)}
                        aria-pressed={category === item.value}
                        className={`flex min-h-11 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          category === item.value
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <Icon size={13} aria-hidden="true" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <label htmlFor="feedback-message" className="mb-1 block text-sm font-medium text-gray-700">
                  Deine Rückmeldung
                </label>
                <textarea
                  id="feedback-message"
                  value={message}
                  onChange={handleMessageChange}
                  placeholder="Was möchtest du uns mitteilen?"
                  rows={4}
                  minLength={MIN_MESSAGE_LENGTH}
                  maxLength={MAX_MESSAGE_LENGTH}
                  required
                  disabled={sending}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                />
                <p className="mt-1 text-right text-xs text-gray-500" aria-live="polite">
                  {message.length}/{MAX_MESSAGE_LENGTH}
                </p>
              </div>

              <button
                type="submit"
                disabled={sending || messageTooShort}
                className="min-h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Wird gesendet …" : error ? "Erneut versuchen" : "Senden"}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
