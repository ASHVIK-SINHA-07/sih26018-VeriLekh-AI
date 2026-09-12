import type { Role } from "@/types";

/**
 * The seeded accounts — SYNTHETIC, and public: this file is in a public
 * repository, so anyone can read these passwords. They exist for a local demo
 * only. `npm run seed` creates them; the sign-in page lists them only when
 * demo mode is on. Never run the seed, or turn demo mode on, on a deployment
 * reachable from the internet.
 */
export const DEMO_ACCOUNTS: { email: string; name: string; role: Role; password: string }[] = [
  { email: "admin@revenue.gov.in", name: "Sunita Rao", role: "ADMIN", password: "Admin@12345" },
  { email: "verifier@revenue.gov.in", name: "Rajesh Kumar", role: "VERIFIER", password: "Verify@12345" },
  { email: "viewer@revenue.gov.in", name: "Anil Deshpande", role: "VIEWER", password: "Viewer@12345" },
];

/** On only when `DEMO_MODE=true` is set explicitly. Off by default. */
export function demoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
