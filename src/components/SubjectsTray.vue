<script setup lang="ts">
import { computed } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import type { Subject } from "../types/examPlanner";
import TrayChip from "./TrayChip.vue";

const props = defineProps<{
  availableSubjects: Subject[];
  subjects: Subject[];
  hiddenSubjectIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:hiddenSubjectIds', val: string[]): void
}>();

// We need a writable computed for v-model, but since we don't want to modify availableSubjects directly
// (it's a filtered view), we use a getter. The setter is needed for the library but won't be used for reordering here.
const list = computed({
  get: () => props.availableSubjects,
  set: () => { /* No-op for tray reordering */ }
});

function restore(id: string) {
  emit('update:hiddenSubjectIds', props.hiddenSubjectIds.filter(x => x !== id));
}

function restoreAll() {
  emit('update:hiddenSubjectIds', []);
}

// Clone function for VueDraggable
function clone(element: Subject) {
  return element;
}
</script>

<template>
  <!-- Safata d'assignatures -->
  <div class="p-4 rounded-2xl border shadow-sm bg-white mb-3">
    <h2 class="font-semibold mb-3">Assignatures (arrossega)</h2>

    <VueDraggable
      v-model="list"
      :group="{ name: 'subjects', pull: 'clone', put: false }"
      :clone="clone"
      :sort="false"
      class="flex flex-wrap gap-2 min-h-[50px]"
    >
      <TrayChip
        v-for="s in list"
        :key="s.id"
        :s="s"
      />
    </VueDraggable>

    <div v-if="!availableSubjects.length" class="text-xs text-gray-500 italic mt-2">
      No hi ha assignatures per al curs/quadrimestre i període
      d’aquest calendari, o ja estan totes programades/ocultes.
    </div>
  </div>

  <!-- Llista d'eliminades (amb restauració) -->
  <div v-if="hiddenSubjectIds.length > 0" class="p-3 rounded-xl border shadow-sm bg-yellow-50 mb-6 text-sm">
    <div class="font-semibold mb-2">
      Assignatures eliminades de la safata
    </div>
    <div class="flex flex-wrap gap-2">
      <span
        v-for="id in hiddenSubjectIds"
        :key="id"
        class="inline-flex items-center gap-2 px-2 py-1 rounded-lg border bg-white"
      >
        <template v-if="subjects.find(x => x.id === id)">
          {{ subjects.find(x => x.id === id)?.sigles || subjects.find(x => x.id === id)?.codi }}
          <button
            class="text-xs px-2 py-0.5 border rounded-md hover:bg-gray-50"
            @click="restore(id)"
            title="Restaurar a la safata"
          >
            Restaurar
          </button>
        </template>
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