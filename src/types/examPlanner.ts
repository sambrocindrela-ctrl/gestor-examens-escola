export type TipusPeriode = "PARCIAL" | "FINAL" | "REAVALUACIÓ";

export interface Period {
  id: number;
  label: string;
  tipus: TipusPeriode;
  startStr: string; // "yyyy-MM-dd"
  endStr: string;   // "yyyy-MM-dd"
  curs?: number;
  quad?: 1 | 2;
  blackouts?: string[];
}

export interface Subject {
  id: string;
  codi: string;
  sigles: string;
  nivell?: string;
  curs?: string;
  quadrimestre?: 1 | 2;
  MET?: string;
  MATT?: string;
  MEE?: string;
  MCYBERS?: string;
  displayName?: string;
  displayItalic?: boolean;
  displayFontColor?: string;
  displayFillColor?: string;
  displayLanguage?: "ca" | "en";
}

export interface TimeSlot {
  start: string;
  end: string;
}

export type AssignedMap = Record<string, string[]>; // "YYYY-MM-DD|slotIndex" → [subjectId,...]
export type AssignedPerPeriod = Record<number, AssignedMap>;
export type SlotsPerPeriod = Record<number, TimeSlot[]>;

export type UnscheduledBucket = "pending" | "no_exam" | "clipboard";

/** subjectId → bucket, per període */
export type UnscheduledBucketMap = Record<string, UnscheduledBucket>;

/** pid → (subjectId → bucket) */
export type UnscheduledBucketByPeriod = Record<number, UnscheduledBucketMap>;


/** Informació d’aules i estudiants per cel·la i assignatura */
export type RoomsEnroll = {
  rooms: string[];
  students?: number;
};

export type RoomsMapPerCell = Record<string, RoomsEnroll>;

export type RoomsDataPerPeriod = Record<
  number,
  Record<string, RoomsMapPerCell>
>;

/**
 * Foto del contingut persistent del planificador.
 * No inclou estat temporal d'UI (modals, hover, últim delete, etc.).
 */
export interface ExamPlannerSnapshot {
  subjects: Subject[];
  periods: Period[];
  activePid: number;
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  roomsData: RoomsDataPerPeriod;
  allowedPeriodsBySubject: Record<string, number[]>;
  hiddenSubjectIds: string[];
  unscheduledBucketByPeriod: UnscheduledBucketByPeriod;
}

/**
 * Document persistent i versionat per guardar en URL, JSON o backend remot.
 */
export interface ExamPlannerDocument extends ExamPlannerSnapshot {
  version: 1;
}
