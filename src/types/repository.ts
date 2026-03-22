import type { ExamPlannerDocument } from "./examPlanner";
import type { CalendarSummary, SavedCalendar } from "./savedCalendar";

export interface CreateCalendarInput {
  name: string;
  academicYear?: string;
  document: ExamPlannerDocument;
}

export interface UpdateCalendarInput {
  id: string;
  name?: string;
  academicYear?: string;
  document: ExamPlannerDocument;
}

export interface CalendarRepository {
  listCalendars(): Promise<CalendarSummary[]>;
  getCalendar(id: string): Promise<SavedCalendar>;
  createCalendar(input: CreateCalendarInput): Promise<SavedCalendar>;
  updateCalendar(input: UpdateCalendarInput): Promise<SavedCalendar>;
  deleteCalendar(id: string): Promise<void>;
  renameCalendar(id: string, newName: string): Promise<SavedCalendar>;
  duplicateCalendar(id: string, newName: string): Promise<SavedCalendar>;
}
