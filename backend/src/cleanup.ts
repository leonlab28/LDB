import type { Env } from "./auth";

/**
 * Läuft per Cron (stündlich, siehe wrangler.jsonc). Unsichtbar ist Abgelaufenes schon vorher,
 * weil jede Abfrage auf expires_at filtert; hier wird es auch physisch gelöscht (D1 + R2).
 */
export async function cleanupExpired(env: Env): Promise<{ photos: number; notes: number }> {
  const now = Date.now();

  const expiredPhotos = await env.DB.prepare(
    "SELECT id, r2_key, thumb_r2_key FROM photos WHERE expires_at <= ? LIMIT 500",
  )
    .bind(now)
    .all<{ id: string; r2_key: string; thumb_r2_key: string | null }>();

  const keys = expiredPhotos.results.flatMap((p) => (p.thumb_r2_key ? [p.r2_key, p.thumb_r2_key] : [p.r2_key]));
  // R2 löscht bis zu 1000 Schlüssel pro Aufruf. Erst Dateien, dann Datensätze: bricht etwas ab, läuft es beim nächsten Mal erneut.
  for (let i = 0; i < keys.length; i += 1000) await env.MEDIA.delete(keys.slice(i, i + 1000));
  if (expiredPhotos.results.length) {
    const ids = expiredPhotos.results.map((p) => p.id);
    await env.DB.prepare(`DELETE FROM photos WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .run();
  }

  const notes = await env.DB.prepare("DELETE FROM notes WHERE expires_at <= ?").bind(now).run();

  return { photos: expiredPhotos.results.length, notes: notes.meta.changes ?? 0 };
}
