<script setup lang="ts">
import { computed } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import type { Subject } from "../types/examPlanner";
import TrayChip from "./TrayChip.vue";

const props = defineProps<{
  pendingSubjects: Subject[];
  noExamSubjects: Subject[];
  clipboardSubjects: Subject[];
  subjects: Subject[];
  hiddenSubjectIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:hiddenSubjectIds', val: string[]): void
}>();

const pendingList = computed({
  get: () => props.pendingSubjects,
  set: () => { /* No-op */ }
});

const noExamList = computed({
  get: () => props.noExamSubjects,
  set: () => { /* No-op */ }
});

const clipboardList = computed({
  get: () => props.clipboardSubjects,
  set: () => { /* No-op */ }
});

function restore(id: string) {
  emit('update:hiddenSubjectIds', props.hiddenSubjectIds.filter(x => x !== id));
}

function restoreAll() {
  emit('update:hiddenSubjectIds', []);
}

function clone(element: Subject) {
  return element;
}

function labelForHidden(id: string) {
  const s = props.subjects.find(x => x.id === id);
  return s ? (s.sigles || s.codi) : id;
}
</script>

<template>
  <div class="flex flex-col gap-3 mb-3">
    <!-- Pendents -->
    <div class="p-4 rounded-2xl border shadow-sm bg-white">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold">Pendents de decidir</h2>
        <span class="text-sm text-gray-500">{{ pendingList.length }}</span>
      </div>

      <VueDraggable
        v-model="pendingList"
        :group="{ name: 'subjects', pull: 'clone', put: true }"
        :clone="clone"
        :sort="false"
        class="flex flex-wrap gap-2 min-h-[50px]"
      >
        <TrayChip
          v-for="s in pendingList"
          :key="s.id"
          :s="s"
        />
      </VueDraggable>

      <div v-if="!pendingSubjects.length" class="text-xs text-gray-500 italic mt-2">
        No hi ha assignatures pendents.
      </div>
    </div>

    <!-- Sense examen -->
    <div class="p-4 rounded-2xl border shadow-sm bg-white">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold">Sense examen</h2>
        <span class="text-sm text-gray-500">{{ noExamList.length }}</span>
      </div>

      <VueDraggable
        v-model="noExamList"
        :group="{ name: 'subjects', pull: 'clone', put: true }"
        :clone="clone"
        :sort="false"
        class="flex flex-wrap gap-2 min-h-[50px]"
      >
        <TrayChip
          v-for="s in noExamList"
          :key="s.id"
          :s="s"
        />
      </VueDraggable>

      <div v-if="!noExamSubjects.length" class="text-xs text-gray-500 italic mt-2">
        No hi ha assignatures marcades com a sense examen.
      </div>
    </div>

    <!-- Reserva temporal -->
    <div class="p-4 rounded-2xl border shadow-sm bg-white">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold">Reserva temporal</h2>
        <span class="text-sm text-gray-500">{{ clipboardList.length }}</span>
      </div>

      <VueDraggable
        v-model="clipboardList"
        :group="{ name: 'subjects', pull: 'clone', put: true }"
        :clone="clone"
        :sort="false"
        class="flex flex-wrap gap-2 min-h-[50px]"
      >
        <TrayChip
          v-for="s in clipboardList"
          :key="s.id"
          :s="s"
        />
      </VueDraggable>

      <div v-if="!clipboardSubjects.length" class="text-xs text-gray-500 italic mt-2">
        No hi ha assignatures en reserva temporal.
      </div>
    </div>
  </div>

  <!-- Llista d'eliminades (amb restauració) -->
  <div
    v-if="hiddenSubjectIds.length > 0"
    class="p-3 rounded-xl border shadow-sm bg-yellow-50 mb-6 text-sm"
  >
    <div class="font-semibold mb-2">
      Assignatures eliminades de la safata
    </div>

    <div class="flex flex-wrap gap-2">
      <span
        v-for="id in hiddenSubjectIds"
        :key="id"
        class="inline-flex items-center gap-2 px-2 py-1 rounded-lg border bg-white"
      >
        {{ labelForHidden(id) }}
        <button
          class="text-xs px-2 py-0.5 border rounded-md hover:bg-gray-50"
          @click="restore(id)"
          title="Restaurar a la safata"
        >
          Restaurar
        </button>
      </span>

      <button
        class="ml-2 text-xs px-2 py-0.5 border rounded-md bg-white hover:bg-gray-50"
        @click="restoreAll"
        title="Restaurar totes"
      >
        Restaurar totes
      </button>
    </div>
  </div>
</template>
