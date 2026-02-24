<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import * as Papa from "papaparse";

import { useExamPlannerState } from "./composables/useExamPlannerState";
import { importSubjectsReplace } from "./utils/importSubjectsReplace";
import { importSubjectsMerge } from "./utils/importSubjectsMerge";
import { importRooms } from "./utils/importRooms";
import {
  exportPlannerJSON,
  exportPlannerCSV,
  exportPlannerTXT,
  exportPlannerExcel,
  exportPlannerWord,
} from "./utils/exporters";

import type { ImportedCalendarData } from "./utils/importExcelCalendar";
import type { Subject, AssignedMap } from "./types/examPlanner";

import PlannerToolbar from "./components/PlannerToolbar.vue";
import SubjectsTray from "./components/SubjectsTray.vue";
import ExamCalendarGrid from "./components/ExamCalendarGrid.vue";
import TrashBin from "./components/TrashBin.vue";

const {
  subjects,
  periods,
  activePid,
  activePeriod,
  slotsPerPeriod,
  assignedPerPeriod,
  roomsData,
  allowedPeriodsBySubject,
  hiddenSubjectIds,
  lastDeleted,
  
  addPeriod,
  removePeriod,
  deleteSubjectPermanently,
  undoDelete,
  saveStateToUrl,
  loadStateFromUrl,
  copyLinkToClipboard,
} = useExamPlannerState();

/* --- Admin Mode / Password Protection --- */

const ADMIN_PASSWORD = "admin2025";
const isAdminMode = ref(true);

// Load admin status from sessionStorage on mount
// Default is unlocked (true), only lock if explicitly set to false
onMounted(() => {
  const savedAdminStatus = sessionStorage.getItem("isAdminMode");
  if (savedAdminStatus === "false") {
    isAdminMode.value = false;
  }
  // Otherwise, keep default unlocked state (true)
});

function toggleAdminMode(password?: string) {
  if (!isAdminMode.value) {
    // Trying to unlock
    if (password === ADMIN_PASSWORD) {
      isAdminMode.value = true;
      sessionStorage.setItem("isAdminMode", "true");
      return true;
    } else {
      return false;
    }
  } else {
    // Locking
    isAdminMode.value = false;
    sessionStorage.removeItem("isAdminMode");
    return true;
  }
}

/* --- Computed Logic --- */

function cellKey(dateIso: string, slotIndex: number) {
  return `${dateIso}|${slotIndex}`;
}

// Assignatures ja utilitzades — NOMÉS en el període actiu
const usedIds = computed(() => {
  const amap = assignedPerPeriod.value[activePid.value] ?? {};
  const s = new Set<string>();
  for (const list of Object.values(amap)) {
    for (const id of list) s.add(id);
  }
  return s;
});

// Filtrat de la safata
const availableSubjects = computed(() => {
  const pcurs = activePeriod.value?.curs != null ? String(activePeriod.value.curs) : undefined;
  const pquad = activePeriod.value?.quad;
  const pid = activePid.value;

  return subjects.value
    .filter((s) => !usedIds.value.has(s.id))
    .filter((s) => !hiddenSubjectIds.value.includes(s.id))
    .filter((s) => (pcurs ? s.curs === pcurs : true))
    .filter((s) => {
      const allowed = allowedPeriodsBySubject.value[s.id];

      // Si el CSV ha definit explícitament en quins períodes pot anar
      if (Array.isArray(allowed)) {
        return allowed.includes(pid);
      }

      // Si no, filtre per quadrimestre
      return pquad ? s.quadrimestre === pquad : true;
    });
});

/* --- Handlers --- */

function handleRemoveOneFromCell(pid: number, dateIso: string, slotIndex: number, subjectId: string) {
  const key = cellKey(dateIso, slotIndex);
  const prevMap = assignedPerPeriod.value[pid] ?? {};
  const next = (prevMap[key] ?? []).filter((id) => id !== subjectId);
  
  const copy: AssignedMap = { ...prevMap };
  if (next.length) copy[key] = next;
  else delete copy[key];
  
  assignedPerPeriod.value = { ...assignedPerPeriod.value, [pid]: copy };
}

