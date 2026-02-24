<script setup lang="ts">
import { ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import type { Subject } from '../types/examPlanner';

// We use a dummy list to act as a drop target
const trashList = ref<Subject[]>([]);

const emit = defineEmits<{
  (e: 'delete', item: any): void
}>();

function onAdd() {
  // When something is dropped here, we emit the delete event
  // The item is added to trashList by v-model, so we can take it from there
  const item = trashList.value[0];
  if (item && item.id) {
    emit('delete', item.id);
  }
  // Clear the list immediately so it doesn't actually "store" items
  trashList.value = [];
}
</script>

<template>
  <div class="fixed bottom-6 right-6 z-50">
    <VueDraggable
      v-model="trashList"
      group="subjects"
      @add="onAdd"
      class="flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-md bg-white transition-colors"
      ghost-class="hidden"
    >
      <span class="text-sm">🗑️ Paperera</span>
      <span class="text-xs text-gray-500">
        Arrossega aquí per eliminar
      </span>
    </VueDraggable>
  </div>
</template>

<style scoped>
/* Optional: Add styling for when dragging over */
.sortable-drag {
  opacity: 0;
}
</style>