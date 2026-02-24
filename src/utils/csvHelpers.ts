// Helpers comuns per importar CSV (assignatures, períodes, aules, etc.)

/**
 * Converteix un valor brut de cel·la a "yyyy-MM-dd" o undefined
 * Accepta formats:
 *   - "2025-11-21"
 *   - "21/11/2025"
 *   - "21-11-2025"
 */
export function parseDateFromCell(raw: any): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  const m2 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;

  return undefined;
}

/**
 * Normalitza un valor de quadrimestre a 1 | 2 | undefined
 * (accepta coses com "Q1", "1", "Quadrimestre 2", etc.)
 */
export function normalizeQuad(raw: any): 1 | 2 | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(String(raw).replace(/\D/g, ""));
  return n === 1 || n === 2 ? (n as 1 | 2) : undefined;
}

/**
 * Extreu l'any de curs acadèmic de cadenes com:
 *   - "2025-26"
 *   - "2025/26"
 *   - "Curs 2025-26"
 * o bé un "2025" directe.
 */
export function normalizeCursAny(raw: any): string | undefined {
  if (!raw && raw !== 0) return undefined;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})\s*[-/]/);
  if (m) return m[1];

  const y = s.match(/^\d{4}$/);
  if (y) return y[0];

  return undefined;
}

/**
 * Clau única per a una assignatura a partir de codi + sigles,
 * usada per fer merges sense duplicar.
 */
export function makeSubjectKey(codi: any, sigles: any): string {
  return `${String(codi || "").trim().toLowerCase()}||${String(
    sigles || ""
  )
    .trim()
    .toLowerCase()}`;
}

