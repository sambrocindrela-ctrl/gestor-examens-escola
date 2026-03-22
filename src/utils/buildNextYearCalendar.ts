import { addDays, differenceInCalendarDays, parseISO } from "date-fns";

import type {
  ExamPlannerDocument,
  ExamPlannerSnapshot,
  AssignedPerPeriod,
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

function getDayOffsetWithinPeriod(period: Period, dateIso: string) {
  return differenceInCalendarDays(parseISO(dateIso), parseISO(period.startStr));
}

function buildTargetDate(period: Period, dayOffset: number) {
  return addDays(parseISO(period.startStr), dayOffset)
    .toISOString()
    .slice(0, 10);
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

      const dayOffset = getDayOffsetWithinPeriod(prevPeriod, dateIso);
      if (dayOffset < 0) continue;

      const targetDateIso = buildTargetDate(targetPeriod, dayOffset);

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