function handleUpdateCellList(pid: number, dateIso: string, slotIndex: number, newList: Subject[]) {
  const key = cellKey(dateIso, slotIndex);
  const prevMap = assignedPerPeriod.value[pid] ?? {};
  
  const copy: AssignedMap = { ...prevMap };
  if (newList.length) {
    copy[key] = newList.map(s => s.id);
  } else {
    delete copy[key];
  }
  
  assignedPerPeriod.value = { ...assignedPerPeriod.value, [pid]: copy };
}

/* --- Import/Export Wrappers --- */

const handleExportJSON = () =>
  exportPlannerJSON({
    periods: periods.value,
    slotsPerPeriod: slotsPerPeriod.value,
    assignedPerPeriod: assignedPerPeriod.value,
    subjects: subjects.value,
    roomsData: roomsData.value,
    allowedPeriodsBySubject: allowedPeriodsBySubject.value,
    hiddenSubjectIds: hiddenSubjectIds.value,
  });

const handleExportCSV = () =>
  exportPlannerCSV({
    periods: periods.value,
    slotsPerPeriod: slotsPerPeriod.value,
    assignedPerPeriod: assignedPerPeriod.value,
    subjects: subjects.value,
  });

const handleExportTXT = () =>
  exportPlannerTXT({
    periods: periods.value,
    slotsPerPeriod: slotsPerPeriod.value,
    assignedPerPeriod: assignedPerPeriod.value,
    subjects: subjects.value,
  });

const handleExportExcel = () =>
  exportPlannerExcel({
    periods: periods.value,
    slotsPerPeriod: slotsPerPeriod.value,
    assignedPerPeriod: assignedPerPeriod.value,
    subjects: subjects.value,
    roomsData: roomsData.value,
  });

const handleExportWord = () =>
  exportPlannerWord({
    periods: periods.value,
    slotsPerPeriod: slotsPerPeriod.value,
    assignedPerPeriod: assignedPerPeriod.value,
    subjects: subjects.value,
    roomsData: roomsData.value,
  });

function importJSON(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (Array.isArray(data.periods)) periods.value = data.periods;
      if (data.slotsPerPeriod) slotsPerPeriod.value = data.slotsPerPeriod;
      if (data.assignedPerPeriod) assignedPerPeriod.value = data.assignedPerPeriod;
      if (Array.isArray(data.subjects)) subjects.value = data.subjects;
      if (data.roomsData) roomsData.value = data.roomsData;
      if (data.allowedPeriodsBySubject)
        allowedPeriodsBySubject.value = data.allowedPeriodsBySubject;
      if (Array.isArray(data.hiddenSubjectIds))
        hiddenSubjectIds.value = data.hiddenSubjectIds;
      if (Array.isArray(data.periods) && data.periods.length)
        activePid.value = data.periods[0].id;
    } catch {
      alert("JSON no vàlid");
    }
  };
  reader.readAsText(f);
  input.value = "";
}

function handleImportCSV(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;

  Papa.parse(f, {
    header: true,
    skipEmptyLines: true,
    complete: (res: Papa.ParseResult<any>) => {
      try {
        const rows = (res.data as any[]).filter(Boolean);
        const {
          subjects: uniqueSubjects,
          periods: list,
          slotsPerPeriod: slotsMap,
          allowedPeriodsBySubject: nextAllowed,
        } = importSubjectsReplace(rows);

        subjects.value = uniqueSubjects;

        if (list.length > 0) {
          periods.value = list;
          slotsPerPeriod.value = slotsMap;
          assignedPerPeriod.value = {};
          roomsData.value = {};
          allowedPeriodsBySubject.value = nextAllowed;
          hiddenSubjectIds.value = [];
          activePid.value = list[0].id;
          alert(`Importades ${uniqueSubjects.length} assignatures i ${list.length} períodes del CSV.`);
        } else {
          allowedPeriodsBySubject.value = nextAllowed;
          hiddenSubjectIds.value = [];
          alert(`Importades ${uniqueSubjects.length} assignatures del CSV.`);
        }
      } catch (err) {
        console.error(err);
        alert("Error processant el CSV");
      }
    },
    error: () => alert("No s'ha pogut llegir el fitxer CSV"),
  });
  input.value = "";
}

