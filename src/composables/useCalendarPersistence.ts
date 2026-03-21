import { ref } from "vue";
import { remoteCalendarRepository } from "../services/remoteCalendarRepository";
import {
  buildPlannerDocumentFromSnapshot,
  buildSnapshotFromPlannerDocument,
} from "../utils/plannerSerialization";
import { useExamPlannerState } from "./useExamPlannerState";

export function useCalendarPersistence() {
  const {
    getSnapshot,
    applySnapshot,
  } = useExamPlannerState();

  const currentCalendarId = ref<string | null>(null);
  const isSaving = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function saveAsNewCalendar(name: string, academicYear?: string) {
    try {
      isSaving.value = true;
      error.value = null;

      const snapshot = getSnapshot();
      const document = buildPlannerDocumentFromSnapshot(snapshot);

      const saved = await remoteCalendarRepository.createCalendar({
        name,
        academicYear,
        document,
      });

      currentCalendarId.value = saved.id;

      return saved;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      isSaving.value = false;
    }
  }

  async function saveExistingCalendar(name?: string, academicYear?: string) {
    if (!currentCalendarId.value) {
      throw new Error("No hi ha cap calendari carregat");
    }

    try {
      isSaving.value = true;
      error.value = null;

      const snapshot = getSnapshot();
      const document = buildPlannerDocumentFromSnapshot(snapshot);

      const saved = await remoteCalendarRepository.updateCalendar({
        id: currentCalendarId.value,
        name,
        academicYear,
        document,
      });

      return saved;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      isSaving.value = false;
    }
  }

  async function loadCalendar(id: string) {
    try {
      isLoading.value = true;
      error.value = null;

      const saved = await remoteCalendarRepository.getCalendar(id);

      const snapshot = buildSnapshotFromPlannerDocument(saved.document);
      applySnapshot(snapshot);

      currentCalendarId.value = saved.id;

      return saved;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function listCalendars() {
    return remoteCalendarRepository.listCalendars();
  }

  async function deleteCalendar(id: string) {
    await remoteCalendarRepository.deleteCalendar(id);

    if (currentCalendarId.value === id) {
      currentCalendarId.value = null;
    }
  }

  async function duplicateCalendar(id: string, newName: string) {
    return remoteCalendarRepository.duplicateCalendar(id, newName);
  }

  return {
    currentCalendarId,
    isSaving,
    isLoading,
    error,

    saveAsNewCalendar,
    saveExistingCalendar,
    loadCalendar,
    listCalendars,
    deleteCalendar,
    duplicateCalendar,
  };
}
