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

  // Líneas que NO son nombre (aulas, students, etc.)
  const garbageLineRegex =
    /^(?:Aula|Aules|Classroom|Laboratory|Laboratori|Students|Matriculats|Estudiants)\b/i;

  // Elimina basura dentro de una línea (p.ej. "... Classroom A101")
  const inlineGarbageRegex =
    /\b(?:Aula|Aules|Classroom|Laboratory|Laboratori)\b.*$/i;

  for (const line of lines) {
    const cleaned = line.replace(inlineGarbageRegex, "").trim();

    // Si es línea de basura, ignórala
    if (!cleaned || garbageLineRegex.test(cleaned)) continue;

    const codeMatch = cleaned.match(/230\d{3,4}/);
    if (codeMatch) {
      const code = codeMatch[0];

      // Todo lo que quede en esa línea, sin el código, puede formar parte del nombre
      const withoutCode = cleaned.replace(code, "").trim();
      if (withoutCode && !garbageLineRegex.test(withoutCode)) {
        currentNameBuffer.push(withoutCode);
      }

      const name = currentNameBuffer.join(" ").replace(/\s+/g, " ").trim();
      found.push({ code, name });

      // reset buffer para siguiente asignatura dentro de la misma celda
      currentNameBuffer = [];
    } else {
      // no hay code: es nombre (posiblemente en líneas previas al code)
      currentNameBuffer.push(cleaned);
    }
  }

  return found;
};


