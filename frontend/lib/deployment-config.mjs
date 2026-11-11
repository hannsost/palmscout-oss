/** Validate public, build-time configuration before Next emits browser bundles. */
export function publicOrigins(env = process.env) {
  const production = env.NODE_ENV === "production";
  const defaults = production
    ? ["https://api.example.com", "https://app.example.com"]
    : ["http://localhost:8000", "http://localhost:3000"];
  return Object.fromEntries(["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_URL"].map((key, index) => {
    const value = env[key] ?? defaults[index];
    let url;
    try { url = new URL(value); } catch { throw new Error(`${key} must be an absolute origin.`); }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== value || url.username || url.password
        || (production && (url.protocol !== "https:" || loopback))
        || (!production && url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
      throw new Error(`${key} must be an HTTPS origin without credentials, path, query or fragment; HTTP loopback is development-only.`);
    }
    return [key, value];
  }));
}

export function publicFlags(env = process.env) {
  return Object.fromEntries(["NEXT_PUBLIC_REGISTRATION_ENABLED", "NEXT_PUBLIC_EMAIL_ENABLED"].map(key => {
    const value = env[key] ?? (env.NODE_ENV === "production" ? "false" : "true");
    if (value !== "true" && value !== "false") throw new Error(`${key} must be true or false.`);
    return [key, value];
  }));
}
