import * as XLSX from "xlsx-js-style";
import { parse, format, isValid } from "date-fns";
import type {
  Period,
  SlotsPerPeriod,
  AssignedPerPeriod,
  RoomsDataPerPeriod,
  TimeSlot,
  Subject,
} from "../types/examPlanner";

export interface ImportedCalendarData {
  periods: Period[];
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  roomsData: RoomsDataPerPeriod;
  subjects: Subject[];
}

const parseCellSubjects = (cellContent: string) => {
  const lines = cellContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l);

  let currentNameBuffer: string[] = [];
  const found: { code: string; name: string }[] = [];

  const garbageLineRegex =
    /^(?:Aula|Aules|Classroom|Laboratory|Laboratori|Students|Matriculats|Estudiants)\b/i;

  const inlineGarbageRegex =
    /\b(?:Aula|Aules|Classroom|Laboratory|Laboratori)\b.*$/i;

  for (const line of lines) {
    const cleaned = line.replace(inlineGarbageRegex, "").trim();

    if (!cleaned || garbageLineRegex.test(cleaned)) continue;

    const codeMatch = cleaned.match(/230\d{3,4}/);
    if (codeMatch) {
      const code = codeMatch[0];
      const withoutCode = cleaned.replace(code, "").trim();

      if (withoutCode && !garbageLineRegex.test(withoutCode)) {
        currentNameBuffer.push(withoutCode);
      }

      const name = currentNameBuffer.join(" ").replace(/\s+/g, " ").trim();
      found.push({ code, name });
      currentNameBuffer = [];
    } else {
      currentNameBuffer.push(cleaned);
    }
  }

  return found;
};

const parseFlexibleDate = (value: string): Date | null => {
  const normalized = value.trim().replace(/[.-]/g, "/");
  const patterns = ["d/M/yyyy", "dd/MM/yyyy", "d/M/yy", "dd/MM/yy"];

  for (const p of patterns) {
    const d = parse(normalized, p, new Date());
    if (isValid(d)) return d;
  }

  return null;
};

const normalizeTipus = (raw: string): "PARCIAL" | "FINAL" | "REAVALUACIÓ" | null => {
  const upper = raw.toUpperCase();

  if (upper.includes("EXTRAORDINARI") || upper.includes("EXTRAORDINARY")) {
    return "REAVALUACIÓ";
  }

  if (upper.includes("REAVALUACIÓ") || upper.includes("REEVALUACIÓ")) {
    return "REAVALUACIÓ";
  }

  if (upper.includes("PARCIAL")) return "PARCIAL";
  if (upper.includes("FINAL")) return "FINAL";

  return null;
};

const inferPeriodFromRow = (
  rowString: string,
  sheetName: string
): { tipus: "PARCIAL" | "FINAL" | "REAVALUACIÓ" | null; curs: number | null; quad: 1 | 2 | null } => {
  let tipus: "PARCIAL" | "FINAL" | "REAVALUACIÓ" | null = null;
  let curs: number | null = null;
  let quad: 1 | 2 | null = null;

  const metadataRegex =
    /Period(?:e)?\s*[:\s]\s*(.*?)[,;]\s*Curs\s*[:\s]\s*(.*?)[,;]\s*Q(?:uad(?:rimestre)?)?\s*[:\s]\s*(\d+)/i;
  const simpleMetadataRegex =
    /(PARCIAL(?:S)?|FINAL(?:S)?|REAVALUACIÓ(?:NS)?)[-\s]+(\d{4})[-\s]+(\d)/i;

  const metaMatch = rowString.match(metadataRegex);
  const simpleMatch = rowString.match(simpleMetadataRegex);

  if (metaMatch) {
    tipus = normalizeTipus(metaMatch[1].trim());
    curs = parseInt(metaMatch[2].trim(), 10);
    quad = parseInt(metaMatch[3].trim(), 10) as 1 | 2;
    return { tipus, curs, quad };
  }

  if (simpleMatch) {
    tipus = normalizeTipus(simpleMatch[1].trim());
    curs = parseInt(simpleMatch[2], 10);
    quad = parseInt(simpleMatch[3], 10) as 1 | 2;
    return { tipus, curs, quad };
  }

  const upper = rowString.toUpperCase();

  // Tipus
  tipus = normalizeTipus(upper);

  // Quad
  if (upper.includes("TARDOR") || upper.includes("FALL")) quad = 1;
  if (upper.includes("PRIMAVERA") || upper.includes("SPRING")) quad = 2;

  // Curs desde nombre de hoja tipo 2025-1, 2025-2...
  const sheetMatch = sheetName.match(/(\d{4})-(\d)/);
  if (sheetMatch) {
    curs = parseInt(sheetMatch[1], 10);
    if (!quad) {
      const q = parseInt(sheetMatch[2], 10);
      if (q === 1 || q === 2) quad = q as 1 | 2;
    }
  }

  // Curs desde texto libre si aparece un año
  if (!curs) {
    const yearMatch = upper.match(/\b(20\d{2})\b/);
    if (yearMatch) curs = parseInt(yearMatch[1], 10);
  }

  return { tipus, curs, quad };
};

