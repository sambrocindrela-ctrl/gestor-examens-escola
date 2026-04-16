export const LEVEL_COLORS: Record<string, string> = {
  "1A": "#FFF9C4",
  "1B": "#FFEBEE",
  "2A": "#DCEDC8",
  "2B": "#E0F7FA",
  "3A": "#F5F5F5",
  "3B": "#C5CAE9",
  "4A": "#CBBEB5",
  "OPT": ""
};

const LEVEL_PRIORITY = ["1A", "1B", "2A", "2B", "3A", "3B"];

export function normalizeLevel(level?: string): string | undefined {
  if (!level) return undefined;
  const clean = level.trim().toUpperCase();
  return clean || undefined;
}

export function getSubjectLevelColor(level?: string): string | undefined {
  const normalized = normalizeLevel(level);
  if (!normalized) return undefined;

  const color = LEVEL_COLORS[normalized];
  return color || undefined;
}

/**
 * Devuelve el color de fondo que debe mandar en una franja/celda
 * según los niveles presentes.
 *
 * Reglas:
 * - 1A manda siempre
 * - 1B manda si no hay 1A
 * - 2A manda si no hay 1A/1B
 * - 2B manda si no hay anteriores
 * - 3A manda si no hay anteriores
 * - 3B manda si no hay anteriores
 * - 4A solo colorea si va solo
 * - OPT no colorea si va solo
 * - Si 4A u OPT van acompañados, manda el otro nivel
 */
export function getPrioritySlotColor(levels: Array<string | undefined>): string | undefined {
  const normalized = Array.from(
    new Set(
      levels
        .map(normalizeLevel)
        .filter((x): x is string => Boolean(x))
    )
  );

  if (normalized.length === 0) return undefined;

  for (const level of LEVEL_PRIORITY) {
    if (normalized.includes(level)) {
      return LEVEL_COLORS[level];
    }
  }

  if (normalized.length === 1 && normalized[0] === "4A") {
    return LEVEL_COLORS["4A"];
  }

  if (normalized.length === 1 && normalized[0] === "OPT") {
    return undefined;
  }

  if (normalized.includes("4A")) {
    const other = normalized.find((l) => l !== "4A");
    return other ? LEVEL_COLORS[other] : LEVEL_COLORS["4A"];
  }

  if (normalized.includes("OPT")) {
    const other = normalized.find((l) => l !== "OPT");
    return other ? LEVEL_COLORS[other] : undefined;
  }

  return undefined;
}
