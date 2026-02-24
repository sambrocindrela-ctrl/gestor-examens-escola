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
}

export interface TimeSlot {
  start: string;
  end: string;
}

export type AssignedMap = Record<string, string[]>;     // "YYYY-MM-DD|slotIndex" → [subjectId,...]
export type AssignedPerPeriod = Record<number, AssignedMap>;
export type SlotsPerPeriod = Record<number, TimeSlot[]>;

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
