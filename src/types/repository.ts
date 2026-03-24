import type { ExamPlannerDocument } from "./examPlanner";
import type { CalendarSummary, SavedCalendar } from "./savedCalendar";

export interface CreateCalendarInput {
  name: string;
  academicYear?: string;
  titulacio?: string;
  document: ExamPlannerDocument;
}

export interface UpdateCalendarInput {
  id: string;
  name?: string;
  academicYear?: string;
  titulacio?: string;
  document: ExamPlannerDocument;
}

export interface CalendarRepository {
  listCalendars(titulacio?: string): Promise<CalendarSummary[]>;
  getCalendar(id: string): Promise<SavedCalendar>;
  createCalendar(input: CreateCalendarInput): Promise<SavedCalendar>;
  updateCalendar(input: UpdateCalendarInput): Promise<SavedCalendar>;
  renameCalendar(id: string, newName: string): Promise<SavedCalendar>;
  deleteCalendar(id: string): Promise<void>;
  duplicateCalendar(id: string, newName: string): Promise<SavedCalendar>;
}
