import { test, expect, type APIRequestContext, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { AgentRun, ManagedAgent } from "../lib/agents";

const api = "http://localhost:8001";
const captures = "/tmp/hireos-browser-tests/palmscout-recruiting-drafts";

async function fixture(page: Page, request: APIRequestContext, baseURL: string | undefined) {
  if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Local synthetic tests only");
  const marker = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `draft-qa-${marker}@example.com`;
  const password = "SyntheticOnly123!";
  const signup = await request.post(`${api}/auth/register`, { data: { email, password, full_name: "Entwurf QA" } });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await signup.json()).access_token}` };
  const company = await request.post(`${api}/companies/`, { headers, data: { name: `Entwurf QA ${marker}`, workspace_type: "internal_hr" } });
  expect(company.ok(), await company.text()).toBeTruthy();
  const vacancy = await request.post(`${api}/jobs/recruiter`, { headers, data: { title: "QA Engineer", company: "Synthetic QA", location: "Berlin", description: "Softwarequalität prüfen." } });
  expect(vacancy.ok(), await vacancy.text()).toBeTruthy();
  const job = await vacancy.json();
  const options = await (await request.get(`${api}/agents/options`, { headers })).json();
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  return { job, options, headers };
}

test("configure a new assistant from its vacancy and show provider readiness", async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const { job, options, headers } = await fixture(page, request, baseURL);
  // This fixture controls availability only, never pretends to run a model.
  await page.route(`${api}/agents/options`, route => route.fulfill({ json: { ...options, ai_available: false } }));
  await page.goto(`/dashboard/jobs/${job.id}`);
  const assistant = page.getByRole("region", { name: "KI-Stellenassistenz", exact: true });
  await expect(assistant.getByRole("heading", { name: "KI-Stellenassistenz", exact: true })).toBeVisible();
  await assistant.getByRole("radio", { name: /^Interviewleitfaden/ }).check();
  await assistant.getByRole("link", { name: "Passenden Agenten anlegen", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Fähigkeit", exact: true })).toHaveValue("ai_interview_kit");
  await page.getByLabel("Agentenname", { exact: true }).fill("Interviewassistenz QA");
  await page.getByRole("combobox", { name: "Verantwortliche Person", exact: true }).selectOption({ label: "Entwurf QA" });
  await page.getByLabel("Andere Person muss das Ergebnis prüfen", { exact: false }).uncheck();
  await page.getByLabel("Agent für neue Aufgaben aktivieren", { exact: true }).check();
  await page.getByRole("button", { name: "Agent speichern", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Agentenkonfiguration gespeichert.");
  const registry = await (await request.get(`${api}/agents`, { headers })).json();
  expect(registry[0]).toMatchObject({ capability: "ai_interview_kit", max_attempts: 1 });
  await page.goto(`/dashboard/jobs/${job.id}`);
  await assistant.getByRole("radio", { name: /^Interviewleitfaden/ }).check();
  await assistant.getByRole("combobox", { name: "Ausführender Assistent", exact: true }).selectOption({ label: "Interviewassistenz QA" });
  await assistant.getByRole("combobox", { name: "Ergebnisprüfung durch", exact: true }).selectOption({ label: "Entwurf QA" });
  await assistant.getByRole("checkbox").check();
  await expect(assistant.getByRole("button", { name: "Entwurf vorbereiten", exact: true })).toBeDisabled();
  await expect(assistant).toContainText("Der KI-Dienst ist noch nicht betriebsbereit.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  mkdirSync(captures, { recursive: true });
  await page.screenshot({ path: `${captures}/setup-mobile.png`, fullPage: true });
});

test("keep the latest review state and recover polling errors without hiding action errors", async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const { job, options } = await fixture(page, request, baseURL);
  const agent: ManagedAgent = {
    id: "11111111-1111-4111-8111-111111111111", version: 1, name: "Pollingassistenz QA",
    owner_id: options.current_user_id, enabled: true, capability: "ai_job_ad", daily_task_limit: 20, max_attempts: 1, four_eyes: false,
  };
  let run: AgentRun = {
    id: "22222222-2222-4222-8222-222222222222", agent_id: agent.id, task_id: "synthetic-task", job_id: job.id,
    delegated_by: options.current_user_id, reviewer_id: options.current_user_id, status: "awaiting_review", version: 2,
    source: { task_title: "Stellenanzeige zur Prüfung", title: job.title, company: job.company },
    output: "Synthetischer Entwurf", output_origin: "ai", provider_model: "synthetic-model", structured_output: null,
    review_note: null, reviewed_at: null, created_at: new Date().toISOString(), queue_status: "done", attempts: 1,
    max_attempts: 1, last_error_code: null, prompt_version: "recruiting-drafts-v1", input_tokens: 420, output_tokens: 180,
  };
  let runsMode: "live" | "hold" | "fail" = "live";
  let rejectReview = true;
  const delayed: { route: Route; snapshot: AgentRun }[] = [];
  const runsURL = `${api}/agents/runs?job_id=${job.id}`;
  await page.route(`${api}/agents/options`, route => route.fulfill({ json: { ...options, ai_available: true } }));
  await page.route(`${api}/agents`, route => route.fulfill({ json: [agent] }));
  await page.route(runsURL, route => {
    if (runsMode === "hold") { delayed.push({ route, snapshot: run }); return; }
    if (runsMode === "fail") return route.abort("failed");
    return route.fulfill({ json: [run] });
  });
  await page.route(`${api}/agents/runs/${run.id}/review`, route => {
    if (rejectReview) return route.fulfill({ status: 409, json: { detail: "Prüfung vorübergehend gesperrt." } });
    const data = route.request().postDataJSON();
    expect(data).toMatchObject({ expected_version: 2, decision: "approve" });
    run = { ...run, version: 3, status: "approved", review_note: data.note };
    return route.fulfill({ json: run });
  });
  await page.clock.install({ time: new Date("2026-09-18T12:00:00Z") });
  await page.goto(`/dashboard/jobs/${job.id}`);
  const assistant = page.getByRole("region", { name: "KI-Stellenassistenz", exact: true });
  const result = assistant.getByRole("article");
  const heading = result.getByRole("heading", { level: 3 });
  const loadAlert = assistant.getByRole("alert").filter({ hasText: "Die Stellenassistenz konnte nicht geladen werden." });
  const actionAlert = assistant.getByRole("alert").filter({ hasText: "Prüfung vorübergehend gesperrt." });
  await expect(heading).toContainText("Prüfung erforderlich");
  const initialPoll = page.waitForResponse(runsURL);
  await page.clock.pauseAt(new Date("2026-09-18T12:01:00Z"));
  await (await initialPoll).finished();

  await result.getByLabel("Prüfvermerk", { exact: true }).fill("Quellen und offene Angaben geprüft.");
  await result.getByRole("button", { name: "Ergebnis freigeben", exact: true }).click();
  await expect(actionAlert).toBeVisible();
  runsMode = "fail";
  await page.clock.runFor(5000);
  await expect(loadAlert).toBeVisible();
  runsMode = "live";
  await page.clock.runFor(5000);
  await expect(loadAlert).toHaveCount(0);
  await expect(actionAlert).toBeVisible();

  // A poll started before approval must not restore its older review state.
  runsMode = "hold";
  await page.clock.runFor(5000);
  await expect.poll(() => delayed.length).toBe(1);
  runsMode = "live";
  rejectReview = false;
  await result.getByRole("button", { name: "Ergebnis freigeben", exact: true }).click();
  await expect(heading).toContainText("Freigegeben");
  await expect(assistant.getByRole("status")).toHaveText("Ergebnis freigegeben; Aufgabe abgeschlossen.");
  const oldSuccess = page.waitForResponse(runsURL);
  await delayed[0].route.fulfill({ json: [delayed[0].snapshot] });
  await (await oldSuccess).finished();
  await page.clock.runFor(250);
  await expect(heading).toContainText("Freigegeben");
  await expect(result.getByRole("button", { name: "Ergebnis freigeben", exact: true })).toHaveCount(0);

  // A late failed poll must not add an error after a newer successful poll.
  runsMode = "hold";
  await page.clock.runFor(5000);
  await expect.poll(() => delayed.length).toBe(2);
  runsMode = "live";
  const freshPoll = page.waitForResponse(runsURL);
  await page.clock.runFor(5000);
  await (await freshPoll).finished();
  const oldFailure = page.waitForEvent("requestfailed", request => request.url() === runsURL);
  await delayed[1].route.abort("failed");
  await oldFailure;
  await page.clock.runFor(250);
  await expect(assistant.getByRole("alert")).toHaveCount(0);
  await expect(heading).toContainText("Freigegeben");
});

for (const capability of ["ai_job_ad", "ai_interview_kit", "ai_outreach_draft"] as const) {
  test(`prepare and review ${capability} with explicit synthetic model-boundary fixtures`, async ({ page, request, baseURL }) => {
    test.setTimeout(120_000);
    const { job, options, headers } = await fixture(page, request, baseURL);
    const names = { ai_job_ad: "Stellenanzeige", ai_interview_kit: "Interviewleitfaden", ai_outreach_draft: "Ansprache" };
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const agent: ManagedAgent = {
      id: "11111111-1111-4111-8111-111111111111", version: 1, name: "Recruitingassistenz QA",
      owner_id: options.current_user_id, enabled: true, capability, daily_task_limit: 20, max_attempts: 1, four_eyes: false,
    };
    let run: AgentRun | null = null;
    let assignments = 0;
    // API auth, company and vacancy are real local fixtures. These routes model
    // the AI boundary and persistence for UI acceptance. Backend tests exercise
    // the real provider adapter, database, queue and review independently.
    await page.route(`${api}/agents/options`, route => route.fulfill({ json: { ...options, ai_available: true, external_ai_enabled: true } }));
    await page.route(`${api}/agents`, route => route.fulfill({ json: [agent] }));
    await page.route(`${api}/agents/runs?*`, route => {
      expect(new URL(route.request().url()).searchParams.get("job_id")).toBe(job.id);
      return route.fulfill({ json: run ? [run] : [] });
    });
    await page.route(`${api}/agents/${agent.id}/tasks`, async route => {
      const data = route.request().postDataJSON();
      expect(data).toMatchObject({ job_id: job.id, reviewer_id: options.current_user_id, authorize_ai: true, expected_version: 1, instructions: "" });
      expect(data.request_key).toMatch(/^[0-9a-f-]{36}$/);
      assignments += 1;
      run = {
        id: "22222222-2222-4222-8222-222222222222", agent_id: agent.id, task_id: "synthetic-task", job_id: job.id,
        delegated_by: options.current_user_id, reviewer_id: options.current_user_id, status: "awaiting_review", version: 2,
        source: { task_title: data.title, title: job.title, company: job.company, description: job.description, location: job.location },
        output: "Freigegebener synthetischer Recruiting-Entwurf", output_origin: "ai", provider_model: "synthetic-model",
        review_note: null, reviewed_at: null, created_at: new Date().toISOString(), queue_status: "done", attempts: 1,
        max_attempts: 1, last_error_code: null, prompt_version: "recruiting-drafts-v1", input_tokens: 420, output_tokens: 180,
        structured_output: {
          title: `${names[capability]} für QA Engineer`,
          sections: [
            { heading: "Aufgabenbezug", body: "Wie gehst du bei der Prüfung von Softwarequalität vor?", evidence: [{ field: "description", quote: "Softwarequalität prüfen." }] },
            { heading: "Arbeitsort", body: "Die Tätigkeit ist in Berlin vorgesehen.", evidence: [{ field: "location", quote: "Berlin" }] },
          ],
          open_questions: ["Welche Arbeitszeit ist vorgesehen?"],
        },
      };
      await route.fulfill({ status: 201, json: run });
    });
    await page.route(`${api}/agents/runs/*/review`, async route => {
      const data = route.request().postDataJSON();
      expect(data).toMatchObject({ expected_version: 2, decision: "approve" });
      expect(data.note.length).toBeGreaterThan(5);
      run = { ...run!, version: 3, status: "approved", review_note: data.note, reviewed_at: new Date().toISOString() };
      await route.fulfill({ json: run });
    });
    await page.route(`${api}/agents/runs/*/events`, route => route.fulfill({ json: [
      { action: "assigned", actor_id: options.current_user_id, created_at: new Date().toISOString() },
      { action: "prepared", actor_id: null, created_at: new Date().toISOString() },
      { action: "approved", actor_id: options.current_user_id, created_at: new Date().toISOString() },
    ] }));
    await page.goto(`/dashboard/jobs/${job.id}`);
    const assistant = page.getByRole("region", { name: "KI-Stellenassistenz", exact: true });
    await assistant.getByRole("radio", { name: new RegExp(`^${names[capability]}`) }).check();
    await assistant.getByRole("combobox", { name: "Ausführender Assistent", exact: true }).selectOption(agent.id);
    await assistant.getByRole("combobox", { name: "Ergebnisprüfung durch", exact: true }).selectOption(options.current_user_id);
    await expect(assistant.getByRole("button", { name: "Entwurf vorbereiten", exact: true })).toBeDisabled();
    await assistant.getByRole("checkbox").check();
    await assistant.getByRole("button", { name: "Entwurf vorbereiten", exact: true }).dblclick();
    const result = assistant.getByRole("article");
    await expect(result.getByRole("heading", { level: 3 })).toContainText("Prüfung erforderlich");
    expect(assignments).toBe(1);
    await expect(result).toContainText("Welche Arbeitszeit ist vorgesehen?");
    await result.getByText("Stellenbezug für „Aufgabenbezug“", { exact: true }).click();
    await expect(result.locator("q").filter({ hasText: "Softwarequalität prüfen." })).toBeVisible();
    await expect(result.getByRole("button", { name: "Freigegebenen Entwurf kopieren", exact: true })).toHaveCount(0);
    mkdirSync(captures, { recursive: true });
    if (capability === "ai_interview_kit") {
      await page.screenshot({ path: `${captures}/interview-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await result.getByLabel("Prüfvermerk", { exact: true }).fill("Quellenbezüge, Aufgabenbezug und offene Angaben geprüft.");
    await result.getByRole("button", { name: "Ergebnis freigeben", exact: true }).click();
    await expect(result.getByRole("heading", { level: 3 })).toContainText("Freigegeben");
    await page.reload();
    await expect(result.getByRole("heading", { level: 3 })).toContainText("Freigegeben");
    await expect(result.getByRole("button", { name: "Freigegebenen Entwurf kopieren", exact: true })).toBeVisible();
    await result.getByText("Eingabestand und Verlauf", { exact: true }).click();
    await expect(result.getByRole("list", { name: "Auftragsverlauf", exact: true }).getByRole("listitem")).toHaveCount(3);
    if (capability === "ai_interview_kit") {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      const a11y = await new AxeBuilder({ page }).include('[aria-label="KI-Stellenassistenz"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(a11y.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
      await page.screenshot({ path: `${captures}/approved-mobile.png`, fullPage: true });
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
      await expect(result.getByRole("button", { name: "Freigegebenen Entwurf kopieren", exact: true })).toBeVisible();
      await page.screenshot({ path: `${captures}/approved-mobile-320.png`, fullPage: true });
    }
    const unchanged = await (await request.get(`${api}/jobs/recruiter/${job.id}`, { headers })).json();
    expect(unchanged).toMatchObject({ publication_status: "draft", description: "Softwarequalität prüfen." });
    expect(errors).toEqual([]);
  });
}