export async function importExcelCalendar(
    file: File,
    existingSubjects: Subject[]
): Promise<ImportedCalendarData> {
    console.log("!!! IMPORT EXCEL CALENDAR - UPDATED VERSION (Step 1507) !!!");
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const isCellItalic = (r: number, c: number): boolean => {
                // rows está 0-based, XLSX refs son 1-based
                const cellRef = XLSX.utils.encode_cell({ r, c });
                const cell = (sheet as any)[cellRef];
                return !!cell?.s?.font?.italic;
                };

                const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                // Clone existing subjects to avoid mutating prop directly until ready
                const allSubjects = [...existingSubjects];

                const result: ImportedCalendarData = {
                    periods: [],
                    slotsPerPeriod: {},
                    assignedPerPeriod: {},
                    roomsData: {},
                    subjects: allSubjects,
                };

                let currentPeriod: Period | null = null;
                let currentWeekDates: Date[] = [];
                let periodCounter = 1;
                let currentSlotIndex = -1; // Track current slot across rows


                // Helper to find or create subject
const getOrCreateSubject = (code: string, displayName: string, italic: boolean): string => {
  const existing = allSubjects.find((s) => s.codi === code);
  if (existing) {
    if (displayName && !existing.displayName) existing.displayName = displayName;
    if (italic && existing.displayItalic !== true) existing.displayItalic = true;
    return existing.id;
  }

  const safeDisplay = displayName?.replace(/\s+/g, " ").trim();

  const newSub: Subject = {
    id: crypto.randomUUID(),
    codi: code,
    sigles: `SUB_${code}`, // o code
    curs: "1",
    quadrimestre: 1,
    displayName: safeDisplay || undefined,
    displayItalic: italic || undefined,
  };

  allSubjects.push(newSub);
  console.log(`[Import] Created subject placeholder: ${code}`);
  return newSub.id;
};

                // Regex for metadata row: "Period: [Tipus], Curs: [Curs], Q: [Quad]"
                const metadataRegex = /Period(?:e)?\s*[:\s]\s*(.*?)[,;]\s*Curs\s*[:\s]\s*(.*?)[,;]\s*Q(?:uad(?:rimestre)?)?\s*[:\s]\s*(\d+)/i;
                // Regex for simple format: "PARCIALS-2025-1" or "FINALS 2025 2"
                const simpleMetadataRegex = /(PARCIAL(?:S)?|FINAL(?:S)?|REAVALUACIÓ(?:NS)?)[-\s]+(\d{4})[-\s]+(\d)/i;

                for (let r = 0; r < rows.length; r++) {
                    const row = rows[r];
                    if (!row || row.length === 0) continue;

                    const firstCell = (row[0] || "").toString().trim();
                    const rowString = row.join(" ");

                    // 1. Check for Metadata Row (New Period)
                    let tipus: any = null;
                    let curs: number | null = null;
                    let quad: 1 | 2 | null = null;

                    const metaMatch = rowString.match(metadataRegex);
                    const simpleMatch = rowString.match(simpleMetadataRegex);

                    if (metaMatch) {
                        tipus = metaMatch[1].trim();
                        curs = parseInt(metaMatch[2].trim(), 10);
                        quad = parseInt(metaMatch[3].trim(), 10) as 1 | 2;
                        console.log(`[Import] Found Metadata (Standard): ${tipus} ${curs}-${quad}`);
                    } else if (simpleMatch) {
                        let rawType = simpleMatch[1].toUpperCase();
                        if (rawType.startsWith("PARCIAL")) tipus = "PARCIAL";
                        else if (rawType.startsWith("FINAL")) tipus = "FINAL";
                        else if (rawType.startsWith("REAVALUACIÓ")) tipus = "REAVALUACIÓ";

                        curs = parseInt(simpleMatch[2], 10);
                        quad = parseInt(simpleMatch[3], 10) as 1 | 2;
                        console.log(`[Import] Found Metadata (Simple): ${tipus} ${curs}-${quad}`);
                    }

                    if (tipus && curs && quad) {
                        // Create new period
                        const newPeriod: Period = {
                            id: periodCounter++,
                            label: `Period ${periodCounter - 1}`,
                            tipus: tipus,
                            curs: isNaN(curs) ? 2025 : curs,
                            quad: quad,
                            startStr: "", // Will be set when we find dates
                            endStr: "",
                            blackouts: [],
                        };
                        currentPeriod = newPeriod;
                        result.periods.push(newPeriod);
                        result.slotsPerPeriod[newPeriod.id] = [];
                        result.assignedPerPeriod[newPeriod.id] = {};
                        result.roomsData[newPeriod.id] = {};
                        continue;
                    }

                    // 2. Check for Date Row (Week Header)
                    let validDatesInRow: { col: number; date: Date }[] = [];
                    for (let c = 1; c < row.length; c++) {
                        const cellVal = row[c];
                        if (typeof cellVal === "string" || typeof cellVal === "number") {
                            let date: Date | undefined;
                            if (typeof cellVal === "number") {
                                date = new Date(Math.round((cellVal - 25569) * 86400 * 1000));
                            } else {
                                const valStr = cellVal.trim();
                                const normalized = valStr.replace(/[.-]/g, "/");
                                const parts = normalized.split("/");
                                if (parts.length === 3) {
                                    date = parse(normalized, "dd/MM/yyyy", new Date());
                                }
                            }

                            if (date && isValid(date)) {
                                validDatesInRow.push({ col: c, date });
                            }
                        }
                    }

                    if (validDatesInRow.length >= 2) {
                        console.log(`[Import] Found Date Row with ${validDatesInRow.length} dates`);
                        currentWeekDates = new Array(row.length).fill(null);
                        validDatesInRow.forEach((item) => {
                            currentWeekDates[item.col] = item.date;
                        });

                        if (currentPeriod) {
                            const rowDates = validDatesInRow.map(d => d.date);
                            const minDate = new Date(Math.min(...rowDates.map(d => d.getTime())));
                            const maxDate = new Date(Math.max(...rowDates.map(d => d.getTime())));

                            if (!currentPeriod.startStr || minDate < new Date(currentPeriod.startStr)) {
                                currentPeriod.startStr = format(minDate, "yyyy-MM-dd");
                            }
                            if (!currentPeriod.endStr || maxDate > new Date(currentPeriod.endStr)) {
                                currentPeriod.endStr = format(maxDate, "yyyy-MM-dd");
                            }
                        }
                        continue;
                    }

                    // 3. Check for Time Slot Row
                    // Robust detection: Find ANY two time strings in the cell
                    // Check first cell AND second cell to be sure
                    let timeCell = firstCell;
                    let allTimes = timeCell.match(/(\d{1,2}[:.]\d{2})/g);

                    // If not found in first cell, try second cell
                    if ((!allTimes || allTimes.length < 2) && row.length > 1) {
                        const secondCell = (row[1] || "").toString().trim();
                        const secondTimes = secondCell.match(/(\d{1,2}[:.]\d{2})/g);
                        if (secondTimes && secondTimes.length >= 2) {
                            timeCell = secondCell;
                            allTimes = secondTimes;
                        }
                    }

                    if (allTimes && allTimes.length >= 2 && currentPeriod) {
                        const start = allTimes[0].replace('.', ':');
                        const end = allTimes[1].replace('.', ':');
                        console.log(`[Import] Found Time Slot: ${start}-${end}`);

                        let slotIndex = result.slotsPerPeriod[currentPeriod.id].findIndex(
                            (s) => s.start === start && s.end === end
                        );

                        if (slotIndex === -1) {
                            const newSlot: TimeSlot = { start, end };
                            result.slotsPerPeriod[currentPeriod.id].push(newSlot);
                            slotIndex = result.slotsPerPeriod[currentPeriod.id].length - 1;
                        }

                        // Update the current slot index for subsequent rows
                        currentSlotIndex = slotIndex;
                    }

                    // 4. Process subject cells if we have a current slot
                    // This processes BOTH the time slot row AND subsequent subject rows
                    if (currentPeriod && currentSlotIndex !== -1) {
                        // Process cells in this row for subjects
                        console.log(`[Import] Processing row ${r}, ${row.length} cells for slot ${currentSlotIndex}`);
                        for (let c = 1; c < row.length; c++) {
                            const cellContent = (row[c] || "").toString();
                            console.log(`[Import] Cell ${c}: "${cellContent.substring(0, 50)}${cellContent.length > 50 ? '...' : ''}"`);
                            if (!cellContent.trim()) continue;

                            const date = currentWeekDates[c];
                            if (!date) {
                                console.log(`[Import] Cell ${c}: No date found for this column`);
                                continue;
                            }

                            const dateIso = format(date, "yyyy-MM-dd");
                            const key = `${dateIso}|${currentSlotIndex}`;

// ✅ Parse subjects in this cell (nombre puede estar en líneas antes del código)
const subjectsFound = parseCellSubjects(cellContent);
if (!subjectsFound.length) continue;

// ✅ Cursiva real de la celda (GEF: inglés en cursiva)
const italic = isCellItalic(r, c);

for (const subj of subjectsFound) {
  const subjectId = getOrCreateSubject(subj.code, subj.name, italic);

  if (!result.assignedPerPeriod[currentPeriod.id][key]) {
    result.assignedPerPeriod[currentPeriod.id][key] = [];
  }
  if (!result.assignedPerPeriod[currentPeriod.id][key].includes(subjectId)) {
    result.assignedPerPeriod[currentPeriod.id][key].push(subjectId);
  }
}
                        }
                    }
                }

                console.log("[Import] Finished processing rows. Periods:", result.periods.length);
                resolve(result);
            } catch (err) {
                console.error("[Import] Error:", err);
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}
