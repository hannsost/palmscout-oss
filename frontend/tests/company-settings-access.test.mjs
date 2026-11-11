import assert from "node:assert/strict";
import test from "node:test";
import { companySettingsAccess } from "../lib/company-settings-access.mjs";

test("tenant owner can view/edit company; recruiter is read-only", () => {
  assert.deepEqual(companySettingsAccess({ role: "admin", tenant_id: "tenant" }), { read: true, edit: true });
  assert.deepEqual(companySettingsAccess({ role: "recruiter", tenant_id: "tenant" }), { read: true, edit: false });
});

test("platform admin and non-recruiting roles cannot enter company settings", () => {
  for (const user of [null, { role: "admin", tenant_id: null }, { role: "recruiter", tenant_id: null },
    { role: "worker", tenant_id: "tenant" }, { role: "candidate", tenant_id: "tenant" }]) {
    assert.deepEqual(companySettingsAccess(user), { read: false, edit: false });
  }
});
