import type {
  ExamPlannerDocument,
  ExamPlannerSnapshot,
} from "../types/examPlanner";

/**
 * Converteix una foto de l'estat actual del planner
 * en un document persistent i versionat.
 */
export function buildPlannerDocumentFromSnapshot(
  snapshot: ExamPlannerSnapshot
): ExamPlannerDocument {
  return {
    version: 1,
    subjects: snapshot.subjects,
    periods: snapshot.periods,
    activePid: snapshot.activePid,
    slotsPerPeriod: snapshot.slotsPerPeriod,
    assignedPerPeriod: snapshot.assignedPerPeriod,
    roomsData: snapshot.roomsData,
    allowedPeriodsBySubject: snapshot.allowedPeriodsBySubject,
    hiddenSubjectIds: snapshot.hiddenSubjectIds,
  };
}

/**
 * Extreu una foto d'estat usable pel planner a partir d'un document persistent.
 * També tolera parcialment dades antigues o incompletes.
 */
export function buildSnapshotFromPlannerDocument(
  document: Partial<ExamPlannerDocument>
): ExamPlannerSnapshot {
  return {
    subjects: Array.isArray(document.subjects) ? document.subjects : [],
    periods: Array.isArray(document.periods) ? document.periods : [],
    activePid: typeof document.activePid === "number" ? document.activePid : 1,
    slotsPerPeriod: document.slotsPerPeriod ?? {},
    assignedPerPeriod: document.assignedPerPeriod ?? {},
    roomsData: document.roomsData ?? {},
    allowedPeriodsBySubject: document.allowedPeriodsBySubject ?? {},
    hiddenSubjectIds: Array.isArray(document.hiddenSubjectIds)
      ? document.hiddenSubjectIds
      : [],
  };
}
