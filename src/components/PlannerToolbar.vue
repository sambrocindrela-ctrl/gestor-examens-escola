<script setup lang="ts">
import { ref } from "vue";
import type { Subject, Period } from "../types/examPlanner";
import { importExcelCalendar, type ImportedCalendarData } from "../utils/importExcelCalendar";

const props = defineProps<{
  availableSubjects: Subject[];
  subjects: Subject[];
  lastDeleted: { subject: Subject } | null;
  periods: Period[];
  activePid: number;
  isAdminMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'undo-delete'): void;
  (e: 'set-last-deleted', val: any): void;
  (e: 'set-active-pid', id: number): void;
  (e: 'add-period'): void;
  (e: 'remove-period', pid: number): void;

  // Import/Export events
  (e: 'import-csv', event: Event): void;
  (e: 'merge-subjects-csv', event: Event): void;
  (e: 'import-rooms-csv', event: Event): void;
  (e: 'import-json', event: Event): void;
  (e: 'import-calendar-data', data: ImportedCalendarData): void;
  
  (e: 'export-csv'): void;
  (e: 'export-txt'): void;
  (e: 'export-excel'): void;
  (e: 'export-word'): void;
  (e: 'export-json'): void;

  (e: 'save-state'): void;
  (e: 'load-state'): void;
  (e: 'copy-link'): void;

  (e: 'toggle-admin-mode', password?: string): boolean;
}>();

const totalSubjects = props.subjects.length;
const availableCount = props.availableSubjects.length;
const assignedCount = totalSubjects - availableCount;

const showPasswordDialog = ref(false);
const passwordInput = ref("");
const passwordError = ref(false);

function getPeriodLabel(p: Period) {
  const tipus = p.tipus === "FINAL" ? "FINAL" : p.tipus === "REAVALUACIÓ" ? "REAVALUACIÓ" : "PARCIAL";
  const curs = p.curs ?? '';
  const quad = p.quad ?? '';
  
  // Build label: TIPUS CURS-QUADRIMESTRE
  let label = tipus;
  if (curs) {
    label += ` ${curs}`;
    if (quad) {
      label += `-${quad}`;
    }
  } else if (quad) {
    label += ` -${quad}`;
  }
  
  return label;
}

function attemptUnlock() {
  showPasswordDialog.value = true;
  passwordError.value = false;
  passwordInput.value = "";
}

function submitPassword() {
  const wasLocked = !props.isAdminMode;
  emit('toggle-admin-mode', passwordInput.value);
  
  // Use nextTick to check if unlock was successful after the parent updates
  setTimeout(() => {
    if (wasLocked && props.isAdminMode) {
      // Successfully unlocked
      showPasswordDialog.value = false;
      passwordInput.value = "";
      passwordError.value = false;
    } else if (wasLocked && !props.isAdminMode) {
      // Failed to unlock (wrong password)
      passwordError.value = true;
    }
  }, 50);
}

function lockAdmin() {
  emit('toggle-admin-mode');
}

function cancelPassword() {
  showPasswordDialog.value = false;
  passwordInput.value = "";
  passwordError.value = false;
}

function handleImportExcel(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  importExcelCalendar(file, props.subjects)
    .then((data) => {
      emit('import-calendar-data', data);
      alert("Calendari llegit correctament. Actualitzant...");
    })
    .catch((err) => {
      console.error(err);
      alert("Error important el calendari Excel: " + err);
    })
    .finally(() => {
      input.value = "";
    });
}
</script>

