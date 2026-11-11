/** Web-process health only; API, database and operator readiness have separate checks. */
export function GET() {
  return Response.json({ status: "ok", service: "palmscout-web" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
