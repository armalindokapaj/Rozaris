import { randomBytes } from "node:crypto";

/**
 * Opaque public locator for a `ProjectPublishTarget` — Multi-Channel
 * Publishing PRD §41/§45: "the `publicKey` identifies the published
 * viewer. It isn't an administrative credential." Deliberately NOT a
 * sequential/guessable id (unlike most of this app's cuid()-keyed rows,
 * which are fine to expose since none of them double as an auth secret) —
 * this one appears directly in a public embed iframe `src` and every
 * bootstrap/inventory request an anonymous browser makes, so it needs
 * real entropy even though it's not itself a secret (the actual access
 * control is `ProjectPublishTarget.status`/`allowedOrigins`/license dates,
 * checked server-side wherever this key resolves a target — not secrecy
 * of the key itself).
 *
 * `pub_` prefix only for human legibility in the admin Distribution UI
 * (PRD §32's own examples use "pub_xxxxx") — carries no meaning to the
 * resolver, which just does a `@unique` lookup.
 */
export function generatePublicKey(): string {
  return `pub_${randomBytes(18).toString("base64url")}`;
}
