import { ref, computed, watch, onMounted } from "vue";
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { format, addDays, subDays, startOfDay } from "date-fns";

import type {
  Subject,
  Period,
  SlotsPerPeriod,
  AssignedPerPeriod,
  RoomsDataPerPeriod,
  RoomsEnroll,
  AssignedMap,
  RoomsMapPerCell,
} from "../types/examPlanner";

/* ---------- Helpers ---------- */
function mondayOfWeek(d: Date) {
  const day = d.getDay(); // 0=dg … 6=ds
  const diff = (day + 6) % 7; // 0 si dilluns
  return startOfDay(subDays(d, diff));
}
function fridayOfWeek(d: Date) {
  const mon = mondayOfWeek(d);
  return startOfDay(addDays(mon, 4));
}

export function useExamPlannerState() {
  /* Assignatures */
  const subjects = ref<Subject[]>([]);

  /* Períodes */
  const periods = ref<Period[]>([
    {
      id: 1,
      label: "Període 1",
      tipus: "PARCIAL",
      startStr: format(mondayOfWeek(new Date()), "yyyy-MM-dd"),
      endStr: format(fridayOfWeek(new Date()), "yyyy-MM-dd"),
      curs: undefined,
      quad: undefined,
      blackouts: [],
    },
  ]);

  /* Període actiu */
  const activePid = ref<number>(1);

  /* Franges per període */
  const slotsPerPeriod = ref<SlotsPerPeriod>({
    1: [
      { start: "08:00", end: "10:00" },
      { start: "10:30", end: "12:30" },
      { start: "15:00", end: "17:00" },
    ],
  });

  /* Assignacions per període */
  const assignedPerPeriod = ref<AssignedPerPeriod>({});

  /* Aules/Matriculats */
  const roomsData = ref<RoomsDataPerPeriod>({});

  /* Períodes permesos per assignatura */
  const allowedPeriodsBySubject = ref<Record<string, number[]>>({});

  /* Ocultes */
  const hiddenSubjectIds = ref<string[]>([]);

  /* --- Estat per Desfer --- */
  type DeletedSnapshot = {
    subject: Subject;
    allowedPeriods?: number[];
    placed: Record<number, string[]>;
    rooms: Record<number, Record<string, RoomsEnroll>>;
  };

  const lastDeleted = ref<DeletedSnapshot | null>(null);

  // Caducitat automàtica del banner "Desfer"
  watch(lastDeleted, (val) => {
    if (!val) return;
    const t = setTimeout(() => (lastDeleted.value = null), 20000);
    return () => clearTimeout(t);
  });

  /* --- Computed Helpers --- */
  const activePeriod = computed(() =>
    periods.value.find((p) => p.id === activePid.value)
  );

  /* --- Actions --- */

  function addPeriod() {
    if (periods.value.length >= 5) {
      alert("Pots tenir com a màxim 5 períodes.");
      return;
    }
    const newId = Math.max(0, ...periods.value.map((p) => p.id)) + 1;
    const today = new Date();
    const newPeriod: Period = {
      id: newId,
      label: `Període ${newId}`,
      tipus: "PARCIAL",
      startStr: format(mondayOfWeek(today), "yyyy-MM-dd"),
      endStr: format(fridayOfWeek(today), "yyyy-MM-dd"),
      curs: undefined,
      quad: undefined,
      blackouts: [],
    };
    periods.value.push(newPeriod);
    slotsPerPeriod.value[newId] = [{ start: "08:00", end: "10:00" }];
    activePid.value = newId;
  }

  function removePeriod(id: number) {
    if (!confirm("Segur que vols eliminar aquest període?")) return;
    periods.value = periods.value.filter((p) => p.id !== id);

    const apCopy = { ...assignedPerPeriod.value };
    delete apCopy[id];
    assignedPerPeriod.value = apCopy;

    const spCopy = { ...slotsPerPeriod.value };
    delete spCopy[id];
    slotsPerPeriod.value = spCopy;

    const rdCopy = { ...roomsData.value };
    delete rdCopy[id];
    roomsData.value = rdCopy;
  }

  function deleteSubjectPermanently(subjectId: string) {
    const subj = subjects.value.find((s) => s.id === subjectId);
    if (!subj) return;
    if (
      !confirm(
        `Eliminar definitivament "${subj.sigles || subj.codi
        }" del catàleg?\nS’esborrarà de la safata, del calendari i de les dades d’aules/estudiants.`
      )
    ) {
      return;
    }

    // 1) Snapshot per Desfer
    const placed: Record<number, string[]> = {};
    for (const [pidStr, amap] of Object.entries(assignedPerPeriod.value)) {
      const pid = Number(pidStr);
      const cells: string[] = [];
      for (const [cell, ids] of Object.entries(amap)) {
        if (ids.includes(subjectId)) cells.push(cell);
      }
      if (cells.length) placed[pid] = cells;
    }

    const roomsSnap: Record<number, Record<string, RoomsEnroll>> = {};
    for (const [pidStr, per] of Object.entries(roomsData.value)) {
      const pid = Number(pidStr);
      const perOut: Record<string, RoomsEnroll> = {};
      for (const [cellKey, map] of Object.entries(per)) {
        const entry = map[subjectId];
        if (entry)
          perOut[cellKey] = {
            rooms: [...(entry.rooms || [])],
            students: entry.students,
          };
      }
      if (Object.keys(perOut).length) roomsSnap[pid] = perOut;
    }

    const allowed = allowedPeriodsBySubject.value[subjectId];
    lastDeleted.value = {
      subject: subj,
      allowedPeriods: allowed ? [...allowed] : undefined,
      placed,
      rooms: roomsSnap,
    };

    // 2) Elimina de l’estat
    subjects.value = subjects.value.filter((s) => s.id !== subjectId);

    const allowedCopy = { ...allowedPeriodsBySubject.value };
    delete allowedCopy[subjectId];
    allowedPeriodsBySubject.value = allowedCopy;

    hiddenSubjectIds.value = hiddenSubjectIds.value.filter((id) => id !== subjectId);

    // Clean assigned
    const assignedCopy: AssignedPerPeriod = {};
    for (const [pidStr, amap] of Object.entries(assignedPerPeriod.value)) {
      const newMap: AssignedMap = {};
      for (const [cell, ids] of Object.entries(amap)) {
        const next = ids.filter((id) => id !== subjectId);
        if (next.length) newMap[cell] = next;
      }
      assignedCopy[Number(pidStr)] = newMap;
    }
    assignedPerPeriod.value = assignedCopy;

    // Clean rooms
    const roomsCopy: RoomsDataPerPeriod = {};
    for (const [pidStr, per] of Object.entries(roomsData.value)) {
      const newPer: Record<string, RoomsMapPerCell> = {};
      for (const [cellKey, map] of Object.entries(per)) {
        const { [subjectId]: _drop, ...rest } = map;
        if (Object.keys(rest).length) newPer[cellKey] = rest;
      }
      roomsCopy[Number(pidStr)] = newPer;
    }
    roomsData.value = roomsCopy;
  }

  function undoDelete() {
    if (!lastDeleted.value) return;
    const snap = lastDeleted.value;

    // 1) Subject
    if (!subjects.value.some((s) => s.id === snap.subject.id)) {
      subjects.value.push(snap.subject);
    }

    // 2) Allowed
    if (snap.allowedPeriods) {
      allowedPeriodsBySubject.value[snap.subject.id] = [...snap.allowedPeriods];
    }

    // 3) Placed
    const assignedCopy = { ...assignedPerPeriod.value };
    for (const [pidStr, cells] of Object.entries(snap.placed)) {
      const pid = Number(pidStr);
      const amap = { ...(assignedCopy[pid] ?? {}) };
      for (const cell of cells) {
        const setIds = new Set(amap[cell] ?? []);
        setIds.add(snap.subject.id);
        amap[cell] = Array.from(setIds);
      }
      assignedCopy[pid] = amap;
    }
    assignedPerPeriod.value = assignedCopy;

    // 4) Rooms
    const roomsCopy = JSON.parse(JSON.stringify(roomsData.value));
    for (const [pidStr, per] of Object.entries(snap.rooms)) {
      const pid = Number(pidStr);
      roomsCopy[pid] = roomsCopy[pid] || {};
      for (const [cellKey, info] of Object.entries(per)) {
        roomsCopy[pid][cellKey] = roomsCopy[pid][cellKey] || {};
        roomsCopy[pid][cellKey][snap.subject.id] = {
          rooms: [...(info.rooms || [])],
          students: info.students,
        };
      }
    }
    roomsData.value = roomsCopy;

    lastDeleted.value = null;
  }

  /* --- Persistence --- */
  function saveStateToUrl() {
    const payload = {
      subjects: subjects.value,
      periods: periods.value,
      slotsPerPeriod: slotsPerPeriod.value,
      assignedPerPeriod: assignedPerPeriod.value,
      activePid: activePid.value,
      roomsData: roomsData.value,
      allowedPeriodsBySubject: allowedPeriodsBySubject.value,
      hiddenSubjectIds: hiddenSubjectIds.value,
    };
    const packed = compressToEncodedURIComponent(JSON.stringify(payload));
    const url = new URL(window.location.href);
    url.hash = `state=${packed}`;
    history.replaceState(null, "", url.toString());
    alert("Estat guardat a l’enllaç!");
  }

  function loadStateFromUrl(): boolean {
    const m = (window.location.hash || "").match(/[#&]state=([^&]+)/);
    if (!m) return false;
    try {
      const json = decompressFromEncodedURIComponent(m[1]);
      if (!json) return false;
      const data = JSON.parse(json);
      if (Array.isArray(data.subjects)) subjects.value = data.subjects;
      if (Array.isArray(data.periods)) periods.value = data.periods;
      if (data.slotsPerPeriod) slotsPerPeriod.value = data.slotsPerPeriod;
      if (data.assignedPerPeriod) assignedPerPeriod.value = data.assignedPerPeriod;
      if (data.roomsData) roomsData.value = data.roomsData;
      if (data.allowedPeriodsBySubject)
        allowedPeriodsBySubject.value = data.allowedPeriodsBySubject;
      if (Array.isArray(data.hiddenSubjectIds))
        hiddenSubjectIds.value = data.hiddenSubjectIds;
      if (typeof data.activePid === "number") activePid.value = data.activePid;
      return true;
    } catch {
      return false;
    }
  }

  function copyLinkToClipboard() {
    if (!window.location.hash.includes("state=")) {
      saveStateToUrl();
      return;
    }
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => alert("Enllaç copiat!"))
      .catch(() => alert("No s’ha pogut copiar l’enllaç."));
  }

  // Load on mount
  onMounted(() => {
    loadStateFromUrl();
  });

  return {
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
  };
}