<script setup lang="ts">
import type { Subject } from "../types/examPlanner";

defineProps<{
  s: Subject;
}>();
</script>

<template>
  <div class="flex flex-col text-xs opacity-80 leading-3 mt-0.5">
    <span v-if="s.MET">MET: {{ s.MET }}</span>
    <span v-if="s.MATT" class="text-blue-600 font-medium">MATT: {{ s.MATT }}</span>
    <span v-if="s.MEE" class="text-red-600 font-medium">MEE: {{ s.MEE }}</span>
    <span v-if="s.MCYBERS" class="text-green-600 font-medium">MCY: {{ s.MCYBERS }}</span>
  </div>
</template>