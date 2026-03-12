import * as XLSX from "xlsx-js-style";
import { format, parse, isValid } from "date-fns";
import type {
  Period,
  Subject,
  SlotsPerPeriod,
  AssignedPerPeriod,
} from "../types/examPlanner";

type ExportGEFExcelArgs = {
  periods: Period[];
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  subjects: Subject[];
  roomsCsvFile?: File | null;
  fileName?: string;
};

type SheetCell = {
  v?: any;
  t?: string;
  s?: any;
  [key: string]: any;
};

function parseFlexibleDateToIso(value: string): string | null {
  const normalized = value.trim().replace(/[.-]/g, "/");
  const patterns = ["d/M/yyyy", "dd/MM/yyyy", "d/M/yy", "dd/MM/yy"];

  for (const p of patterns) {
    const d = parse(normalized, p, new Date());
    if (isValid(d)) return format(d, "yyyy-MM-dd");
  }
  return null;
}

function excelSerialToIso(serial: number): string {
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return format(date, "yyyy-MM-dd");
}

function normalizeTime(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function extractTimeRange(text: string): { start: string; end: string } | null {
  const matches = text.match(/(\d{1,2}[:.]\d{2})/g);
  if (!matches || matches.length < 2) return null;

  const start = normalizeTime(matches[0]);
  const end = normalizeTime(matches[1]);
  if (!start || !end) return null;

  return { start, end };
}

function getSubjectById(subjects: Subject[], id: string): Subject | undefined {
  return subjects.find((s) => s.id === id);
}

function guessSubjectIsEnglish(subject: Subject): boolean {
  return !!subject.displayItalic;
}

function buildSubjectText(subject: Subject, rooms: string[]): string {
  const mainLabel = (subject.displayName || subject.sigles || subject.codi).trim();
  const roomPrefix = guessSubjectIsEnglish(subject) ? "classroom: " : "aula: ";

  if (rooms.length > 0) {
    return `${mainLabel} ${subject.codi} ${roomPrefix}${rooms.join(", ")}`;
  }

  return `${mainLabel} ${subject.codi}`;
}

function setCellText(
  ws: any,
  cellAddress: string,
  text: string,
  italic?: boolean
) {
  const existing = (ws[cellAddress] || {}) as SheetCell;

  ws[cellAddress] = {
    ...existing,
    t: "s",
    v: text,
    s: {
      ...(existing.s || {}),
      alignment: {
        ...(existing.s?.alignment || {}),
        wrapText: true,
        vertical: "top",
      },
      font: {
        ...(existing.s?.font || {}),
        italic: !!italic,
      },
    },
  };
}

function parseSemicolonCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ";" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}

async function parseRoomsCsvFile(file?: File | null): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!file) return map;

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return map;

  const headers = parseSemicolonCsvLine(lines[0]).map((h) => h.trim());

  const idx = {
    codi: headers.indexOf("codi"),
    aula: headers.indexOf("aula"),
    data_examen: headers.indexOf("data_examen"),
    hora_inici: headers.indexOf("hora_inici"),
    hora_fi: headers.indexOf("hora_fi"),
  };

  if (
    idx.codi === -1 ||
    idx.aula === -1 ||
    idx.data_examen === -1 ||
    idx.hora_inici === -1 ||
    idx.hora_fi === -1
  ) {
    throw new Error("El CSV d’aules no té les columnes necessàries.");
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = parseSemicolonCsvLine(lines[i]);

    const codi = (cols[idx.codi] || "").trim();
    const aula = (cols[idx.aula] || "").trim();
    const dataExamen = (cols[idx.data_examen] || "").trim();
    const horaInici = normalizeTime((cols[idx.hora_inici] || "").trim());
    const horaFi = normalizeTime((cols[idx.hora_fi] || "").trim());

    if (!codi || !aula || !dataExamen || !horaInici || !horaFi) continue;

    const dateIso = parseFlexibleDateToIso(dataExamen);
    if (!dateIso) continue;

    const key = `${codi}|${dateIso}|${horaInici}|${horaFi}`;
    const arr = map.get(key) || [];
    arr.push(aula);
    map.set(key, arr);
  }

  return map;
}

function sheetMatchesPeriod(sheetName: string, period: Period): boolean {
  if (!period.curs || !period.quad) return true;
  return sheetName.trim() === `${period.curs}-${period.quad}`;
}

