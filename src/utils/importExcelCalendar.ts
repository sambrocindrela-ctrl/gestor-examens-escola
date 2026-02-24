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
                const getOrCreateSubject = (code: string, cellContent: string): string => {
                    const existing = allSubjects.find((s) => s.codi === code);
                    if (existing) return existing.id;

                    // Simple rule: Everything BEFORE the code is the name, everything AFTER is discarded
                    const parts = cellContent.split(code);
                    let name = parts[0]
                        .replace(/\r?\n/g, " ") // Replace newlines with spaces
                        .replace(/\s+/g, " ")   // Collapse multiple spaces
                        .trim();

                    if (!name) name = `Assignatura ${code}`;

                    const newSub: Subject = {
                        id: crypto.randomUUID(),
                        codi: code,
                        sigles: name, // Use name as sigles since nom doesn't exist
                        curs: "1", // Default
                        quadrimestre: 1, // Default
                    };
                    allSubjects.push(newSub);
                    console.log(`[Import] Created subject: ${name} (${code})`);
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

                            // Split cell content by newlines to handle multiple subjects per cell
                            const lines = cellContent.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l);
                            console.log(`[Import] Cell ${c} has ${lines.length} lines`);

                            for (const line of lines) {
                                // Find Subject Code in this line
                                const codeMatch = line.match(/230\d{3,4}/);
                                if (codeMatch) {
                                    const code = codeMatch[0];
                                    const subjectId = getOrCreateSubject(code, line);

                                    if (!result.assignedPerPeriod[currentPeriod.id][key]) {
                                        result.assignedPerPeriod[currentPeriod.id][key] = [];
                                    }
                                    if (!result.assignedPerPeriod[currentPeriod.id][key].includes(subjectId)) {
                                        result.assignedPerPeriod[currentPeriod.id][key].push(subjectId);
                                    }

                                    console.log(`[Import] ✓ Assigned ${code} to ${dateIso} slot ${currentSlotIndex}`);
                                } else {
                                    console.log(`[Import] Cell ${c}, line: "${line}" - No code found`);
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