function handleMergeSubjectsCSV(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;

  Papa.parse(f, {
    header: true,
    skipEmptyLines: true,
    complete: (res: Papa.ParseResult<any>) => {
      try {
        const rows = (res.data as any[]).filter(Boolean);
        const {
          nextSubjects,
          nextPeriods,
          nextAllowed,
          nextSlotsPerPeriod,
          nextAssignedPerPeriod,
          nextRoomsData,
          addedSubjects,
          updatedSubjects,
          addedPeriods,
        } = importSubjectsMerge(rows, {
          subjects: subjects.value,
          periods: periods.value,
          allowedPeriodsBySubject: allowedPeriodsBySubject.value,
          slotsPerPeriod: slotsPerPeriod.value,
          assignedPerPeriod: assignedPerPeriod.value,
          roomsData: roomsData.value,
        });

        subjects.value = nextSubjects;
        allowedPeriodsBySubject.value = nextAllowed;
        periods.value = nextPeriods;
        slotsPerPeriod.value = nextSlotsPerPeriod;
        assignedPerPeriod.value = nextAssignedPerPeriod;
        roomsData.value = nextRoomsData;

        alert(`Afegides ${addedSubjects} assignatures (actualitzades ${updatedSubjects}). Nous períodes: ${addedPeriods}.`);
      } catch (err) {
        console.error(err);
        alert("Error processant el CSV (merge).");
      }
    },
    error: () => alert("No s'ha pogut llegir el fitxer CSV (merge)"),
  });
  input.value = "";
}

