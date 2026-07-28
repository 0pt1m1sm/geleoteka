import { describe, it, expect } from "vitest";

import { emailAttachmentHref } from "@/lib/email/attachment-url";

describe("emailAttachmentHref — provider selection", () => {
  it("routes an IMAP/canonical row (emailMessageId) through the new provider-neutral route", () => {
    const href = emailAttachmentHref({ emailMessageId: "em_123", resendEmailId: null }, "att-1");
    expect(href).toBe("/api/admin/email-messages/em_123/attachments/att-1");
  });

  it("routes a legacy Resend-only row through the old proxy", () => {
    const href = emailAttachmentHref(
      { emailMessageId: null, resendEmailId: "resend-uuid" },
      "att-1",
    );
    expect(href).toBe("/api/admin/inbox/attachments/att-1?email_id=resend-uuid");
  });

  it("prefers the canonical route when both ids are present", () => {
    const href = emailAttachmentHref(
      { emailMessageId: "em_9", resendEmailId: "resend-uuid" },
      "a",
    );
    expect(href).toContain("/api/admin/email-messages/em_9/");
    expect(href).not.toContain("email_id=");
  });

  it("returns null when neither locator is present (no link rendered)", () => {
    expect(emailAttachmentHref({}, "att-1")).toBeNull();
    expect(emailAttachmentHref({ emailMessageId: null, resendEmailId: null }, "att-1")).toBeNull();
  });

  it("encodes ids so they cannot break out of the URL", () => {
    const href = emailAttachmentHref({ emailMessageId: "a/b?c" }, "x y&z");
    expect(href).toBe("/api/admin/email-messages/a%2Fb%3Fc/attachments/x%20y%26z");
  });
});