<template>
  <div class="p-4 rounded-2xl border shadow-sm bg-white mb-6">
    <h2 class="font-semibold mb-3">Dades i intercanvi</h2>

    <!-- Two sections: Protected and Unprotected -->
    <div class="space-y-4">
      
      <!-- PROTECTED SECTION: Botons per afegir/editar franges-assignatures-aules -->
      <div class="border rounded-xl p-3 bg-gray-50">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-gray-700">
            🔒 Botons per afegir/editar franges-assignatures-aules
          </h3>
          <button
            v-if="!isAdminMode"
            @click="attemptUnlock"
            class="px-3 py-1 text-xs border rounded-lg bg-yellow-50 hover:bg-yellow-100 border-yellow-300 font-medium"
          >
            🔓 Desbloquejar
          </button>
          <button
            v-else
            @click="lockAdmin"
            class="px-3 py-1 text-xs border rounded-lg bg-green-50 hover:bg-green-100 border-green-300 font-medium"
          >
            🔒 Bloquejar
          </button>
        </div>

        <div class="flex flex-wrap gap-3 items-center">
          <label 
            class="px-3 py-2 border rounded-xl shadow-sm cursor-pointer transition-colors"
            :class="isAdminMode ? 'bg-white hover:bg-gray-50' : 'bg-gray-200 cursor-not-allowed opacity-60'"
          >
            Importar CSV (REEMPLAÇA)
            <input
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              :disabled="!isAdminMode"
              @change="(e) => emit('import-csv', e)"
            />
          </label>

          <label 
            class="px-3 py-2 border rounded-xl shadow-sm cursor-pointer transition-colors"
            :class="isAdminMode ? 'bg-white hover:bg-gray-50' : 'bg-gray-200 cursor-not-allowed opacity-60'"
          >
            Afegir assignatures (CSV) — MERGE
            <input
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              :disabled="!isAdminMode"
              @change="(e) => emit('merge-subjects-csv', e)"
            />
          </label>

          <label 
            class="px-3 py-2 border rounded-xl shadow-sm cursor-pointer transition-colors"
            :class="isAdminMode ? 'bg-white hover:bg-gray-50' : 'bg-gray-200 cursor-not-allowed opacity-60'"
          >
            Importar Aules/Matriculats (CSV)
            <input
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              :disabled="!isAdminMode"
              @change="(e) => emit('import-rooms-csv', e)"
            />
          </label>

          <label 
            class="px-3 py-2 border rounded-xl shadow-sm cursor-pointer transition-colors"
            :class="isAdminMode ? 'bg-white hover:bg-gray-50' : 'bg-gray-200 cursor-not-allowed opacity-60'"
          >
            Importar calendari en Excel
            <!-- Fixed TS1117 error -->
            <input
              type="file"
              accept=".xlsx, .xls"
              class="hidden"
              :disabled="!isAdminMode"
              @change="handleImportExcel"
            />
          </label>

          <button 
            @click="emit('export-csv')" 
            :disabled="!isAdminMode"
            class="px-3 py-2 border rounded-xl shadow-sm transition-colors"
            :class="isAdminMode ? 'hover:bg-gray-50' : 'bg-gray-200 cursor-not-allowed opacity-60'"
          >
            Exportar CSV
          </button>
          
          <button 
            @click="emit('export-txt')" 
            :disabled="!isAdminMode"
            class="px-3 py-2 border rounded-xl shadow-sm transition-colors"
            :class="isAdminMode ? 'hover:bg-gray-50' : 'bg-gray-200 cursor-not-allowed opacity-60'"
          >
            Exportar TXT
          </button>
        </div>
      </div>

      <!-- UNPROTECTED SECTION: Botons per exportar i importar calendaris -->
      <div class="border rounded-xl p-3 bg-blue-50">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">
          📋 Botons per exportar i importar calendaris
        </h3>
        
        <div class="flex flex-wrap gap-3 items-center">
          <button @click="emit('export-json')" class="px-3 py-2 border rounded-xl shadow-sm bg-white hover:bg-gray-50">
            Exportar JSON
          </button>

          <label class="px-3 py-2 border rounded-xl shadow-sm cursor-pointer bg-white hover:bg-gray-50">
            Importar JSON
            <input
              type="file"
              accept="application/json"
              class="hidden"
              @change="(e) => emit('import-json', e)"
            />
          </label>

          <button @click="emit('export-excel')" class="px-3 py-2 border rounded-xl shadow-sm bg-white hover:bg-gray-50">
            Exportar calendari en Excel
          </button>

          <button @click="emit('export-word')" class="px-3 py-2 border rounded-xl shadow-sm bg-white hover:bg-gray-50">
            Exportar calendari en Word
          </button>

          <button @click="emit('save-state')" class="px-3 py-2 border rounded-xl shadow-sm bg-white hover:bg-gray-50">
            Guardar estat a l'URL
          </button>
          
          <button @click="emit('load-state')" class="px-3 py-2 border rounded-xl shadow-sm bg-white hover:bg-gray-50">
            Carregar estat de l'URL
          </button>
          
          <button @click="emit('copy-link')" class="px-3 py-2 border rounded-xl shadow-sm bg-white hover:bg-gray-50">
            Copiar enllaç
          </button>
        </div>
      </div>
    </div>

    <p class="text-xs text-gray-600 mt-4">
      Assignatures disponibles a la safata:
      <strong>{{ availableCount }}</strong> (de {{ totalSubjects }}). Assignades al
      calendari (tots períodes): <strong>{{ assignedCount }}</strong>.
    </p>

    <p class="text-xs text-gray-500 mt-1">
      Si canvies molt el CSV, pot ser recomanable reiniciar-ho tot amb
      &nbsp;"Importar CSV (REEMPLAÇA)".
    </p>

    <!-- Banner Desfer eliminació -->
    <div v-if="lastDeleted" class="mt-3 p-2 bg-yellow-50 border border-yellow-300 rounded-xl text-xs flex items-center justify-between gap-2">
      <span>
        Assignatura eliminada del catàleg:
        <strong>
          {{ lastDeleted.subject.sigles || lastDeleted.subject.codi }}
        </strong>
      </span>
      <div class="flex gap-2">
        <button
          @click="emit('undo-delete')"
          class="px-2 py-1 text-xs border rounded-lg bg-white hover:bg-gray-50"
        >
          Desfer
        </button>
        <button
          @click="emit('set-last-deleted', null)"
          class="px-2 py-1 text-xs border rounded-lg bg-white hover:bg-gray-50"
        >
          Amaga
        </button>
      </div>
    </div>

    <!-- Pestanyes de períodes -->
    <div class="mt-4 flex flex-wrap items-center gap-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="p in periods"
          :key="p.id"
          @click="emit('set-active-pid', p.id)"
          class="px-4 py-2 rounded-full border text-sm font-medium transition-colors"
          :class="[
            p.id === activePid
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white hover:bg-gray-50'
          ]"
        >
          {{ getPeriodLabel(p) }}
        </button>

        <button
          @click="emit('add-period')"
          :disabled="!isAdminMode"
          class="px-4 py-2 rounded-full border text-sm transition-colors"
          :class="isAdminMode ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-200 cursor-not-allowed opacity-60'"
        >
          Afegir període
        </button>
      </div>

      <button
        v-if="periods.length > 1"
        @click="emit('remove-period', activePid)"
        :disabled="!isAdminMode"
        class="px-4 py-2 rounded-full border text-sm transition-colors"
        :class="isAdminMode ? 'bg-red-50 hover:bg-red-100' : 'bg-gray-200 cursor-not-allowed opacity-60'"
      >
        Eliminar període actiu
      </button>
    </div>

    <!-- Password Dialog Modal -->
    <div
      v-if="showPasswordDialog"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click.self="cancelPassword"
    >
      <div class="bg-white rounded-2xl p-6 shadow-xl max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">🔐 Introdueix la contrasenya d'administrador</h3>
        
        <input
          v-model="passwordInput"
          type="password"
          placeholder="Contrasenya"
          class="w-full border rounded-xl p-3 mb-3"
          :class="passwordError ? 'border-red-500' : 'border-gray-300'"
          @keyup.enter="submitPassword"
          autofocus
        />
        
        <p v-if="passwordError" class="text-sm text-red-600 mb-3">
          ❌ Contrasenya incorrecta. Torna-ho a intentar.
        </p>
        
        <div class="flex gap-3 justify-end">
          <button
            @click="cancelPassword"
            class="px-4 py-2 border rounded-xl hover:bg-gray-50"
          >
            Cancel·lar
          </button>
          <button
            @click="submitPassword"
            class="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
          >
            Desbloquejar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>