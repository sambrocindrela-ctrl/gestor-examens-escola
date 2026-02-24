// src/utils/exporters.ts
import * as XLSX from "xlsx-js-style";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";
import {
  format,
  addDays,
  subDays,
  isBefore,
  isAfter,
  startOfDay,
  parseISO,
} from "date-fns";

import type {
  Period,
  Subject,
  SlotsPerPeriod,
  AssignedPerPeriod,
  RoomsDataPerPeriod,
  RoomsMapPerCell,
  RoomsEnroll,
} from "../types/examPlanner";

/* Helpers de dates, iguals que al component */

function mondayOfWeek(d: Date) {
  const day = d.getDay(); // 0=dg … 6=ds
  const diff = (day + 6) % 7; // 0 si dilluns
  return startOfDay(subDays(d, diff));
}

function fridayOfWeek(d: Date) {
  const mon = mondayOfWeek(d);
  return startOfDay(addDays(mon, 4));
}

function* eachWeek(mondayStart: Date, fridayEnd: Date) {
  let cur = new Date(mondayStart);
  while (!isAfter(cur, fridayEnd)) {
    const mon = new Date(cur);
    const fri = addDays(mon, 4);
    yield { mon, fri };
    cur = addDays(mon, 7);
  }
}

function fmtDM(d: Date) {
  return format(d, "dd/MM");
}

function iso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function isDisabledDay(d: Date, p: Period) {
  const sd = parseISO(p.startStr);
  const ed = parseISO(p.endStr);
  const outside = isBefore(d, sd) || isAfter(d, ed);
  if (outside) return true;
  const bl = p.blackouts ?? [];
  return bl.includes(iso(d));
}

/* Inferència (per si falta curs/quad) */

function inferCursFromDate(d: Date): string {
  const y = d.getFullYear(),
    m = d.getMonth() + 1;
  return (m >= 9 ? y : y - 1).toString(); // curs = any d'inici
}

function inferQuadFromDate(d: Date): 1 | 2 {
  const m = d.getMonth() + 1;
  return m >= 9 || m === 1 ? 1 : 2; // set–gen: Q1; feb–jul: Q2
}

/* ---------- JSON ---------- */