export async function importExcelCalendar(
  file: File,
  existingSubjects: Subject[]
): Promise<ImportedCalendarData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellStyles: true });

        const allSubjects = [...existingSubjects];

        const result: ImportedCalendarData = {
          periods: [],
          slotsPerPeriod: {},
          assignedPerPeriod: {},
          roomsData: {},
          subjects: allSubjects,
        };

        let periodCounter = 1;

        const getOrCreateSubject = (
          code: string,
          displayName: string,
          italic: boolean
        ): string => {
          const existing = allSubjects.find((s) => s.codi === code);
          if (existing) {
            if (displayName && !existing.displayName) existing.displayName = displayName;
            if (italic && existing.displayItalic !== true) existing.displayItalic = true;
            return existing.id;
          }

          const safeDisplay = (displayName || "").replace(/\s+/g, " ").trim();

          const newSub: Subject = {
            id: crypto.randomUUID(),
            codi: code,
            sigles: `SUB_${code}`,
            curs: "1",
            quadrimestre: 1,
            displayName: safeDisplay || undefined,
            displayItalic: italic || undefined,
          };

          allSubjects.push(newSub);
          return newSub.id;
        };

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];

          const isCellItalic = (r: number, c: number): boolean => {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            const cell = (sheet as any)[cellRef];
            return !!cell?.s?.font?.italic;
          };

          const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          let currentPeriod: Period | null = null;
          let currentWeekDates: (Date | null)[] = [];
          let currentSlotIndex = -1;

          for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;

            const firstCell = (row[0] || "").toString().trim();
            const rowString = row
              .map((cell) => (cell == null ? "" : String(cell)))
              .join(" ")
              .trim();

            // 1) Detectar nuevo período por fila técnica o por encabezados humanos
            const inferred = inferPeriodFromRow(rowString, sheetName);

            if (inferred.tipus && inferred.curs && inferred.quad) {
              const maybeExisting = result.periods.find(
                (p) =>
                  p.tipus === inferred.tipus &&
                  p.curs === inferred.curs &&
                  p.quad === inferred.quad
              );

              if (maybeExisting) {
                currentPeriod = maybeExisting;
              } else {
                const newPeriod: Period = {
                  id: periodCounter++,
                  label: `Period ${periodCounter - 1}`,
                  tipus: inferred.tipus,
                  curs: inferred.curs,
                  quad: inferred.quad,
                  startStr: "",
                  endStr: "",
                  blackouts: [],
                };

                currentPeriod = newPeriod;
                result.periods.push(newPeriod);
                result.slotsPerPeriod[newPeriod.id] = [];
                result.assignedPerPeriod[newPeriod.id] = {};
                result.roomsData[newPeriod.id] = {};
              }

              currentWeekDates = [];
              currentSlotIndex = -1;
              continue;
            }

            // 2) Detectar fila de fechas
            const validDatesInRow: { col: number; date: Date }[] = [];

            for (let c = 1; c < row.length; c++) {
              const cellVal = row[c];

              if (typeof cellVal === "string" || typeof cellVal === "number") {
                let date: Date | undefined;

                if (typeof cellVal === "number") {
                  date = new Date(Math.round((cellVal - 25569) * 86400 * 1000));
                } else {
                  const parsed = parseFlexibleDate(cellVal.trim());
                  if (parsed) date = parsed;
                }

                if (date && isValid(date)) {
                  validDatesInRow.push({ col: c, date });
                }
              }
            }

            if (validDatesInRow.length >= 2) {
              currentWeekDates = new Array(row.length).fill(null);
              validDatesInRow.forEach((item) => {
                currentWeekDates[item.col] = item.date;
              });

              if (currentPeriod) {
                const rowDates = validDatesInRow.map((d) => d.date);
                const minDate = new Date(Math.min(...rowDates.map((d) => d.getTime())));
                const maxDate = new Date(Math.max(...rowDates.map((d) => d.getTime())));

                if (
                  !currentPeriod.startStr ||
                  minDate < new Date(currentPeriod.startStr)
                ) {
                  currentPeriod.startStr = format(minDate, "yyyy-MM-dd");
                }
                if (
                  !currentPeriod.endStr ||
                  maxDate > new Date(currentPeriod.endStr)
                ) {
                  currentPeriod.endStr = format(maxDate, "yyyy-MM-dd");
                }
              }

              currentSlotIndex = -1;
              continue;
            }

            // 3) Detectar franja horaria
            let timeCell = firstCell;
            let allTimes = timeCell.match(/(\d{1,2}[:.]\d{2})/g);

            if ((!allTimes || allTimes.length < 2) && row.length > 1) {
              const secondCell = (row[1] || "").toString().trim();
              const secondTimes = secondCell.match(/(\d{1,2}[:.]\d{2})/g);
              if (secondTimes && secondTimes.length >= 2) {
                timeCell = secondCell;
                allTimes = secondTimes;
              }
            }

            if (allTimes && allTimes.length >= 2 && currentPeriod) {
              const start = allTimes[0].replace(".", ":");
              const end = allTimes[1].replace(".", ":");

              let slotIndex = result.slotsPerPeriod[currentPeriod.id].findIndex(
                (s) => s.start === start && s.end === end
              );

              if (slotIndex === -1) {
                const newSlot: TimeSlot = { start, end };
                result.slotsPerPeriod[currentPeriod.id].push(newSlot);
                slotIndex = result.slotsPerPeriod[currentPeriod.id].length - 1;
              }

              currentSlotIndex = slotIndex;
            }

            // 4) Procesar asignaturas
            if (currentPeriod && currentSlotIndex !== -1) {
              for (let c = 1; c < row.length; c++) {
                const cellContent = (row[c] || "").toString();
                if (!cellContent.trim()) continue;

                const date = currentWeekDates[c];
                if (!date) continue;

                const dateIso = format(date, "yyyy-MM-dd");
                const key = `${dateIso}|${currentSlotIndex}`;

                const subjectsFound = parseCellSubjects(cellContent);
                if (!subjectsFound.length) continue;

                const italic = isCellItalic(r, c);

                for (const subj of subjectsFound) {
                  const subjectId = getOrCreateSubject(subj.code, subj.name, italic);

                  if (!result.assignedPerPeriod[currentPeriod.id][key]) {
                    result.assignedPerPeriod[currentPeriod.id][key] = [];
                  }

                  if (
                    !result.assignedPerPeriod[currentPeriod.id][key].includes(subjectId)
                  ) {
                    result.assignedPerPeriod[currentPeriod.id][key].push(subjectId);
                  }
                }
              }
            }
          }
        }

        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    reader.readAsArrayBuffer(file);
  });
}
