import * as OTPAuth from "otpauth";
import { randomToken, sha256Hex } from "./util";

export function createTotpSecret(email: string, issuer = "Pulse Auth") {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTotp(secretBase32: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
  return delta !== null;
}

export async function mintRecoveryCodes(count = 8): Promise<{
  plain: string[];
  hashed: string[];
}> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomToken(5).slice(0, 10).toUpperCase();
    plain.push(code);
    hashed.push(await sha256Hex(code));
  }
  return { plain, hashed };
}

export async function consumeRecoveryCode(
  storedJson: string,
  presented: string,
): Promise<{ ok: boolean; remaining: string[] }> {
  const hashed = await sha256Hex(presented.trim().toUpperCase());
  const list = JSON.parse(storedJson) as string[];
  const idx = list.indexOf(hashed);
  if (idx === -1) return { ok: false, remaining: list };
  const remaining = [...list.slice(0, idx), ...list.slice(idx + 1)];
  return { ok: true, remaining };
}