export function exportPlannerJSON(args: {
  periods: Period[];
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  subjects: Subject[];
  roomsData: RoomsDataPerPeriod;
  allowedPeriodsBySubject: Record<string, number[]>;
  hiddenSubjectIds: string[];
}) {
  const {
    periods,
    slotsPerPeriod,
    assignedPerPeriod,
    subjects,
    roomsData,
    allowedPeriodsBySubject,
    hiddenSubjectIds,
  } = args;

  const data = {
    periods,
    slotsPerPeriod,
    assignedPerPeriod,
    subjects,
    roomsData,
    allowedPeriodsBySubject,
    hiddenSubjectIds,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "planificador-examens.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- CSV ---------- */

export function exportPlannerCSV(args: {
  periods: Period[];
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  subjects: Subject[];
}) {
  const { periods, slotsPerPeriod, assignedPerPeriod, subjects } = args;

  const lines: string[] = [];
  for (const p of periods) {
    const slots = slotsPerPeriod[p.id] ?? [];
    const amap = assignedPerPeriod[p.id] ?? {};
    for (const { mon } of eachWeek(
      mondayOfWeek(parseISO(p.startStr)),
      fridayOfWeek(parseISO(p.endStr))
    )) {
      for (let i = 0; i < 5; i++) {
        const day = addDays(mon, i);
        if (isDisabledDay(day, p)) continue;
        const dateIso = iso(day);
        for (let si = 0; si < slots.length; si++) {
          const key = `${dateIso}|${si}`;
          const ids = amap[key] ?? [];
          if (!ids.length) continue;
          for (const id of ids) {
            const s = subjects.find((x) => x.id === id);
            if (!s) continue;
            const CENTRE = "230";
            const CURS =
              s.curs?.toString() ??
              String(p.curs ?? inferCursFromDate(day));
            const QUADRIMESTRE = String(
              s.quadrimestre ?? p.quad ?? inferQuadFromDate(day)
            );
            const TIPUS_EXAMEN =
              p.tipus === "REAVALUACIÓ" ? "REAVALUACIO" : p.tipus;
            const DIA = format(day, "dd-MM-yyyy");
            const HORA_INICI = slots[si].start;
            const HORA_FI = slots[si].end;
            const UNITAT_DOCENT = s.codi;
            const GRUPS = "";
            lines.push(
              [
                CENTRE,
                CURS,
                QUADRIMESTRE,
                TIPUS_EXAMEN,
                DIA,
                HORA_INICI,
                HORA_FI,
                UNITAT_DOCENT,
                GRUPS,
              ].join(",")
            );
          }
        }
      }
    }
  }
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "examens_export.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Helpers per Excel/Word ---------- */

function formatSubjectForCell(s: Subject, extra?: RoomsEnroll): string {
  const lines: string[] = [];

  lines.push(`${s.codi} · ${s.sigles}`);

  const extraLines: string[] = [];
  if (s.nivell) extraLines.push(s.nivell);
  if (s.MET) extraLines.push(s.MET);
  if (s.MATT) extraLines.push(s.MATT);
  if (s.MEE) extraLines.push(s.MEE);
  if (s.MCYBERS) extraLines.push(s.MCYBERS);
  if (extraLines.length) lines.push(extraLines.join(" · "));

  if (extra) {
    const hasRooms = extra.rooms && extra.rooms.length > 0;
    const hasStud =
      typeof extra.students === "number" && Number.isFinite(extra.students);

    if (hasRooms || hasStud) {
      if (hasRooms) {
        lines.push(`Aules/Rooms: ${extra.rooms.join(", ")}`);
      }
      if (hasStud) {
        lines.push(`Estudiants/Students: ${extra.students}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Determine cell background color based on slot start time
 * Returns RGB hex color without the # prefix
 */
function getSlotColor(slotStart: string, isDisabled: boolean = false): string {
  if (isDisabled) {
    // Colour for days with no exam: #D9D9D9
    return "D9D9D9";
  }

  // Parse time (format: "HH:mm")
  const [hoursStr, minutesStr] = slotStart.split(":");
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  const totalMinutes = hours * 60 + minutes;

  // Time thresholds in minutes
  const time11_00 = 11 * 60; // 11:00
  const time10_50 = 10 * 60 + 50; // 10:50
  const time14_00 = 14 * 60; // 14:00
  const time13_59 = 13 * 60 + 59; // 13:59
  const time17_00 = 17 * 60; // 17:00

  // First slot in the morning (beginning before 11:00 h): #FFFFCC
  if (totalMinutes < time11_00) {
    return "FFFFCC";
  }
  // Second slot in the morning (beginning after 10:50 h and before 14:00 h): #FFFF99
  else if (totalMinutes > time10_50 && totalMinutes < time14_00) {
    return "FFFF99";
  }
  // First slot in the afternoon (beginning after 13:59 h and before 17:00 h): #DBE4F0
  else if (totalMinutes > time13_59 && totalMinutes < time17_00) {
    return "DBE4F0";
  }
  // Second slot in the afternoon (beginning at 17:00 h or later): #B9CDE5
  else if (totalMinutes >= time17_00) {
    return "B9CDE5";
  }

  // Default fallback (shouldn't happen with normal schedules)
  return "FFFFFF";
}

function buildSubjectParagraphsForWord(
  s: Subject,
  extra?: RoomsEnroll
): Paragraph[] {
  const paras: Paragraph[] = [];

  paras.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${s.codi} · ${s.sigles}`,
          bold: true,
        }),
      ],
    })
  );

  if (s.nivell) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: `Nivell: ${s.nivell}` })],
      })
    );
  }

  if (s.MATT) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: s.MATT, color: "0000FF" })],
      })
    );
  }

  if (s.MET) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: s.MET })],
      })
    );
  }

  if (s.MCYBERS) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: s.MCYBERS, color: "008000" })],
      })
    );
  }

  if (s.MEE) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ text: s.MEE, color: "FF0000" })],
      })
    );
  }

  if (extra?.rooms && extra.rooms.length > 0) {
    paras.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Aules/Rooms: ", bold: true }),
          new TextRun({ text: extra.rooms.join(", ") }),
        ],
      })
    );
  }

  if (
    extra &&
    typeof extra.students === "number" &&
    Number.isFinite(extra.students)
  ) {
    paras.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Estudiants/Students: ", bold: true }),
          new TextRun({ text: String(extra.students) }),
        ],
      })
    );
  }

  return paras;
}

