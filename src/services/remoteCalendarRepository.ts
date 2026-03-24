import { supabase } from "../lib/supabase";
import type {
  CalendarRepository,
  CreateCalendarInput,
  UpdateCalendarInput,
} from "../types/repository";
import type { ExamPlannerDocument } from "../types/examPlanner";
import type { CalendarSummary, SavedCalendar } from "../types/savedCalendar";

type ExamCalendarsRow = {
  id: string;
  name: string;
  academic_year: string | null;
  titulacio: string | null;
  document_json: ExamPlannerDocument;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

function mapRowToSavedCalendar(row: ExamCalendarsRow): SavedCalendar {
  return {
    id: row.id,
    name: row.name,
    academicYear: row.academic_year ?? undefined,
    titulacio: row.titulacio ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    document: row.document_json,
  };
}

function mapRowToSummary(row: ExamCalendarsRow): CalendarSummary {
  return {
    id: row.id,
    name: row.name,
    academicYear: row.academic_year ?? undefined,
    titulacio: row.titulacio ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
  };
}

export const remoteCalendarRepository: CalendarRepository = {
    async renameCalendar(id: string, newName: string): Promise<SavedCalendar> {
    const { data, error } = await supabase
      .from("exam_calendars")
      .update({
        name: newName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, name, academic_year, titulacio, document_json, created_at, updated_at, created_by, updated_by")
      .single();

    if (error || !data) {
      throw new Error(
        `No s'ha pogut reanomenar el calendari: ${error?.message ?? "error desconegut"}`
      );
    }

    return mapRowToSavedCalendar(data as ExamCalendarsRow);
  },
  
  async listCalendars(titulacio?: string): Promise<CalendarSummary[]> {
    let query = supabase
      .from("exam_calendars")
      .select(
        "id, name, academic_year, titulacio, document_json, created_at, updated_at, created_by, updated_by"
      )
      .order("updated_at", { ascending: false });

    if (titulacio && titulacio.trim()) {
      query = query.eq("titulacio", titulacio.trim());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`No s'han pogut carregar els calendaris: ${error.message}`);
    }

    return (data ?? []).map((row) => mapRowToSummary(row as ExamCalendarsRow));
  },


  async getCalendar(id: string): Promise<SavedCalendar> {
    const { data, error } = await supabase
      .from("exam_calendars")
      .select("id, name, academic_year, titulacio, document_json, created_at, updated_at, created_by, updated_by")
      .eq("id", id)
      .single();

    if (error || !data) {
      throw new Error(`No s'ha pogut carregar el calendari: ${error?.message ?? "no trobat"}`);
    }

    return mapRowToSavedCalendar(data as ExamCalendarsRow);
  },

 async createCalendar(input: CreateCalendarInput): Promise<SavedCalendar> {
    const payload = {
      name: input.name,
      academic_year: input.academicYear ?? null,
      titulacio: input.titulacio ?? null,
      document_json: input.document,
    };

    const { data, error } = await supabase
      .from("exam_calendars")
      .insert(payload)
      .select(
        "id, name, academic_year, titulacio, document_json, created_at, updated_at, created_by, updated_by"
      )
      .single();

    if (error || !data) {
      throw new Error(
        `No s'ha pogut crear el calendari: ${error?.message ?? "error desconegut"}`
      );
    }

    return mapRowToSavedCalendar(data as ExamCalendarsRow);
  },

 async updateCalendar(input: UpdateCalendarInput): Promise<SavedCalendar> {
    const payload = {
      name: input.name,
      academic_year: input.academicYear ?? null,
      titulacio: input.titulacio ?? null,
      document_json: input.document,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("exam_calendars")
      .update(payload)
      .eq("id", input.id)
      .select(
        "id, name, academic_year, titulacio, document_json, created_at, updated_at, created_by, updated_by"
      )
      .single();

    if (error || !data) {
      throw new Error(
        `No s'ha pogut actualitzar el calendari: ${error?.message ?? "error desconegut"}`
      );
    }

    return mapRowToSavedCalendar(data as ExamCalendarsRow);
  },


  async deleteCalendar(id: string): Promise<void> {
    const { error } = await supabase
      .from("exam_calendars")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(`No s'ha pogut eliminar el calendari: ${error.message}`);
    }
  },

  async duplicateCalendar(id: string, newName: string): Promise<SavedCalendar> {
    const existing = await this.getCalendar(id);

    return this.createCalendar({
      name: newName,
      academicYear: existing.academicYear,
      titulacio: existing.titulacio,
      document: existing.document,
    });
  },

};
