import { addDays, parseISO } from "date-fns";

import type {
  ExamPlannerDocument,
  ExamPlannerSnapshot,
  AssignedMap,
  Period,
  Subject,
} from "../types/examPlanner";

function buildSubjectByCodi(subjects: Subject[]) {
  const map = new Map<string, Subject>();
  for (const s of subjects) {
    const key = s.codi.trim().toLowerCase();
    if (key) map.set(key, s);
  }
  return map;
}

function orderedPeriods(periods: Period[]) {
  return [...periods].sort((a, b) => a.id - b.id);
}

function getPeriodOrderIndex(periods: Period[], pid: number) {
  return orderedPeriods(periods).findIndex((p) => p.id === pid);
}

function parseCellKey(cellKey: string) {
  const [dateIso, slotIndexStr] = cellKey.split("|");
  return {
    dateIso,
    slotIndex: Number(slotIndexStr),
  };
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildValidExamDates(period: Period) {
  const out: string[] = [];
  const start = parseISO(period.startStr);
  const end = parseISO(period.endStr);
  const blackouts = new Set((period.blackouts ?? []).map((d) => d.trim()));

  let cursor = start;
  while (toIsoDate(cursor) <= period.endStr) {
    const iso = toIsoDate(cursor);
    if (!blackouts.has(iso)) {
      out.push(iso);
    }
    cursor = addDays(cursor, 1);
  }

  return out;
}

function getValidExamDayIndex(period: Period, dateIso: string) {
  const validDates = buildValidExamDates(period);
  return validDates.indexOf(dateIso);
}

function getValidExamDateByIndex(period: Period, index: number) {
  const validDates = buildValidExamDates(period);
  return index >= 0 && index < validDates.length ? validDates[index] : undefined;
}

export function buildNextYearCalendarFromTemplate(
  previous: ExamPlannerDocument,
  nextBase: ExamPlannerSnapshot
): ExamPlannerSnapshot {
  const result: ExamPlannerSnapshot = {
    subjects: nextBase.subjects,
    periods: nextBase.periods,
    activePid: nextBase.activePid,
    slotsPerPeriod: nextBase.slotsPerPeriod,
    assignedPerPeriod: {},
    roomsData: {},
    allowedPeriodsBySubject: nextBase.allowedPeriodsBySubject,
    hiddenSubjectIds: nextBase.hiddenSubjectIds,
  };

  const prevPeriodsOrdered = orderedPeriods(previous.periods);
  const nextPeriodsOrdered = orderedPeriods(nextBase.periods);

  const nextSubjectByCodi = buildSubjectByCodi(nextBase.subjects);

  for (const [pidStr, assignedMap] of Object.entries(previous.assignedPerPeriod)) {
    const prevPid = Number(pidStr);
    const prevPeriod = previous.periods.find((p) => p.id === prevPid);
    if (!prevPeriod) continue;

    const periodOrderIndex = getPeriodOrderIndex(prevPeriodsOrdered, prevPid);
    if (periodOrderIndex < 0) continue;

    const targetPeriod = nextPeriodsOrdered[periodOrderIndex];
    if (!targetPeriod) continue;

    const targetSlots = nextBase.slotsPerPeriod[targetPeriod.id] ?? [];

    for (const [cellKey, subjectIds] of Object.entries(assignedMap)) {
      const { dateIso, slotIndex } = parseCellKey(cellKey);

      if (slotIndex < 0 || slotIndex >= targetSlots.length) {
        continue;
      }
      
      const validDayIndex = getValidExamDayIndex(prevPeriod, dateIso);
      if (validDayIndex < 0) continue;

      const targetDateIso = getValidExamDateByIndex(targetPeriod, validDayIndex);
      if (!targetDateIso) continue;

      const targetCellKey = `${targetDateIso}|${slotIndex}`;

      for (const prevSubjectId of subjectIds) {
        const prevSubject = previous.subjects.find((s) => s.id === prevSubjectId);
        if (!prevSubject) continue;

        const codiKey = prevSubject.codi.trim().toLowerCase();
        if (!codiKey) continue;

        const nextSubject = nextSubjectByCodi.get(codiKey);
        if (!nextSubject) continue;

        const allowed = nextBase.allowedPeriodsBySubject[nextSubject.id];
        if (Array.isArray(allowed) && !allowed.includes(targetPeriod.id)) {
          continue;
        }

        const periodMap: AssignedMap = {
          ...(result.assignedPerPeriod[targetPeriod.id] ?? {}),
        };

        const currentList = periodMap[targetCellKey] ?? [];
        if (!currentList.includes(nextSubject.id)) {
          periodMap[targetCellKey] = [...currentList, nextSubject.id];
        }

        result.assignedPerPeriod[targetPeriod.id] = periodMap;
      }
    }
  }
  return result;
}
