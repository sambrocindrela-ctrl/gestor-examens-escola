// Helpers comuns per importar CSV (assignatures, períodes, aules, etc.)

/**
 * Converteix un valor brut de cel·la a "yyyy-MM-dd" o undefined
 * Accepta formats:
 *   - "2025-11-21"
 *   - "21/11/2025"
 *   - "21-11-2025"
 */

export function parseDateFromCell(value: any): string | undefined {
  if (value == null || value === "") return undefined;

  // 1) Excel serial date (número)
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel epoch: 1899-12-30
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = value * 24 * 60 * 60 * 1000;
    const d = new Date(excelEpoch.getTime() + ms);
    return d.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return undefined;

  // 2) Si viene con hora, nos quedamos con la parte de fecha
  const datePart = raw.split(" ")[0].trim();

  // 3) yyyy-mm-dd o yyyy/mm/dd
  let m = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 4) d/m/yyyy, dd/mm/yyyy, d-m-yyyy, dd-mm-yyyy
  m = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 5) d/m/yy o dd/mm/yy → asumimos 20xx
  m = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (m) {
    const [, d, mo, yy] = m;
    const y = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // 6) Último intento con Date nativo, por si llega algo ISO raro
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

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

