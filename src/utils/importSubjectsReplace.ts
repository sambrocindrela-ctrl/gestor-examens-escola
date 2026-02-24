import { parseDateFromCell, normalizeQuad, normalizeCursAny, makeSubjectKey } from "./csvHelpers";
import type {
  Subject,
  Period,
  TimeSlot,
  SlotsPerPeriod,
} from "../types/examPlanner";

/**
 * Processa les files del CSV d'assignatures+períodes (REPLACE)
 * i retorna les estructures necessàries per al planner.
 */
export function importSubjectsReplace(rows: any[]) {
  const subjByKey = new Map<string, Subject>();
  const periodsByKey = new Map<string, Set<number>>();
  const periodMap = new Map<number, Period>();
  const slotsMap: SlotsPerPeriod = {};
  const quadSeenPerPid = new Map<number, 1 | 2>();
  const cursSeenPerPid = new Map<number, number>();

  for (const r of rows) {
    const codi =
      r.codi ?? r.codigo ?? r.CODI ?? r.CODIGO ?? r.code ?? r["﻿codi"] ?? r["﻿CODI"];
    const sigles =
      r.sigles ?? r.SIGLES ?? r.siglas ?? r.SIGLAS;
    const nivell = (
      r.nivell ?? r.NIVELL ?? r.nivel ?? r.NIVEL
    )?.toString();

    const curs = normalizeCursAny(
      r.curs ?? r.CURS ?? r.curso ?? r.CURSO
    );
    const quadrimestre = normalizeQuad(
      r.quadrimestre ?? r.QUADRIMESTRE ?? r.quad ?? r.QUAD
    );

    const MET = r.MET ?? r.met;
    const MATT = r.MATT ?? r.matt;
    const MEE = r.MEE ?? r.mee;
    const MCYBERS = r.MCYBERS ?? r.mcybers;

    if (codi || sigles) {
      const k = makeSubjectKey(codi, sigles);
      if (!subjByKey.has(k)) {
        subjByKey.set(k, {
          id: String(codi || sigles),
          codi: String(codi || ""),
          sigles: String(sigles || ""),
          nivell: nivell || undefined,
          curs: curs || undefined,
          quadrimestre: quadrimestre,
          MET: MET ? String(MET) : undefined,
          MATT: MATT ? String(MATT) : undefined,
          MEE: MEE ? String(MEE) : undefined,
          MCYBERS: MCYBERS ? String(MCYBERS) : undefined,
        });
      } else {
        const existed = subjByKey.get(k)!;
        if (!existed.nivell && nivell) existed.nivell = nivell;
        if (!existed.curs && curs) existed.curs = curs;
        if (!existed.quadrimestre && quadrimestre)
          existed.quadrimestre = quadrimestre;
        if (!existed.MET && MET) existed.MET = String(MET);
        if (!existed.MATT && MATT) existed.MATT = String(MATT);
        if (!existed.MEE && MEE) existed.MEE = String(MEE);
        if (!existed.MCYBERS && MCYBERS)
          existed.MCYBERS = String(MCYBERS);
      }
    }

    const pidRaw =
      r.period_id ??
      r.PERIOD_ID ??
      r.PeriodId ??
      r.periode ??
      r.PERIODO ??
      r.PERIOD;
    const pid = pidRaw ? Number(pidRaw) : NaN;
    if (Number.isFinite(pid) && pid >= 1) {
      const k = makeSubjectKey(codi, sigles);
      if (k.trim() !== "||") {
        if (!periodsByKey.has(k))
          periodsByKey.set(k, new Set<number>());
        periodsByKey.get(k)!.add(pid);
      }
    }

    const tipusRaw = (
      r.period_tipus ??
      r.PERIOD_TIPUS ??
      r.tipo ??
      r.TIPO ??
      ""
    )
      .toString()
      .toUpperCase();
    const tipusNorm: Period["tipus"] =
      tipusRaw === "FINAL"
        ? "FINAL"
        : tipusRaw === "REAVALUACIO" ||
          tipusRaw === "REAVALUACIÓ" ||
          tipusRaw === "REAVALUACION"
          ? "REAVALUACIÓ"
          : "PARCIAL";

    const startStr =
      parseDateFromCell(
        r.period_inici ?? r.PERIOD_INICI ?? r.start
      ) || "";
    const endStr =
      parseDateFromCell(r.period_fi ?? r.PERIOD_FI ?? r.end) || "";

    const parseSlotsLocal = (raw: any): TimeSlot[] => {
      if (!raw) return [];
      return String(raw)
        .split(/[;,|]/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((pair) => {
          const mm = pair.match(
            /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/
          );
          if (!mm) return null;
          const [_, a, b] = mm;
          const pad = (h: string) =>
            h
              .split(":")
              .map((x) => x.padStart(2, "0"))
              .join(":");
          return { start: pad(a), end: pad(b) };
        })
        .filter(Boolean) as TimeSlot[];
    };

    const slots =
      parseSlotsLocal(
        r.period_slots ?? r.PERIOD_SLOTS ?? r.slots
      ) || [{ start: "08:00", end: "10:00" }];

    const blackouts = (() => {
      const raw =
        r.period_blackouts ??
        r.PERIOD_BLACKOUTS ??
        r.blackouts ??
        r.BLOCKED_DATES;
      if (!raw) return [];
      const toks = String(raw)
        .split(/[;,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const out: string[] = [];
      for (const t of toks) {
        const d = parseDateFromCell(t);
        if (d) out.push(d);
      }
      return Array.from(new Set(out)).sort();
    })();

    const periodCurs = normalizeCursAny(
      r.period_curs ?? r.PERIOD_CURS
    );
    const periodQuad = normalizeQuad(
      r.period_quad ?? r.PERIOD_QUAD
    );

    const filaCurs = normalizeCursAny(
      r.curs ?? r.CURS ?? r.curso ?? r.CURSO
    );
    const filaQuad = normalizeQuad(
      r.quadrimestre ??
      r.QUADRIMESTRE ??
      r.quad ??
      r.QUAD
    );

    if (Number.isFinite(pid)) {
      if (filaQuad) quadSeenPerPid.set(pid, filaQuad);
      if (filaCurs) cursSeenPerPid.set(pid, Number(filaCurs));
    }

    if (Number.isFinite(pid) && pid >= 1) {
      if (!periodMap.has(pid)) {
        periodMap.set(pid, {
          id: pid,
          label: `Període ${pid}`,
          tipus: tipusNorm,
          startStr,
          endStr,
          curs: periodCurs ? Number(periodCurs) : undefined,
          quad: periodQuad,
          blackouts,
        });
        slotsMap[pid] = slots;
      } else {
        const p = periodMap.get(pid)!;
        if (!p.curs && periodCurs)
          p.curs = Number(periodCurs);
        if (!p.quad && periodQuad) p.quad = periodQuad;
      }
    }
  }

  for (const [pid, p] of periodMap) {
    if (p.quad == null && quadSeenPerPid.has(pid))
      p.quad = quadSeenPerPid.get(pid)!;
    if (p.curs == null && cursSeenPerPid.has(pid))
      p.curs = cursSeenPerPid.get(pid)!;
  }

  const uniqueSubjects = Array.from(subjByKey.values());
  const nextAllowed: Record<string, number[]> = {};
  for (const s of uniqueSubjects) {
    const key = `${s.codi
      .trim()
      .toLowerCase()}||${s.sigles.trim().toLowerCase()}`;
    const set = periodsByKey.get(key);
    if (set && set.size)
      nextAllowed[s.id] = Array.from(set).sort(
        (a, b) => a - b
      );
  }

  const ordered = Array.from(periodMap.keys()).sort(
    (a, b) => a - b
  );
  const list = ordered.map((k) => periodMap.get(k)!);

  return {
    subjects: uniqueSubjects,
    periods: list,
    slotsPerPeriod: slotsMap,
    allowedPeriodsBySubject: nextAllowed,
  };
}