function handleImportRoomsCSV(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const f = input.files?.[0];
  if (!f) return;

  Papa.parse(f, {
    header: true,
    skipEmptyLines: "greedy",
    complete: (res: Papa.ParseResult<any>) => {
      try {
        const rows = (res.data as any[]).filter(Boolean);
        const { nextRooms, attached, skipped } = importRooms(rows, {
          subjects: subjects.value,
          periods: periods.value,
          roomsData: roomsData.value,
          slotsPerPeriod: slotsPerPeriod.value,
        });

        // Force reactivity by using nextTick
        roomsData.value = JSON.parse(JSON.stringify(nextRooms));
        // Force a re-render by toggling the active period
        const currentPid = activePid.value;
        activePid.value = -1;
        setTimeout(() => {
          activePid.value = currentPid;
          alert(`Aules/Matrículats processats. Afegits: ${attached}. Omesos: ${skipped}.`);
        }, 0);
      } catch (err) {
        console.error("Error importing rooms CSV:", err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        alert(`Error processant el CSV d'aules/matriculats:\n\n${errorMsg}\n\nMira la consola del navegador per més detalls.`);
      } finally {
        input.value = "";
      }
    },
    error: () => {
      alert("No s'ha pogut llegir el fitxer CSV d’aules/matriculats");
      input.value = "";
    },
  });
}

function handleImportExcelCalendar(data: ImportedCalendarData) {
  periods.value = data.periods;
  slotsPerPeriod.value = data.slotsPerPeriod;
  assignedPerPeriod.value = data.assignedPerPeriod;
  roomsData.value = data.roomsData;

  // Update subjects with potentially new ones created during import
  if (data.subjects) {
    subjects.value = data.subjects;
  }

  if (data.periods.length > 0) {
    activePid.value = data.periods[0].id;
  }
}
</script>

<template>
  <div class="flex flex-col h-screen font-sans text-gray-900">
    <!-- Header Section (Fixed) -->
    <div class="flex-shrink-0 p-6 border-b bg-white">
      <h1 class="text-2xl font-bold mb-2">
        Planificador d'exàmens — períodes amb curs/quadrimestre
      </h1>
      <p class="text-sm mb-6">
        CSV esperat (assignatures/períodes):
        <code class="bg-gray-100 px-1 rounded">
          codi,sigles,nivell,curs,quadrimestre,period_id,period_tipus,period_inici,period_fi,period_slots,period_blackouts
        </code>
        . Opcional: <code class="bg-gray-100 px-1 rounded">MET,MATT,MEE,MCYBERS</code>.
      </p>

      <PlannerToolbar
        :availableSubjects="availableSubjects"
        :subjects="subjects"
        :lastDeleted="lastDeleted"
        :periods="periods"
        :activePid="activePid"
        :isAdminMode="isAdminMode"
        @undo-delete="undoDelete"
        @set-last-deleted="(val) => (lastDeleted = val)"
        @set-active-pid="(id) => (activePid = id)"
        @add-period="addPeriod"
        @remove-period="removePeriod"
        @import-csv="handleImportCSV"
        @merge-subjects-csv="handleMergeSubjectsCSV"
        @import-rooms-csv="handleImportRoomsCSV"
        @import-calendar-data="handleImportExcelCalendar"
        @export-csv="handleExportCSV"
        @export-txt="handleExportTXT"
        @export-excel="handleExportExcel"
        @export-word="handleExportWord"
        @export-json="handleExportJSON"
        @import-json="importJSON"
        @save-state="saveStateToUrl"
        @load-state="loadStateFromUrl"
        @copy-link="copyLinkToClipboard"
        @toggle-admin-mode="toggleAdminMode"
      />


      <!-- Configuració del període actiu (informació compacta) -->
      <div v-if="activePeriod" class="p-4 rounded-2xl border shadow-sm bg-white mt-6">
        <div class="flex flex-wrap items-center gap-6 text-lg">
          <!-- Period info -->
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-700">Període:</span>
            <span class="px-3 py-1 bg-blue-50 rounded-full font-medium">
              {{ activePeriod.tipus }} {{ activePeriod.curs || '—' }}-{{ activePeriod.quad || '—' }}
            </span>
          </div>

          <!-- Time slots info -->
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-700">Franges horàries:</span>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(s, i) in (slotsPerPeriod[activePid] ?? [])"
                :key="i"
                class="px-2 py-1 bg-gray-100 rounded text-sm font-mono"
              >
                {{ s.start }}–{{ s.end }}
              </span>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Two-Column Layout with Independent Scrolling -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Column: Subjects Tray -->
      <div class="w-1/3 border-r bg-gray-50 overflow-y-auto p-6">
        <SubjectsTray
          :availableSubjects="availableSubjects"
          :subjects="subjects"
          :hiddenSubjectIds="hiddenSubjectIds"
          @update:hiddenSubjectIds="(val) => (hiddenSubjectIds = val)"
        />
      </div>

      <!-- Right Column: Calendar -->
      <div class="flex-1 overflow-y-auto p-6 bg-white">
        <ExamCalendarGrid
          v-if="activePeriod"
          :activePeriod="activePeriod"
          :activePid="activePid"
          :slotsPerPeriod="slotsPerPeriod"
          :assignedPerPeriod="assignedPerPeriod"
          :subjects="subjects"
          :roomsData="roomsData"
          @remove-one-from-cell="handleRemoveOneFromCell"
          @update-cell-list="handleUpdateCellList"
        />
      </div>
    </div>

    <!-- Trash Bin (Fixed at bottom-right) -->
    <TrashBin @delete="deleteSubjectPermanently" />
  </div>
</template>