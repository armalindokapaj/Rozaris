import { randomBytes } from "node:crypto";

export function generatePublicKey(): string {
  return `pub_${randomBytes(18).toString("base64url")}`;
}