/* ---------- Excel ---------- */

export function exportPlannerExcel(args: {
  periods: Period[];
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  subjects: Subject[];
  roomsData: RoomsDataPerPeriod;
}) {
  const { periods, slotsPerPeriod, assignedPerPeriod, subjects, roomsData } =
    args;

  try {
    const wb = XLSX.utils.book_new();

    const dayLabelsCat = ["Dl", "Dt", "Dc", "Dj", "Dv"];
    const dayLabelsEn = ["Mon", "Tue", "Wed", "Thu", "Fri"];

    for (const p of periods) {
      const slots = slotsPerPeriod[p.id] ?? [];
      if (!slots.length) continue;

      const amap = assignedPerPeriod[p.id] ?? {};
      const roomsForPeriod = roomsData[p.id] ?? {};
      const rows: any[][] = [];
      const slotIndexPerRow: number[] = [];
      const weekStartPerRow: (Date | null)[] = [];

      const start = mondayOfWeek(parseISO(p.startStr));
      const end = fridayOfWeek(parseISO(p.endStr));
      let weekStart = start;

      while (weekStart <= end) {
        if (rows.length > 0) {
          rows.push([]);
          slotIndexPerRow.push(-1);
          weekStartPerRow.push(null);
        }

        const headerWeek: any[] = ["Franja horària / Time slot"];
        for (let di = 0; di < 5; di++) {
          const day = addDays(weekStart, di);
          headerWeek.push(
            `${dayLabelsCat[di]}/${dayLabelsEn[di]} ${format(day, "dd/MM")}`
          );
        }
        rows.push(headerWeek);
        slotIndexPerRow.push(-1);
        weekStartPerRow.push(null);

        // Track merges: { s: {r, c}, e: {r, c} }
        const merges: any[] = [];
        // We need to know the current row index in 'rows' to calculate absolute merge ranges
        // header is at rows.length - 1. First data row will be at rows.length.

        slots.forEach((slot, si) => {
          // 1. Calculate max subjects for this slot across the 5 days
          let maxSubjects = 1;
          const subjectsByDay: Subject[][] = [];

          for (let di = 0; di < 5; di++) {
            const day = addDays(weekStart, di);
            if (isDisabledDay(day, p)) {
              subjectsByDay.push([]);
              continue;
            }
            const dateIso = format(day, "yyyy-MM-dd");
            const key = `${dateIso}|${si}`;
            const ids = amap[key] ?? [];
            const list = ids
              .map((id) => subjects.find((s) => s.id === id))
              .filter(Boolean) as Subject[];
            subjectsByDay.push(list);
            if (list.length > maxSubjects) {
              maxSubjects = list.length;
            }
          }

          const startRowIdx = rows.length;

          // 2. Generate rows
          for (let r = 0; r < maxSubjects; r++) {
            const row: any[] = [];

            // Time slot column
            if (r === 0) {
              row.push(`${slot.start}-${slot.end}`);
            } else {
              row.push(""); // Empty for subsequent rows (will be merged)
            }

            // Day columns
            for (let di = 0; di < 5; di++) {
              const list = subjectsByDay[di];
              const s = list[r]; // Subject for this row

              if (s) {
                const day = addDays(weekStart, di);
                const dateIso = format(day, "yyyy-MM-dd");
                const key = `${dateIso}|${si}`;
                const roomsMap: RoomsMapPerCell = roomsForPeriod[key] ?? {};
                row.push(formatSubjectForCell(s, roomsMap[s.id]));
              } else {
                row.push("");
              }
            }

            rows.push(row);
            slotIndexPerRow.push(si);
            weekStartPerRow.push(weekStart);
          }

          const endRowIdx = rows.length - 1;

          // 3. Calculate Merges

          // Merge Time Slot Column
          if (maxSubjects > 1) {
            merges.push({
              s: { r: startRowIdx, c: 0 },
              e: { r: endRowIdx, c: 0 },
            });
          }

          // Merge Day Columns if needed
          for (let di = 0; di < 5; di++) {
            const list = subjectsByDay[di];
            // If there is exactly 1 subject and we have multiple rows, merge them all
            // so the subject fills the whole slot height.
            if (list.length === 1 && maxSubjects > 1) {
              merges.push({
                s: { r: startRowIdx, c: di + 1 }, // +1 because col 0 is time slot
                e: { r: endRowIdx, c: di + 1 },
              });
            }
          }
        });

        weekStart = addDays(weekStart, 7);

        // Store merges for this week block to be added to the sheet later
        // But wait, 'ws' is created after the loop. We need to store these merges somewhere.
        // The current structure creates 'rows' for ALL weeks then makes the sheet.
        // So we can just push these merges to a global list if we adjust row indices,
        // OR we can attach them to the sheet at the end.
        // Since 'rows' grows, 'startRowIdx' is correct relative to the final sheet.
        // We just need to pass these merges out.
        // Let's attach them to a temporary property on 'rows' or similar? 
        // No, let's just collect them in a variable outside the loop.
        (rows as any)._merges = (rows as any)._merges || [];
        (rows as any)._merges.push(...merges);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Apply merges
      if ((rows as any)._merges) {
        ws["!merges"] = (rows as any)._merges;
      }

      const range = XLSX.utils.decode_range(ws["!ref"] as string);

      const cols: any[] = [{ wch: 20 }];
      for (let i = 0; i < 5; i++) cols.push({ wch: 40 });
      (ws as any)["!cols"] = cols;


      for (let r = 0; r <= range.e.r; r++) {
        if (slotIndexPerRow[r] !== -1) continue;
        const first = rows[r]?.[0];
        if (first !== "Franja horària / Time slot") continue;
        for (let c = 0; c <= 5; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = (ws as any)[addr];
          if (!cell) continue;
          cell.s = {
            font: { bold: true },
            alignment: { horizontal: "center" },
            fill: { fgColor: { rgb: "E0E0E0" } },
          };
        }
      }

      for (let r = 0; r <= range.e.r; r++) {
        const si = slotIndexPerRow[r];
        if (si < 0) continue;
        // We need to find the slot object. 
        // slotIndexPerRow gives us the index in the 'slots' array.
        // But 'slots' variable is local to the loop above.
        // We can retrieve it from slotsPerPeriod[p.id][si].
        const slot = slotsPerPeriod[p.id]?.[si];
        if (!slot) continue;

        const rowWeekStart = weekStartPerRow[r];
        if (!rowWeekStart) continue;

        // Determine borders based on slot block
        const isStartOfSlot = r === 0 || slotIndexPerRow[r - 1] !== si;
        const isEndOfSlot = r === range.e.r || slotIndexPerRow[r + 1] !== si;

        const borderStyle = {
          top: isStartOfSlot ? { style: "thin", color: { rgb: "000000" } } : undefined,
          bottom: isEndOfSlot ? { style: "thin", color: { rgb: "000000" } } : undefined,
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        };

        for (let c = 1; c <= 5; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = (ws as any)[addr];
          // Even if cell is empty (created by aoa_to_sheet), we might want to style it
          // if it's part of the slot block.
          // aoa_to_sheet might not create keys for empty cells at the end of rows, 
          // but we filled them with "".

          const cellObj = cell || { t: 's', v: '' };
          if (!cell) (ws as any)[addr] = cellObj;

          // Determine if this day is disabled
          const di = c - 1; // column index to day index (0-4)
          const day = addDays(rowWeekStart, di);
          const isDisabled = isDisabledDay(day, p);

          // Get color based on slot start time
          const color = getSlotColor(slot.start, isDisabled);

          const existing = cellObj.s ?? {};
          cellObj.s = {
            ...existing,
            alignment: {
              vertical: "top", // Always top, unless merged? 
              // If merged (1 subject), center vertical might be nicer, but user didn't specify.
              // "fills the whole slot" implies visual fill. Top alignment is safer for text.
              wrapText: true,
              ...(existing.alignment || {}),
            },
            fill: { fgColor: { rgb: color } },
            border: borderStyle
          };
        }

        // Style the Time Slot column (col 0)
        const addr0 = XLSX.utils.encode_cell({ r, c: 0 });
        const cell0 = (ws as any)[addr0];
        if (cell0) {
          const existing = cell0.s ?? {};
          cell0.s = {
            ...existing,
            alignment: { vertical: "center", horizontal: "center" },
            border: borderStyle
          };
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, `${p.tipus}_id${p.id}`);
    }

    const wbout = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true,
    });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "calendari_examens.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error("Error exportant l'Excel", err);
    alert(
      "No s'ha pogut exportar l'Excel. Revisa la consola del navegador per a més detalls."
    );
  }
}

