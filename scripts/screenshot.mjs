/**
 * Headless screenshot tool — development only, not part of the app.
 *
 * Drives the locally installed Chromium-based browser over the DevTools
 * protocol using Node's built-in WebSocket, so no browser-automation package
 * is added to the project. Signs in first, then captures an authenticated page.
 *
 * Usage: node scripts/screenshot.mjs <path> <out.png> [email] [password]
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BROWSER = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const BASE = "http://localhost:3000";
const PORT = 9333;

const [, , targetPath, outFile, email = "verifier@revenue.gov.in", password = "Verify@12345"] =
  process.argv;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sign in over HTTP and return the Auth.js session cookie. */
async function getSessionCookie() {
  const jar = new Map();
  const remember = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  remember(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  remember(loginRes);

  const name = [...jar.keys()].find((k) => k.includes("session-token"));
  if (!name) throw new Error("sign-in failed — no session cookie");
  return { name, value: jar.get(name) };
}

async function cdp(ws, method, params = {}, id = { n: 1 }) {
  const msgId = id.n++;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve) => {
    const onMessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === msgId) {
        ws.removeEventListener("message", onMessage);
        resolve(data.result);
      }
    };
    ws.addEventListener("message", onMessage);
  });
}

const profile = await mkdtemp(path.join(tmpdir(), "shot-"));
const cookie = await getSessionCookie();

const browser = spawn(BROWSER, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--force-device-scale-factor=2",
  "--window-size=1440,900",
  "about:blank",
], { stdio: "ignore" });

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(400);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error("browser did not expose a debugging target");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const id = { n: 1 };

  await cdp(ws, "Network.enable", {}, id);
  await cdp(ws, "Page.enable", {}, id);
  await cdp(ws, "Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, id);
  await cdp(ws, "Network.setCookie",
    { name: cookie.name, value: cookie.value, domain: "localhost", path: "/", httpOnly: true }, id);

  await cdp(ws, "Page.navigate", { url: `${BASE}${targetPath}` }, id);
  await new Promise((resolve) => {
    const onMessage = (event) => {
      if (JSON.parse(event.data).method === "Page.loadEventFired") {
        ws.removeEventListener("message", onMessage);
        resolve();
      }
    };
    ws.addEventListener("message", onMessage);
    setTimeout(resolve, 15000);
  });
  await sleep(2500); // fonts, charts

  const { data } = await cdp(ws, "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: true }, id);
  writeFileSync(outFile, Buffer.from(data, "base64"));
  console.log(`saved ${outFile}`);
  ws.close();
} finally {
  browser.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true });
}
