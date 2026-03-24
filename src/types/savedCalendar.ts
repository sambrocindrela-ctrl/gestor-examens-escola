import type { ExamPlannerDocument } from "./examPlanner";

export interface SavedCalendar {
  id: string;
  name: string;
  academicYear?: string;
  titulacio?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  document: ExamPlannerDocument;
}

export interface CalendarSummary {
  id: string;
  name: string;
  academicYear?: string;
  titulacio?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}