/* ---------- Word ---------- */

export async function exportPlannerWord(args: {
  periods: Period[];
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  subjects: Subject[];
  roomsData: RoomsDataPerPeriod;
}) {
  const { periods, slotsPerPeriod, assignedPerPeriod, subjects, roomsData } =
    args;

  try {
    const dayLabelsCat = ["Dl", "Dt", "Dc", "Dj", "Dv"];
    const dayLabelsEn = ["Mon", "Tue", "Wed", "Thu", "Fri"];

    const sectionChildren: (Paragraph | Table)[] = [];

    for (const p of periods) {
      const slots = slotsPerPeriod[p.id] ?? [];
      if (!slots.length) continue;

      const amap = assignedPerPeriod[p.id] ?? {};
      const roomsForPeriod = roomsData[p.id] ?? {};

      sectionChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${p.label} — ${p.tipus}`,
              bold: true,
              size: 28,
            }),
          ],
          spacing: { before: 200, after: 200 },
        })
      );

      const start = mondayOfWeek(parseISO(p.startStr));
      const end = fridayOfWeek(parseISO(p.endStr));
      let weekStart = start;

      while (weekStart <= end) {
        sectionChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Setmana ${fmtDM(weekStart)} — ${fmtDM(
                  addDays(weekStart, 4)
                )}`,
                bold: true,
              }),
            ],
            spacing: { before: 200, after: 100 },
          })
        );

        const rows: TableRow[] = [];

        const headerCells: TableCell[] = [];
        headerCells.push(
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Franja horària / Time slot",
                    bold: true,
                  }),
                ],
              }),
            ],
          })
        );

        for (let di = 0; di < 5; di++) {
          const day = addDays(weekStart, di);
          const label = `${dayLabelsCat[di]}/${dayLabelsEn[di]} ${fmtDM(day)}`;
          headerCells.push(
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: label, bold: true })],
                }),
              ],
            })
          );
        }

        rows.push(new TableRow({ children: headerCells }));

        slots.forEach((slot, si) => {
          const rowCells: TableCell[] = [];

          rowCells.push(
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${slot.start}-${slot.end}`,
                      bold: true,
                    }),
                  ],
                }),
              ],
            })
          );

          for (let di = 0; di < 5; di++) {
            const day = addDays(weekStart, di);

            if (isDisabledDay(day, p)) {
              const color = getSlotColor(slot.start, true);
              rowCells.push(
                new TableCell({
                  children: [new Paragraph({ text: "" })],
                  shading: {
                    type: ShadingType.SOLID,
                    color: color,
                    fill: color,
                  },
                })
              );
              continue;
            }

            const dateIso = iso(day);
            const key = `${dateIso}|${si}`;
            const ids = amap[key] ?? [];
            const list = ids
              .map((id) => subjects.find((s) => s.id === id))
              .filter(Boolean) as Subject[];

            const extrasCell = roomsForPeriod[key] ?? {};

            const cellParas: Paragraph[] = [];

            list.forEach((s, idx) => {
              const extra = extrasCell[s.id];
              const subjectParas = buildSubjectParagraphsForWord(s, extra);
              cellParas.push(...subjectParas);
              if (idx < list.length - 1) {
                cellParas.push(new Paragraph({ text: "" }));
              }
            });

            if (!cellParas.length) {
              cellParas.push(new Paragraph({ text: "" }));
            }

            // Get color based on slot start time
            const color = getSlotColor(slot.start, false);

            rowCells.push(
              new TableCell({
                children: cellParas,
                shading: {
                  type: ShadingType.SOLID,
                  color: color,
                  fill: color,
                },
              })
            );
          }

          rows.push(new TableRow({ children: rowCells }));
        });

        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2 },
            bottom: { style: BorderStyle.SINGLE, size: 2 },
            left: { style: BorderStyle.SINGLE, size: 2 },
            right: { style: BorderStyle.SINGLE, size: 2 },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
            insideVertical: { style: BorderStyle.SINGLE, size: 1 },
          },
        });

        sectionChildren.push(table);

        weekStart = addDays(weekStart, 7);
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: sectionChildren,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "calendari_examens.docx";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    console.error("Error exportant el Word", err);
    alert(
      "No s'ha pogut exportar el Word. Revisa la consola del navegador per a més detalls."
    );
  }
}

/* ---------- TXT ---------- */

export function exportPlannerTXT(args: {
  periods: Period[];
  slotsPerPeriod: SlotsPerPeriod;
  assignedPerPeriod: AssignedPerPeriod;
  subjects: Subject[];
}) {
  const { periods, slotsPerPeriod, assignedPerPeriod, subjects } = args;

  const LEN = {
    CODI: 10,
    CURS: 4,
    QUAD: 1,
    NOM: 120,
    DIA: 10,
    HORA: 5,
    DESC: 2000,
  } as const;

  const padText = (v: string, len: number) => {
    const s = (v ?? "").toString();
    return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
  };

  const padNum = (v: number | string | undefined, len: number) => {
    const s = (v ?? "").toString();
    return s.length >= len ? s.slice(0, len) : " ".repeat(len - s.length) + s;
  };

  const lines: string[] = [];
  for (const p of periods) {
    const slots = slotsPerPeriod[p.id] ?? [];
    const amap = assignedPerPeriod[p.id] ?? {};
    for (const { mon } of eachWeek(
      mondayOfWeek(parseISO(p.startStr)),
      fridayOfWeek(parseISO(p.endStr))
    )) {
      for (let i = 0; i < 5; i++) {
        const day = addDays(mon, i);
        if (isDisabledDay(day, p)) continue;
        for (let si = 0; si < slots.length; si++) {
          const ids = amap[`${iso(day)}|${si}`] ?? [];
          if (!ids.length) continue;
          for (const id of ids) {
            const s = subjects.find((x) => x.id === id);
            if (!s) continue;

            const CODI = padText(s.codi, LEN.CODI);
            const CURS = padNum(
              s.curs ?? String(p.curs ?? inferCursFromDate(day)),
              LEN.CURS
            );
            const QUAD = padNum(
              s.quadrimestre ?? p.quad ?? inferQuadFromDate(day),
              LEN.QUAD
            );
            const NOM = padText(s.sigles, LEN.NOM);
            const DIA = padText(format(day, "dd-MM-yyyy"), LEN.DIA);
            const HORA = padText(
              (slots[si].start || "").replace(":", "-"),
              LEN.HORA
            );
            const DESC = padText(
              p.tipus === "REAVALUACIÓ" ? "REAVALUACIO" : p.tipus,
              LEN.DESC
            );

            lines.push([CODI, CURS, QUAD, NOM, DIA, HORA, DESC].join(" "));
          }
        }
      }
    }
  }

  const txt = lines.join("\n");
  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "examens_export.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}

