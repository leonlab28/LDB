import { authenticate, registerDevice, type Caller, type Env } from "./auth";
import { cleanupExpired } from "./cleanup";
import * as f from "./features";
import { HttpError, json } from "./util";

type Handler = (req: Request, env: Env, c: Caller, params: string[], url: URL) => Promise<Response>;

const ID = "([0-9a-f-]{36})";

// [Methode, Pfad-Regex, Handler]. Alle Routen außer /health und /register brauchen einen Geräteschlüssel.
const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/v1\/me$/, (_r, e, c) => f.getMe(e, c)],
  ["GET", /^\/v1\/partner$/, (_r, e, c) => f.getPartner(e, c)],
  ["PUT", /^\/v1\/me\/profile$/, (r, e, c) => f.putProfile(r, e, c)],
  ["PUT", /^\/v1\/me\/traffic-light$/, (r, e, c) => f.putTrafficLight(r, e, c)],
  ["PUT", /^\/v1\/me\/location$/, (r, e, c) => f.putLocation(r, e, c)],

  ["PUT", /^\/v1\/me\/voice$/, (r, e, c) => f.putVoice(r, e, c)],
  ["DELETE", /^\/v1\/me\/voice$/, (_r, e, c) => f.deleteVoice(e, c)],
  ["GET", /^\/v1\/partner\/voice$/, (_r, e, c) => f.getPartnerVoice(e, c)],
  ["POST", /^\/v1\/partner\/voice\/listened$/, (_r, e, c) => f.markVoiceListened(e, c)],

  ["POST", /^\/v1\/me\/photos$/, (r, e, c) => f.postPhoto(r, e, c)],
  ["DELETE", new RegExp(`^/v1/me/photos/${ID}$`), (_r, e, c, p) => f.deletePhoto(e, c, p[0])],
  ["GET", new RegExp(`^/v1/partner/photos/${ID}$`), (_r, e, c, p, u) => f.getPartnerPhoto(e, c, p[0], u)],
  ["POST", new RegExp(`^/v1/partner/photos/${ID}/seen$`), (_r, e, c, p) => f.markPhoto(e, c, p[0], "seen_at")],
  ["POST", new RegExp(`^/v1/partner/photos/${ID}/keep$`), (_r, e, c, p) => f.markPhoto(e, c, p[0], "kept_at")],

  ["POST", /^\/v1\/me\/notes$/, (r, e, c) => f.postNote(r, e, c)],
  ["PUT", new RegExp(`^/v1/me/notes/${ID}$`), (r, e, c, p) => f.putNote(r, e, c, p[0])],
  ["DELETE", new RegExp(`^/v1/me/notes/${ID}$`), (_r, e, c, p) => f.deleteNote(e, c, p[0])],
  ["POST", new RegExp(`^/v1/partner/notes/${ID}/seen$`), (_r, e, c, p) => f.markNoteSeen(e, c, p[0])],
];

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/v1/health") {
    const db = await env.DB.prepare("SELECT COUNT(*) AS n FROM persons").first<{ n: number }>();
    return json({ ok: true, persons: db?.n ?? 0, registration_open: env.REGISTRATION_OPEN === "true" });
  }
  if (req.method === "POST" && url.pathname === "/v1/devices/register") return registerDevice(req, env);

  let pathMatched = false;
  for (const [method, pattern, handler] of routes) {
    const m = pattern.exec(url.pathname);
    if (!m) continue;
    pathMatched = true;
    if (method !== req.method) continue;
    const caller = await authenticate(req, env);
    return handler(req, env, caller, m.slice(1), url);
  }
  throw new HttpError(pathMatched ? 405 : 404, pathMatched ? "Methode nicht erlaubt" : "Nicht gefunden");
}

export default {
  async fetch(req, env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "Interner Fehler" }, 500);
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      cleanupExpired(env).then((r) => console.log(`Aufgeräumt: ${r.photos} Fotos, ${r.notes} Notizen`)),
    );
  },
} satisfies ExportedHandler<Env>;
