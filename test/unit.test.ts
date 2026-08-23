import { describe, expect, it } from "vitest";
import { can, permissionsFor, roleAtLeast } from "../src/lib/rbac";
import { hashPassword, verifyPassword, validatePassword } from "../src/lib/password";
import { createTotpSecret, verifyTotp } from "../src/lib/totp";
import * as OTPAuth from "otpauth";

describe("rbac", () => {
  it("grants owner all billing permissions", () => {
    expect(can("owner", "billing:manage")).toBe(true);
    expect(can("admin", "billing:manage")).toBe(false);
    expect(can("viewer", "org:read")).toBe(true);
  });

  it("orders roles", () => {
    expect(roleAtLeast("admin", "member")).toBe(true);
    expect(roleAtLeast("member", "admin")).toBe(false);
    expect(permissionsFor("member")).toContain("org:read");
  });
});

describe("password", () => {
  it("validates strength", () => {
    expect(validatePassword("short")).toBeTruthy();
    expect(validatePassword("allletters")).toBeTruthy();
    expect(validatePassword("CorrectHorse1")).toBeNull();
  });

  it("hashes and verifies", async () => {
    const hash = await hashPassword("CorrectHorse1");
    expect(hash.startsWith("pbkdf2$")).toBe(true);
    expect(await verifyPassword("CorrectHorse1", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("totp", () => {
  it("verifies current code", () => {
    const { secret } = createTotpSecret("dev@pulse.dev");
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    expect(verifyTotp(secret, totp.generate())).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });
});