function isDateRow(
  ws: any,
  r: number,
  maxCol: number
): Map<number, string> | null {
  const found = new Map<number, string>();

  for (let c = 0; c <= maxCol; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr] as SheetCell | undefined;
    if (!cell || cell.v == null) continue;

    let iso: string | null = null;

    if (typeof cell.v === "number") {
      iso = excelSerialToIso(cell.v);
    } else if (typeof cell.v === "string") {
      iso = parseFlexibleDateToIso(cell.v);
    }

    if (iso) found.set(c, iso);
  }

  return found.size >= 2 ? found : null;
}

function scanTemplateSlotBlocks(ws: any): Map<string, string[]> {
  const ref = ws["!ref"];
  if (!ref) return new Map();

  const range = XLSX.utils.decode_range(ref);
  const result = new Map<string, string[]>();

  let currentDates = new Map<number, string>();
  let currentSlot: { start: string; end: string } | null = null;

  for (let r = range.s.r; r <= range.e.r; r++) {
    const dateRow = isDateRow(ws, r, range.e.c);
    if (dateRow) {
      currentDates = dateRow;
      currentSlot = null;
      continue;
    }

    let timeText = "";
    for (const c of [0, 1]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as SheetCell | undefined;
      if (cell?.v != null) {
        timeText = String(cell.v).trim();
        if (timeText) break;
      }
    }

    const timeRange = extractTimeRange(timeText);
    if (timeRange) {
      currentSlot = timeRange;
    }

    if (!currentSlot || currentDates.size === 0) continue;

    for (const [col, dateIso] of currentDates.entries()) {
      if (col <= 1) continue;

      const addr = XLSX.utils.encode_cell({ r, c: col });
      const key = `${dateIso}|${currentSlot.start}|${currentSlot.end}`;
      const arr = result.get(key) || [];
      arr.push(addr);
      result.set(key, arr);
    }
  }

  return result;
}

export async function exportGEFExcelFromTemplate({
  periods,
  slotsPerPeriod,
  assignedPerPeriod,
  subjects,
  roomsCsvFile = null,
  fileName = "Calendari_GEF_amb_aules.xlsx",
}: ExportGEFExcelArgs): Promise<void> {
  const response = await fetch("/templates/Calendari_GEF_template.xlsx");
  if (!response.ok) {
    throw new Error("No s’ha pogut carregar la plantilla GEF.");
  }

  const arrayBuffer = await response.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array", cellStyles: true });

  const roomsMap = await parseRoomsCsvFile(roomsCsvFile);

  for (const period of periods) {
    const sheetName = wb.SheetNames.find((sn: string) => sheetMatchesPeriod(sn, period));
    if (!sheetName) continue;

    const ws = wb.Sheets[sheetName];
    const slotBlocks = scanTemplateSlotBlocks(ws);
    const usedIndexByKey = new Map<string, number>();

    const slots = slotsPerPeriod[period.id] || [];
    const assignedMap = assignedPerPeriod[period.id] || {};

    for (const [assignedKey, subjectIds] of Object.entries(assignedMap)) {
      const [dateIso, slotIndexStr] = assignedKey.split("|");
      const slotIndex = Number(slotIndexStr);
      const slot = slots[slotIndex];
      if (!slot) continue;

      const templateKey = `${dateIso}|${slot.start}|${slot.end}`;
      const candidateCells = slotBlocks.get(templateKey) || [];
      if (!candidateCells.length) continue;

      for (const subjectId of subjectIds) {
        const subject = getSubjectById(subjects, subjectId);
        if (!subject) continue;

        const roomsKey = `${subject.codi}|${dateIso}|${slot.start}|${slot.end}`;
        const rooms = roomsMap.get(roomsKey) || [];

        const nextIndex = usedIndexByKey.get(templateKey) || 0;
        const targetCell =
          candidateCells[nextIndex] ||
          candidateCells[candidateCells.length - 1];

        if (!targetCell) continue;

        setCellText(
          ws,
          targetCell,
          buildSubjectText(subject, rooms),
          !!subject.displayItalic
        );

        usedIndexByKey.set(templateKey, nextIndex + 1);
      }
    }
  }

  XLSX.writeFile(wb, fileName, { cellStyles: true });
}
