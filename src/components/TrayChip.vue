<script setup lang="ts">
import type { Subject } from "../types/examPlanner";
import { getSubjectLevelColor } from "../utils/levelColors";
import MastersLines from "./MastersLines.vue";

const props = defineProps<{
  s: Subject;
}>();

const levelBgColor = getSubjectLevelColor(props.s.nivell);
</script>

<template>
  <div
    :data-subject-id="s.id"
    class="relative inline-flex flex-col px-3 py-2 rounded-2xl shadow-sm border text-sm select-none cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    :style="{ backgroundColor: levelBgColor ?? '#FFFFFF' }"
    :title="`${s.sigles} · ${s.codi}`"
  >
    <span class="font-medium truncate">
      {{ s.sigles }} · {{ s.codi }}
    </span>
    <span v-if="s.nivell" class="text-xs opacity-80 leading-4">
      Nivell: {{ s.nivell }}
    </span>
    <MastersLines v-else :s="s" />
  </div>
</template>
