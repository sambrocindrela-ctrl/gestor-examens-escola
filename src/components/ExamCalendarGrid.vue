<script setup lang="ts">
import { computed } from 'vue';
import {
  addDays,
  subDays,
  startOfDay,
  isAfter,
  isBefore,
  parseISO,
  format,
} from "date-fns";
import type {
  Period,
  SlotsPerPeriod,
  AssignedPerPeriod,
  Subject,
  RoomsDataPerPeriod,
  RoomsEnroll,
} from "../types/examPlanner";
import DropCell from "./DropCell.vue";

const props = defineProps<{
  activePeriod: Period;
  activePid: number;
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  subjects: Subject[];
  roomsData: RoomsDataPerPeriod;
}>();

const emit = defineEmits<{
  (e: 'remove-one-from-cell', pid: number, dateIso: string, slotIndex: number, subjectId: string): void;
  (e: 'update-cell-list', pid: number, dateIso: string, slotIndex: number, newList: Subject[]): void;
}>();

/* --- Date Helpers --- */
function mondayOfWeek(d: Date) {
  const day = d.getDay(); // 0=dg … 6=ds
  const diff = (day + 6) % 7; // 0 si dilluns
  return startOfDay(subDays(d, diff));
}

function fridayOfWeek(d: Date) {
  const mon = mondayOfWeek(d);
  return startOfDay(addDays(mon, 4));
}

function fmtDM(d: Date) {
  return format(d, "dd/MM");
}

function iso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function cellKey(dateIso: string, slotIndex: number) {
  return `${dateIso}|${slotIndex}`;
}

function isDisabledDay(d: Date, p: Period) {
  const sd = parseISO(p.startStr);
  const ed = parseISO(p.endStr);
  const outside = isBefore(d, sd) || isAfter(d, ed);
  if (outside) return true;
  const bl = p.blackouts ?? [];
  return bl.includes(iso(d));
}

/* --- Computed Weeks --- */
const weeks = computed(() => {
  const start = parseISO(props.activePeriod.startStr);
  const end = parseISO(props.activePeriod.endStr);
  const monStart = mondayOfWeek(start);
  const friEnd = fridayOfWeek(end);

  const list = [];
  let cur = new Date(monStart);
  while (!isAfter(cur, friEnd)) {
    const mon = new Date(cur);
    const fri = addDays(mon, 4);
    list.push({ mon, fri });
    cur = addDays(mon, 7);
  }
  return list;
});

/* --- Handlers --- */
function onRemoveOne(dateIso: string, slotIndex: number, subjectId: string) {
  emit('remove-one-from-cell', props.activePid, dateIso, slotIndex, subjectId);
}

function onUpdateList(dateIso: string, slotIndex: number, newList: Subject[]) {
  emit('update-cell-list', props.activePid, dateIso, slotIndex, newList);
}

// Helper to get assigned list for a cell
function getAssignedList(dateIso: string, slotIndex: number): Subject[] {
  const amap = props.assignedPerPeriod[props.activePid] ?? {};
  const subjIds = amap[cellKey(dateIso, slotIndex)] ?? [];
  return subjIds
    .map((id) => props.subjects.find((x) => x.id === id))
    .filter(Boolean) as Subject[];
}

// Helper to get extras for a cell
function getExtrasForSubjects(dateIso: string, slotIndex: number, subjIds: string[]) {
  const extrasForSubjects: Record<string, RoomsEnroll> = {};
  const extrasCell = props.roomsData?.[props.activePid]?.[cellKey(dateIso, slotIndex)] ?? {};
  for (const sid of subjIds) {
    if (extrasCell[sid]) extrasForSubjects[sid] = extrasCell[sid];
  }
  return extrasForSubjects;
}
</script>

<template>
  <div class="mb-8">
    <div class="flex items-center gap-3 mb-2">
      <h3 class="text-lg font-semibold">
        {{ activePeriod.tipus }} —
        {{ format(parseISO(activePeriod.startStr), "dd/MM") }} a
        {{ format(parseISO(activePeriod.endStr), "dd/MM") }}
      </h3>
      <span class="text-sm text-gray-500">(dl–dv)</span>
    </div>

    <div v-for="(week, wIdx) in weeks" :key="wIdx" class="mt-6">
      <div class="flex items-center gap-3 mb-2">
        <h4 class="font-semibold">
          Setmana {{ format(week.mon, "dd/MM") }} — {{ format(week.fri, "dd/MM") }}
        </h4>
        <span class="text-xs text-gray-500">(dl–dv)</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th class="border p-2 w-28 text-left">Franja</th>
              <th v-for="i in 5" :key="i" class="border p-2 min-w-[170px] text-left">
                <div class="font-semibold">
                  {{ ["Dl/Mon", "Dt/Tu", "Dc/Wed", "Dj/Thu", "Dv/Fri"][i - 1] }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ fmtDM(addDays(week.mon, i - 1)) }}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(slot, slotIndex) in (slotsPerPeriod[activePid] ?? [])" :key="slotIndex">
              <td class="border p-2 align-top font-medium whitespace-nowrap">
                {{ slot.start }}-{{ slot.end }}
              </td>
              <DropCell
                v-for="i in 5"
                :key="i"
                :id="`cell:${activePid}:${iso(addDays(week.mon, i - 1))}:${slotIndex}`"
                :pid="activePid"
                :dateIso="iso(addDays(week.mon, i - 1))"
                :slotIndex="slotIndex"
                :disabled="isDisabledDay(addDays(week.mon, i - 1), activePeriod)"
                :assignedList="getAssignedList(iso(addDays(week.mon, i - 1)), slotIndex)"
                :extrasForSubjects="getExtrasForSubjects(
                  iso(addDays(week.mon, i - 1)),
                  slotIndex,
                  (assignedPerPeriod[activePid] ?? {})[cellKey(iso(addDays(week.mon, i - 1)), slotIndex)] ?? []
                )"
                @remove-one="(sid: string) => onRemoveOne(iso(addDays(week.mon, i - 1)), slotIndex, sid)"
                @update-list="(newList: Subject[]) => onUpdateList(iso(addDays(week.mon, i - 1)), slotIndex, newList)"
              />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>