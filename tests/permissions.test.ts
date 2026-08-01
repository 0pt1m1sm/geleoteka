import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_META,
  ROLE_DEFAULTS,
  isPermission,
  permissionForPath,
  resolveRolePermissions,
} from "@/lib/permissions";
import { filterNavForPermissions } from "@/lib/admin-nav";
import { adminNav } from "@/lib/admin-nav";

describe("permissionForPath", () => {
  it("maps each admin section to its permission", () => {
    expect(permissionForPath("/admin")).toBe("dashboard.view");
    expect(permissionForPath("/admin/warehouse")).toBe("warehouse.manage");
    expect(permissionForPath("/admin/warehouse/receiving")).toBe("warehouse.manage");
    expect(permissionForPath("/admin/crm/deals")).toBe("crm.manage");
    expect(permissionForPath("/admin/customers/abc123")).toBe("crm.manage");
    expect(permissionForPath("/admin/roles")).toBe("roles.manage");
    expect(permissionForPath("/admin/settings/integrations")).toBe("settings.manage");
    expect(permissionForPath("/admin/notifications/telegram")).toBe("notifications.view");
  });

  // A plain startsWith would hand /admin/warehouse-reports to the warehouse
  // worker; the boundary check is the whole point.
  it("matches on segment boundaries, not string prefixes", () => {
    expect(permissionForPath("/admin/warehouse-reports")).toBe("dashboard.view");
  });

  it("fails closed on an unmapped admin path", () => {
    expect(permissionForPath("/admin/something-new")).toBe("dashboard.view");
  });

  it("ignores paths outside the admin panel", () => {
    expect(permissionForPath("/cabinet/cars")).toBeNull();
    expect(permissionForPath("/")).toBeNull();
  });
});

describe("catalogue", () => {
  it("describes every permission it defines", () => {
    for (const p of PERMISSIONS) {
      expect(PERMISSION_META[p]?.label, p).toBeTruthy();
      expect(PERMISSION_META[p]?.detail, p).toBeTruthy();
    }
  });

  it("only grants permissions that exist", () => {
    for (const [role, granted] of Object.entries(ROLE_DEFAULTS)) {
      for (const p of granted) expect(isPermission(p), `${role}: ${p}`).toBe(true);
    }
  });
});

describe("defaults reproduce the access that was hardcoded", () => {
  it("keeps the warehouse worker on the warehouse alone", () => {
    const granted = new Set<string>(ROLE_DEFAULTS.WAREHOUSE_WORKER);
    expect(granted.has("warehouse.manage")).toBe(true);
    expect(granted.has("crm.manage")).toBe(false);
    expect(granted.has("dashboard.view")).toBe(false);
  });

  it("keeps settings, content and roles away from the manager", () => {
    const granted = new Set<string>(ROLE_DEFAULTS.MANAGER);
    expect(granted.has("crm.manage")).toBe(true);
    expect(granted.has("notifications.view")).toBe(true);
    expect(granted.has("notifications.manage")).toBe(false);
    expect(granted.has("users.manage")).toBe(true);
    expect(granted.has("settings.manage")).toBe(false);
    expect(granted.has("content.manage")).toBe(false);
    expect(granted.has("roles.manage")).toBe(false);
  });

  // The proxy admitted only MANAGER/ADMIN, so a master had no admin panel.
  it("leaves the master outside the admin panel", () => {
    expect(ROLE_DEFAULTS.MASTER).toEqual([]);
  });
});

describe("new permission defaults on previously saved roles", () => {
  it("inherits a newly introduced default only when no stored decision exists", () => {
    const legacyRows = [{ permission: "crm.manage", allowed: false }];
    const granted = resolveRolePermissions("MANAGER", legacyRows);
    expect(granted.has("crm.manage")).toBe(false);
    expect(granted.has("notifications.view")).toBe(true);

    const explicitlyDenied = resolveRolePermissions("MANAGER", [
      ...legacyRows,
      { permission: "notifications.view", allowed: false },
    ]);
    expect(explicitlyDenied.has("notifications.view")).toBe(false);
  });
});

describe("filterNavForPermissions", () => {
  it("gives an admin the whole nav", () => {
    expect(filterNavForPermissions(adminNav, null)).toHaveLength(adminNav.length);
  });

  it("leaves a warehouse worker the warehouse and nothing else", () => {
    const nav = filterNavForPermissions(adminNav, new Set(["warehouse.manage"]));
    const hrefs = nav.flatMap((e) => (e.kind === "link" ? [e.href] : e.items.map((i) => i.href)));
    expect(hrefs).toEqual(["/admin/warehouse"]);
  });

  it("drops a group once every item in it is denied", () => {
    const nav = filterNavForPermissions(adminNav, new Set(["crm.manage"]));
    expect(nav.every((e) => e.kind === "group" && e.label === "CRM")).toBe(true);
  });

  it("keeps a partly-allowed group with only the permitted items", () => {
    const nav = filterNavForPermissions(adminNav, new Set(["users.manage"]));
    const iam = nav.find((e) => e.kind === "group" && e.id === "admin-group-iam");
    expect(iam?.kind === "group" && iam.items.map((i) => i.href)).toEqual(["/admin/users"]);
  });
});
