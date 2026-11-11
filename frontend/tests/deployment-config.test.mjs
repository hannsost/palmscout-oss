import assert from "node:assert/strict";
import test from "node:test";
import { publicFlags, publicOrigins } from "../lib/deployment-config.mjs";

test("production defaults compile the two public HTTPS origins", () => {
  assert.deepEqual(publicOrigins({ NODE_ENV: "production" }), {
    NEXT_PUBLIC_API_URL: "https://api.example.com",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
  });
});

test("production rejects credentials, paths, missing values and unsafe transports for both origins", () => {
  for (const key of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_URL"]) {
    for (const value of ["", "/api", "//api.example.test", "http://api.example.test", "http://localhost:8000", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://user:password@api.example.test", "https://api.example.test/", "https://api.example.test/api", "https://api.example.test?x=1", "https://api.example.test#x", " https://api.example.test", "javascript:alert(1)"]) {
      assert.throws(() => publicOrigins({ NODE_ENV: "production", [key]: value }), new RegExp(key));
    }
  }
});

test("development allows explicit HTTP loopback but no cleartext remote endpoint", () => {
  assert.equal(publicOrigins({ NEXT_PUBLIC_API_URL: "http://127.0.0.1:8001" }).NEXT_PUBLIC_API_URL, "http://127.0.0.1:8001");
  assert.throws(() => publicOrigins({ NEXT_PUBLIC_API_URL: "http://api.example.test" }));
});

test("public registration and email stay closed unless deliberately enabled", () => {
  assert.deepEqual(publicFlags({ NODE_ENV: "production" }), {
    NEXT_PUBLIC_REGISTRATION_ENABLED: "false", NEXT_PUBLIC_EMAIL_ENABLED: "false",
  });
  assert.deepEqual(publicFlags({ NODE_ENV: "production", NEXT_PUBLIC_REGISTRATION_ENABLED: "true", NEXT_PUBLIC_EMAIL_ENABLED: "true" }), {
    NEXT_PUBLIC_REGISTRATION_ENABLED: "true", NEXT_PUBLIC_EMAIL_ENABLED: "true",
  });
  assert.equal(publicFlags({}).NEXT_PUBLIC_REGISTRATION_ENABLED, "true");
  assert.throws(() => publicFlags({ NEXT_PUBLIC_REGISTRATION_ENABLED: "yes" }));
  assert.throws(() => publicFlags({ NEXT_PUBLIC_EMAIL_ENABLED: "TRUE" }));
});
