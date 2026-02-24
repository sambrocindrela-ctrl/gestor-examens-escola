<script setup lang="ts">
import { computed } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import type { Subject, RoomsEnroll } from "../types/examPlanner";
import PlacedChip from "./PlacedChip.vue";

const props = defineProps<{
  id: string; // cellKey
  disabled?: boolean;
  assignedList?: Subject[];
  extrasForSubjects?: Record<string, RoomsEnroll>;
  pid: number;
  dateIso: string;
  slotIndex: number;
}>();

const emit = defineEmits<{
  (e: 'remove-one', subjectId: string): void;
  (e: 'update-list', newList: Subject[]): void;
}>();

// Writable computed for v-model
const list = computed({
  get: () => props.assignedList || [],
  set: (val) => {
    emit('update-list', val);
  }
});

function onRemove(subjectId: string) {
  emit('remove-one', subjectId);
}
</script>

<template>
  <td
    class="align-top min-w-[170px] border transition-colors"
    :class="[
      disabled ? 'bg-gray-100 text-gray-400' : 'bg-white'
    ]"
  >
    <VueDraggable
      v-model="list"
      group="subjects"
      class="space-y-2 min-h-[80px] h-full w-full p-2"
      :disabled="disabled"
      ghost-class="opacity-50"
    >
      <div v-for="s in list" :key="s.id" class="relative group">
        <!-- Capseta arrossegable entre cel·les -->
        <PlacedChip
          :s="s"
          :extra="extrasForSubjects?.[s.id]"
        />

        <button
          v-if="!disabled"
          @click.stop="onRemove(s.id)"
          class="absolute -top-2 -right-2 w-6 h-6 rounded-full border bg-white shadow text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
          aria-label="Eliminar"
          title="Eliminar d'aquesta cel·la"
        >
          ×
        </button>
      </div>

      <div
        v-if="(!list || list.length === 0)"
        class="text-xs text-gray-400 italic pointer-events-none"
      >
        {{ disabled ? "No disponible" : "Arrossega aquí" }}
      </div>
    </VueDraggable>
  </td>
</template>