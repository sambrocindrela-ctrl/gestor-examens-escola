// src/utils/importSubjectsMerge.ts
import { parseDateFromCell, normalizeCursAny, normalizeQuad } from "./csvHelpers";
import type {
  Subject,
  Period,
  SlotsPerPeriod,
  TipusPeriode,
} from "../types/examPlanner";

/**
 * Importa assignatures + períodes en mode MERGE.
 * Rep:
 *  - rows: files del CSV (ja parsejades amb Papa)
 *  - current: estat actual (subjects, periods, allowedPeriodsBySubject, slotsPerPeriod)
 *
 * Retorna:
 *  - nextSubjects, nextPeriods, nextAllowed, nextSlotsPerPeriod
 *  - counters: addedSubjects, updatedSubjects, addedPeriods
 */
export function importSubjectsMerge(
  rows: any[],
  current: {
    subjects: Subject[];
    periods: Period[];
    allowedPeriodsBySubject: Record<string, number[]>;
    slotsPerPeriod: SlotsPerPeriod;
    assignedPerPeriod: any;
    roomsData: any;
  }
) {
  const { subjects, periods, allowedPeriodsBySubject, slotsPerPeriod, assignedPerPeriod, roomsData } = current;

  // Índexos auxiliars actuals
  const subjById = new Map(subjects.map((s) => [s.id, s] as const));
  const subjKeyIndex = new Map<string, string>(); // codi -> subjectId
  for (const s of subjects) {
    const key = s.codi.trim().toLowerCase();
    subjKeyIndex.set(key, s.id);
  }

  const nextSubjects = [...subjects];
  const nextAllowed: Record<string, number[]> = { ...allowedPeriodsBySubject };
  const nextPeriods = [...periods];
  const nextSlotsPerPeriod: SlotsPerPeriod = JSON.parse(
    JSON.stringify(slotsPerPeriod)
  );

  let addedSubjects = 0;
  let updatedSubjects = 0;
  let addedPeriods = 0;

  for (const r of rows) {
    const codi = r.codi ?? r.codigo ?? r.CODI ?? r.CODIGO ?? r.code ?? r["\ufeffcodi"] ?? r["\ufeffCODI"];
    const sigles = r.sigles ?? r.SIGLES ?? r.siglas ?? r.SIGLAS;
    if (!codi && !sigles) continue;

    const k = (codi || "").trim().toLowerCase();

    const nivell = (r.nivell ?? r.NIVELL ?? r.nivel ?? r.NIVEL)?.toString();
    const curs = normalizeCursAny(r.curs ?? r.CURS ?? r.curso ?? r.CURSO);
    const quadrimestre = normalizeQuad(
      r.quadrimestre ?? r.QUADRIMESTRE ?? r.quad ?? r.QUAD
    );

    const MET = r.MET ?? r.met;
    const MATT = r.MATT ?? r.matt;
    const MEE = r.MEE ?? r.mee;
    const MCYBERS = r.MCYBERS ?? r.mcybers;

    // ---------- SUBJECTE ----------
    let subjectId = subjKeyIndex.get(k);
    if (!subjectId) {
      // Nou subjecte
      subjectId = String(codi || sigles);
      subjKeyIndex.set(k, subjectId);
      nextSubjects.push({
        id: subjectId,
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
      addedSubjects++;
    } else {
      // Subjecte existent → actualitzar segons CSV
      const s =
        subjById.get(subjectId) ||
        nextSubjects.find((x) => x.id === subjectId)!;

      let changed = false;

      // Update sigles if provided and different
      if (sigles && s.sigles !== sigles) {
        s.sigles = sigles;
        changed = true;
      }

      if (s.nivell !== (nivell || undefined)) {
        s.nivell = nivell || undefined;
        changed = true;
      }

      if (s.curs !== (curs || undefined)) {
        s.curs = curs || undefined;
        changed = true;
      }

      if (s.quadrimestre !== quadrimestre) {
        s.quadrimestre = quadrimestre;
        changed = true;
      }

      const METstr = MET ? String(MET) : undefined;
      if (s.MET !== METstr) {
        s.MET = METstr;
        changed = true;
      }

      const MATTstr = MATT ? String(MATT) : undefined;
      if (s.MATT !== MATTstr) {
        s.MATT = MATTstr;
        changed = true;
      }

      const MEEstr = MEE ? String(MEE) : undefined;
      if (s.MEE !== MEEstr) {
        s.MEE = MEEstr;
        changed = true;
      }

      const MCYBERSstr = MCYBERS ? String(MCYBERS) : undefined;
      if (s.MCYBERS !== MCYBERSstr) {
        s.MCYBERS = MCYBERSstr;
        changed = true;
      }

      if (changed) {
        updatedSubjects++;
      }
    }

    // ---------- PERÍODES / ALLOWED PER SUBJECTE ----------
    const pidRaw =
      r.period_id ??
      r.PERIOD_ID ??
      r.PeriodId ??
      r.periode ??
      r.PERIODO ??
      r.PERIOD;
    const pid = pidRaw ? Number(pidRaw) : NaN;


    if (Number.isFinite(pid) && pid >= 1) {
      const tipusRaw = (
        r.period_tipus ??
        r.PERIOD_TIPUS ??
        r.tipo ??
        r.TIPO ??
        ""
      )
        .toString()
        .toUpperCase();

      const tipus: TipusPeriode =
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
        parseDateFromCell(
          r.period_fi ?? r.PERIOD_FI ?? r.end
        ) || "";

      // Parse slots from CSV
      const parseSlotsLocal = (raw: any) => {
        if (!raw) return null;
        const parsed = String(raw)
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
          .filter((slot): slot is { start: string; end: string } => slot !== null);
        return parsed.length > 0 ? parsed : null;
      };

      const slotsFromCSV = parseSlotsLocal(
        r.period_slots ?? r.PERIOD_SLOTS ?? r.slots
      );

      const existingPeriod = nextPeriods.find((p) => p.id === pid);

      if (!existingPeriod) {
        // Add new period
        nextPeriods.push({
          id: pid,
          label: `Període ${pid}`,
          tipus,
          startStr,
          endStr,
          blackouts: [],
        });

        nextSlotsPerPeriod[pid] = slotsFromCSV || [{ start: "08:00", end: "10:00" }];
        addedPeriods++;
      } else {
        // Update existing period
        if (tipus && existingPeriod.tipus !== tipus) {
          existingPeriod.tipus = tipus;
        }
        if (startStr && existingPeriod.startStr !== startStr) {
          existingPeriod.startStr = startStr;
        }
        if (endStr && existingPeriod.endStr !== endStr) {
          existingPeriod.endStr = endStr;
        }

        // Update slots if provided in CSV
        if (slotsFromCSV && slotsFromCSV.length > 0) {
          nextSlotsPerPeriod[pid] = slotsFromCSV;
        }
      }

      const arr = new Set(nextAllowed[subjectId] ?? []);
      arr.add(pid);
      nextAllowed[subjectId] = Array.from(arr).sort(
        (a, b) => a - b
      );
    }
  }

  // Ordenem períodes pel seu id
  nextPeriods.sort((a, b) => a.id - b.id);

  // Remap assignments and rooms when slots change
  const nextAssignedPerPeriod = JSON.parse(JSON.stringify(assignedPerPeriod));
  const nextRoomsData = JSON.parse(JSON.stringify(roomsData));

  // For each period where slots changed, remap the assignments
  for (const [pidStr, newSlots] of Object.entries(nextSlotsPerPeriod)) {
    const pid = Number(pidStr);
    const oldSlots = slotsPerPeriod[pid];

    // Skip if no old slots or slots haven't changed
    if (!oldSlots || JSON.stringify(oldSlots) === JSON.stringify(newSlots)) {
      continue;
    }

    // Create mapping from old slot index to new slot index based on matching times
    const slotIndexMap = new Map<number, number>();
    for (let oldIdx = 0; oldIdx < oldSlots.length; oldIdx++) {
      const oldSlot = oldSlots[oldIdx];
      const newIdx = newSlots.findIndex(
        (s) => s.start === oldSlot.start && s.end === oldSlot.end
      );
      if (newIdx !== -1) {
        slotIndexMap.set(oldIdx, newIdx);
      }
    }

    // Remap assignments for this period
    if (nextAssignedPerPeriod[pid]) {
      const oldAssigned = { ...nextAssignedPerPeriod[pid] };
      nextAssignedPerPeriod[pid] = {};

      for (const [cellKey, subjectIds] of Object.entries(oldAssigned)) {
        const [dateIso, oldSlotIdxStr] = cellKey.split("|");
        const oldSlotIdx = Number(oldSlotIdxStr);
        const newSlotIdx = slotIndexMap.get(oldSlotIdx);

        if (newSlotIdx !== undefined) {
          const newCellKey = `${dateIso}|${newSlotIdx}`;
          nextAssignedPerPeriod[pid][newCellKey] = subjectIds;
        }
      }
    }

    // Remap rooms for this period
    if (nextRoomsData[pid]) {
      const oldRooms = { ...nextRoomsData[pid] };
      nextRoomsData[pid] = {};

      for (const [cellKey, roomsMap] of Object.entries(oldRooms)) {
        const [dateIso, oldSlotIdxStr] = cellKey.split("|");
        const oldSlotIdx = Number(oldSlotIdxStr);
        const newSlotIdx = slotIndexMap.get(oldSlotIdx);

        if (newSlotIdx !== undefined) {
          const newCellKey = `${dateIso}|${newSlotIdx}`;
          nextRoomsData[pid][newCellKey] = roomsMap;
        }
      }
    }
  }

  return {
    nextSubjects,
    nextPeriods,
    nextAllowed,
    nextSlotsPerPeriod,
    nextAssignedPerPeriod,
    nextRoomsData,
    addedSubjects,
    updatedSubjects,
    addedPeriods,
  };
}

