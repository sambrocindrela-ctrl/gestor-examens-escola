<script setup lang="ts">
import type { Subject, RoomsEnroll } from "../types/examPlanner";
import MastersLines from "./MastersLines.vue";

const props = defineProps<{
  s: Subject;
  extra?: RoomsEnroll;
}>();

const hasRooms = props.extra?.rooms && props.extra.rooms.length > 0;
const hasStud =
  props.extra &&
  typeof props.extra.students === "number" &&
  !Number.isNaN(props.extra.students);
</script>

<template>
  <div
    class="relative p-2 rounded-2xl border-2 border-gray-800 bg-white cursor-grab active:cursor-grabbing hover:border-indigo-500 transition-colors"
    title="Arrossega per moure a una altra franja"
  >
    <div class="text-sm font-semibold leading-tight">
      {{ s.sigles }} · {{ s.codi }}
    </div>

    <div v-if="s.nivell" class="text-xs opacity-80">
      Nivell: {{ s.nivell }}
    </div>
    <MastersLines v-else :s="s" />

    <div v-if="hasRooms || hasStud" class="mt-1 space-y-0.5 text-xs">
      <div v-if="hasRooms">
        <span class="font-medium">Aules/Rooms:</span>
        {{ extra!.rooms.join(", ") }}
      </div>
      <div v-if="hasStud">
        <span class="font-medium">Estudiants/Students:</span>
        {{ extra!.students }}
      </div>
    </div>
  </div>
</template>