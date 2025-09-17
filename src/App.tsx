// App.tsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * Full Team Dashboard (single-file)
 * - UPDATED DOCX DOWNLOAD: Now downloads as an HTML file that opens in a new tab.
 * - NEW CLOCK-IN FEATURE: "Via" is now prompted to duplicate their clock-in for "Bern."
 * - HIDDEN ADMIN PIN: The PIN is no longer visible in the admin prompt.
 * - REMOVED RECENT CALLS LOG.
 * - ENHANCED DASHBOARD: Includes hourly and daily call totals, and a single-line attendance status.
 *
 * Note: Uses localStorage for persistence (no backend).
 */

/* -------------------- Constants & Helpers -------------------- */
const AGENTS = ["Mel", "Bern", "Via", "Shaira"];
const INVOICE_AGENTS = ["Via", "Bern"];
const FIXED_RATE = 10;
const ADMIN_USER = "Via";
const ADMIN_PIN = "121120";
const BASE_FRIDAY_ISO = "2025-09-19"; // invoice #23 on this Friday
const BASE_INVOICE_NUMBER = 24; // Updated invoice starting number

const LS_KEYS = {
  CALLS: "td_calls_v2",
  ATT: "td_attendance_v1",
  OVERRIDES: "td_hour_overrides_v1",
  COMM: "td_commissions_v1",
  BONUS: "td_bonus_v1",
  INVOICE_OVERRIDE: "td_invoice_override_v1",
  WEEK_START: "td_week_start_v1",
};

type CallRecord = { id: string; agent: string; outcome: string; ts: string };
type AttendanceEvent = {
  id: string;
  agent: string;
  type: "in" | "out";
  ts: string;
};
type HourOverrides = Record<string, Record<string, number>>;

const CALL_OUTCOMES = [
  "APPOINTMENT BOOKED",
  "FOLLOW-UP",
  "NOT INTERESTED",
  "NO ANSWER",
  "BAD-NUMBER",
  "DNC",
  "HUNG-UP",
];

/* Timezone helpers (Phoenix) */
function phoenixNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
}
function startOfWeekPhoenix(date?: Date): Date {
  const d = date ? new Date(date) : phoenixNow();
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
function fridayOfWeekPhoenix(date?: Date): Date {
  const mon = startOfWeekPhoenix(date);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  fri.setHours(23, 59, 59, 999);
  return fri;
}
function isoYmdLocal(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function formatShort(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}
function formatLongDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}

/*
 * FIXED: Dynamic docx + file-saver loader with robust CDN fallback.
 * This ensures the feature works even if packages aren't installed.
 */
async function loadDocxAndSaver() {
  try {
    // @ts-ignore
    const docx = await import("docx");
    // @ts-ignore
    const { saveAs } = await import("file-saver");
    return { docx, saveAs };
  } catch (e) {
    console.warn(
      "Could not import docx/file-saver packages. Attempting to load from CDN..."
    );

    const loadScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () =>
          reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
      });

    if (!(window as any).saveAs) {
      await loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"
      );
    }
    if (!(window as any).docx) {
      await loadScript("https://unpkg.com/docx@8.2.2/build/index.js");
    }

    if ((window as any).docx && (window as any).saveAs) {
      return { docx: (window as any).docx, saveAs: (window as any).saveAs };
    }

    throw new Error("Could not load docx or file-saver from CDN.");
  }
}

/* -------------------- Styling -------------------- */
const S = {
  page: {
    fontFamily: "'Inter', sans-serif",
    background: "#f6f7fb",
    minHeight: "100vh",
    padding: "28px",
    color: "#0f172a",
  } as React.CSSProperties,
  container: { maxWidth: 1200, margin: "0 auto" } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  } as React.CSSProperties,
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 18,
    boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
  } as React.CSSProperties,
  tab: (active = false) =>
    ({
      padding: "8px 12px",
      borderRadius: 8,
      cursor: "pointer",
      fontWeight: 600,
      background: active ? "#eef2ff" : "transparent",
      color: active ? "#3730a3" : "#0f172a",
      border: active ? "1px solid #c7d2fe" : "1px solid transparent",
    } as React.CSSProperties),
  smallInput: {
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid #e6e9ef",
    width: 96,
  } as React.CSSProperties,
  input: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #e6e9ef",
    width: "100%",
  } as React.CSSProperties,
  btnPrimary: {
    background: "#111827",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  btnDanger: {
    background: "#dc2626",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
  } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" } as React.CSSProperties,
  th: {
    textAlign: "left",
    padding: 8,
    borderBottom: "1px solid #eef2f6",
    fontSize: 13,
  } as React.CSSProperties,
  td: {
    padding: 8,
    borderBottom: "1px solid #f5f7fa",
    fontSize: 13,
  } as React.CSSProperties,
  dashboardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  } as React.CSSProperties,
  agentCard: {
    background: "#f8fafc",
    border: "1px solid #eef2f6",
    borderRadius: 12,
    padding: 16,
  } as React.CSSProperties,
  agentCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  } as React.CSSProperties,
  agentName: { fontWeight: 700, fontSize: 18 } as React.CSSProperties,
  lateTag: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
  } as React.CSSProperties,
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    textAlign: "center",
    margin: "16px 0",
  } as React.CSSProperties,
  statValue: { fontSize: 24, fontWeight: 700 } as React.CSSProperties,
  statLabel: { fontSize: 12, color: "#64748b" } as React.CSSProperties,
  tallyButton: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "1px solid #cbd5e0",
    background: "#fff",
    cursor: "pointer",
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties,
  tallyGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: 12,
  } as React.CSSProperties,
  invoicePaper: {
    fontFamily: "'Courier New', Courier, monospace",
    background: "#fff",
    border: "1px solid #e2e8f0",
    padding: "24px",
    borderRadius: 8,
  } as React.CSSProperties,
  invoiceHr: {
    border: 0,
    borderTop: "1px solid #94a3b8",
    margin: "16px 0",
  } as React.CSSProperties,
  invoiceTable: {
    width: "100%",
    fontSize: 14,
    borderCollapse: "collapse",
  } as React.CSSProperties,
  invoiceTableInput: {
    fontFamily: "inherit",
    width: "60px",
    textAlign: "center",
    border: "1px dashed #cbd5e0",
    borderRadius: 4,
    padding: "2px 4px",
  } as React.CSSProperties,
};

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS<T>(key: string, val: T) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

export default function App(): JSX.Element {
  const [selectedAgent, setSelectedAgent] = useState<string>("Via");
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "calls" | "attendance" | "weekly" | "admin"
  >("dashboard");
  const [adminSubTab, setAdminSubTab] = useState<"invoice" | "settings">(
    "invoice"
  );
  const [now, setNow] = useState<Date>(() => phoenixNow());
  useEffect(() => {
    const t = setInterval(() => setNow(phoenixNow()), 5000);
    return () => clearInterval(t);
  }, []);

  const [weekStart, setWeekStart] = useState<Date>(() =>
    loadLS(LS_KEYS.WEEK_START, null)
      ? new Date(loadLS(LS_KEYS.WEEK_START, ""))
      : startOfWeekPhoenix()
  );
  const [calls, setCalls] = useState<CallRecord[]>(() =>
    loadLS<CallRecord[]>(LS_KEYS.CALLS, [])
  );
  const [attendanceEvents, setAttendanceEvents] = useState<AttendanceEvent[]>(
    () => loadLS<AttendanceEvent[]>(LS_KEYS.ATT, [])
  );
  const [overrides, setOverrides] = useState<HourOverrides>(() =>
    loadLS<HourOverrides>(LS_KEYS.OVERRIDES, {})
  );
  const [commissions, setCommissions] = useState<Record<string, number>>(() =>
    loadLS<Record<string, number>>(LS_KEYS.COMM, { Via: 0, Bern: 0 })
  );
  const [bonuses, setBonuses] = useState<Record<string, number>>(() =>
    loadLS<Record<string, number>>(LS_KEYS.BONUS, { Via: 0, Bern: 0 })
  );
  const [invoiceOverride, setInvoiceOverride] = useState<number | null>(() =>
    loadLS<number | null>(LS_KEYS.INVOICE_OVERRIDE, null)
  );

  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinInput, setPinInput] = useState("");

  useEffect(
    () => saveLS(LS_KEYS.WEEK_START, weekStart.toISOString()),
    [weekStart]
  );
  useEffect(() => saveLS(LS_KEYS.CALLS, calls), [calls]);
  useEffect(() => saveLS(LS_KEYS.ATT, attendanceEvents), [attendanceEvents]);
  useEffect(() => saveLS(LS_KEYS.OVERRIDES, overrides), [overrides]);
  useEffect(() => saveLS(LS_KEYS.COMM, commissions), [commissions]);
  useEffect(() => saveLS(LS_KEYS.BONUS, bonuses), [bonuses]);
  useEffect(
    () => saveLS(LS_KEYS.INVOICE_OVERRIDE, invoiceOverride),
    [invoiceOverride]
  );

  const weekDays = useMemo(
    () =>
      Array.from({ length: 5 }).map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return d;
      }),
    [weekStart]
  );
  const invoiceFriday = useMemo(
    () => fridayOfWeekPhoenix(weekStart),
    [weekStart]
  );

  const computedHours = useMemo(() => {
    const res: Record<string, Record<string, number>> = {};
    AGENTS.forEach((agent) => {
      res[agent] = {};
      weekDays.forEach((d) => {
        const key = isoYmdLocal(d);
        if (overrides[agent]?.[key] !== undefined) {
          res[agent][key] = overrides[agent][key];
          return;
        }
        const evs = attendanceEvents
          .filter(
            (e) =>
              e.agent === agent &&
              isoYmdLocal(
                new Date(
                  e.ts.toLocaleString("en-US", { timeZone: "America/Phoenix" })
                )
              ) === key
          )
          .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
        let totalMs = 0;
        let lastIn: Date | null = null;
        evs.forEach((ev) => {
          if (ev.type === "in") lastIn = new Date(ev.ts);
          else if (ev.type === "out" && lastIn) {
            totalMs += new Date(ev.ts).getTime() - lastIn.getTime();
            lastIn = null;
          }
        });
        if (lastIn && isoYmdLocal(now) === key) {
          totalMs += Math.max(0, now.getTime() - lastIn.getTime());
        }
        res[agent][key] = totalMs / 3600000;
      });
    });
    return res;
  }, [attendanceEvents, overrides, weekDays, now]);

  const dashboardStats = useMemo(() => {
    const todayYMD = isoYmdLocal(now);
    return AGENTS.reduce((acc, agent) => {
      const todayEvents = attendanceEvents
        .filter(
          (e) =>
            e.agent === agent &&
            isoYmdLocal(
              new Date(
                e.ts.toLocaleString("en-US", { timeZone: "America/Phoenix" })
              )
            ) === todayYMD
        )
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
      const lastEvent = todayEvents[todayEvents.length - 1];
      const status = lastEvent
        ? lastEvent.type === "in"
          ? "Online"
          : "Offline"
        : "Offline";
      const hoursToday = computedHours[agent]?.[todayYMD] || 0;
      const hoursWeek = weekDays.reduce(
        (sum, day) => sum + (computedHours[agent]?.[isoYmdLocal(day)] || 0),
        0
      );
      const callsToday = calls.filter(
        (c) =>
          c.agent === agent &&
          isoYmdLocal(
            new Date(
              c.ts.toLocaleString("en-US", { timeZone: "America/Phoenix" })
            )
          ) === todayYMD
      ).length;
      const isFriday = now.getDay() === 5;
      const targetHours = isFriday ? 4 : 9;
      const hoursRemaining = Math.max(0, targetHours - hoursToday);
      const firstClockIn = todayEvents.find((e) => e.type === "in");
      let isLate = false;
      if (firstClockIn) {
        const clockInTime = new Date(
          new Date(firstClockIn.ts).toLocaleString("en-US", {
            timeZone: "America/Phoenix",
          })
        );
        const scheduleStart = new Date(clockInTime);
        scheduleStart.setHours(isFriday ? 8 : 7, 0, 0, 0);
        if (clockInTime > scheduleStart) isLate = true;
      }

      const callsThisHour = calls.filter(
        (c) =>
          c.agent === agent &&
          new Date(
            c.ts.toLocaleString("en-US", { timeZone: "America/Phoenix" })
          ).getHours() === now.getHours()
      ).length;

      acc[agent] = {
        status,
        hoursToday,
        hoursWeek,
        callsToday,
        hoursRemaining,
        isLate,
        targetHours,
        callsThisHour,
      };
      return acc;
    }, {} as Record<string, any>);
  }, [attendanceEvents, calls, computedHours, now, weekDays]);
  const callStats = useMemo(() => {
    const todayYMD = isoYmdLocal(now);
    const startOfHour = new Date(now);
    startOfHour.setMinutes(0, 0, 0);
    const agentCallsToday = calls.filter((c) => {
      const callTimePhx = new Date(
        c.ts.toLocaleString("en-US", { timeZone: "America/Phoenix" })
      );
      return c.agent === selectedAgent && isoYmdLocal(callTimePhx) === todayYMD;
    });
    const agentCallsThisHour = agentCallsToday.filter(
      (c) =>
        new Date(
          c.ts.toLocaleString("en-US", { timeZone: "America/Phoenix" })
        ) >= startOfHour
    );
    const outcomeCountsToday = CALL_OUTCOMES.reduce(
      (acc, outcome) => ({ ...acc, [outcome]: 0 }),
      {} as Record<string, number>
    );
    agentCallsToday.forEach((c) => {
      if (outcomeCountsToday[c.outcome] !== undefined)
        outcomeCountsToday[c.outcome]++;
    });
    return {
      callsToday: agentCallsToday.length,
      callsThisHour: agentCallsThisHour.length,
      outcomeCountsToday,
    };
  }, [calls, selectedAgent, now]);
  const subtotalByAgent = useMemo(
    () =>
      INVOICE_AGENTS.reduce((acc, a) => {
        acc[a] = weekDays.reduce(
          (sum, d) => sum + (computedHours[a]?.[isoYmdLocal(d)] || 0),
          0
        );
        return acc;
      }, {} as Record<string, number>),
    [computedHours, weekDays]
  );
  const amountByAgent = useMemo(
    () =>
      INVOICE_AGENTS.reduce((acc, a) => {
        acc[a] =
          subtotalByAgent[a] * FIXED_RATE +
          (commissions[a] || 0) +
          (bonuses[a] || 0);
        return acc;
      }, {} as Record<string, number>),
    [subtotalByAgent, commissions, bonuses]
  );
  const grandTotal = useMemo(
    () => INVOICE_AGENTS.reduce((s, a) => s + (amountByAgent[a] || 0), 0),
    [amountByAgent]
  );
  const invoiceNumber = useMemo(
    () =>
      invoiceOverride != null
        ? invoiceOverride
        : BASE_INVOICE_NUMBER +
          Math.round(
            (invoiceFriday.getTime() -
              new Date(`${BASE_FRIDAY_ISO}T12:00:00Z`).getTime()) /
              (7 * 24 * 60 * 60 * 1000)
          ),
    [invoiceFriday, invoiceOverride]
  );

  const logCall = (agent: string, outcome: string) =>
    setCalls((s) => [
      { id: uid("c_"), agent, outcome, ts: new Date().toISOString() },
      ...s,
    ]);
  const removeLastCallForOutcome = (agent: string, outcome: string) => {
    setCalls((s) => {
      const idx = s.findIndex(
        (c) => c.agent === agent && c.outcome === outcome
      );
      if (idx === -1) return s;
      const newCalls = [...s];
      newCalls.splice(idx, 1);
      return newCalls;
    });
  };
  const clockIn = (agent: string) => {
    setAttendanceEvents((s) => [
      ...s,
      { id: uid("a_"), agent, type: "in", ts: new Date().toISOString() },
    ]);
    if (agent === "Via") {
      const shouldDuplicate = window.confirm(
        "Do you want to duplicate this clock-in for Bern?"
      );
      if (shouldDuplicate) {
        setAttendanceEvents((s) => [
          ...s,
          {
            id: uid("a_"),
            agent: "Bern",
            type: "in",
            ts: new Date().toISOString(),
          },
        ]);
      }
    }
  };
  const clockOut = (agent: string) =>
    setAttendanceEvents((s) => [
      ...s,
      { id: uid("a_"), agent, type: "out", ts: new Date().toISOString() },
    ]);
  const tryOpenAdmin = () => {
    if (selectedAgent === ADMIN_USER) setShowPinPrompt(true);
    else alert("Admin panel can only be unlocked when VIA is selected.");
  };
  const submitPin = () => {
    if (pinInput === ADMIN_PIN) {
      setAdminUnlocked(true);
      setActiveTab("admin");
    } else {
      alert("Incorrect PIN.");
    }
    setPinInput("");
    setShowPinPrompt(false);
  };
  const setOverrideFor = (agent: string, dateKey: string, hoursStr: string) => {
    const hoursVal = parseFloat(hoursStr);
    setOverrides((p) => ({
      ...p,
      [agent]: {
        ...p[agent],
        [dateKey]: isNaN(hoursVal) ? 0 : Math.max(0, hoursVal),
      },
    }));
  };

  async function exportInvoiceDocx() {
    try {
      const { docx, saveAs } = await loadDocxAndSaver();
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        AlignmentType,
        WidthType,
      } = docx;
      const agentRows = (agent: string) => {
        const rows = [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: "Date", bold: true })],
              }),
              new TableCell({
                children: [new Paragraph({ text: "Hours", bold: true })],
              }),
              new TableCell({
                children: [new Paragraph({ text: "Subtotal", bold: true })],
              }),
            ],
          }),
        ];
        weekDays.forEach((d) => {
          const key = isoYmdLocal(d);
          const hrs = computedHours[agent]?.[key] || 0;
          const subtotal = hrs * FIXED_RATE;
          rows.push(
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(formatShort(d))] }),
                new TableCell({ children: [new Paragraph(hrs.toFixed(2))] }),
                new TableCell({
                  children: [new Paragraph(`$${subtotal.toFixed(2)}`)],
                }),
              ],
            })
          );
        });
        rows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({ text: "Subtotal Hours", bold: true }),
                ],
              }),
              new TableCell({
                children: [new Paragraph(subtotalByAgent[agent].toFixed(2))],
              }),
              new TableCell({
                children: [
                  new Paragraph(
                    `$${(subtotalByAgent[agent] * FIXED_RATE).toFixed(2)}`
                  ),
                ],
              }),
            ],
          })
        );
        rows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Commission")] }),
              new TableCell({}),
              new TableCell({
                children: [
                  new Paragraph(`$${(commissions[agent] || 0).toFixed(2)}`),
                ],
              }),
            ],
          })
        );
        rows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph("Bonus")] }),
              new TableCell({}),
              new TableCell({
                children: [
                  new Paragraph(`$${(bonuses[agent] || 0).toFixed(2)}`),
                ],
              }),
            ],
          })
        );
        rows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: "Total", bold: true })],
              }),
              new TableCell({}),
              new TableCell({
                children: [
                  new Paragraph({
                    text: `$${amountByAgent[agent].toFixed(2)}`,
                    bold: true,
                  }),
                ],
              }),
            ],
          })
        );
        return rows;
      };
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "INVOICE", bold: true, size: 36 }),
                ],
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph(""),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph({ text: "From:", bold: true }),
                          new Paragraph("Block 4 Lot 5 Fortunate Street"),
                          new Paragraph("Luckyhomes Subdivision"),
                          new Paragraph("Deparo Caloocan City"),
                          new Paragraph("Postal Code 1420, Brgy 168"),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({ text: "To:", bold: true }),
                          new Paragraph("Stumblehere"),
                          new Paragraph("3100 W Ray Road #201 Office #209"),
                          new Paragraph(
                            "Chandler, Arizona, United States 85226"
                          ),
                          new Paragraph("(480) 201-7225"),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new Paragraph(""),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph(`Invoice #: ${invoiceNumber}`),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph(
                            `Invoice Date: ${invoiceFriday.toLocaleDateString(
                              "en-US"
                            )}`
                          ),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph(
                            `Coverage: ${weekDays[0].toLocaleDateString(
                              "en-US"
                            )} - ${weekDays[4].toLocaleDateString("en-US")}`
                          ),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new Paragraph(""),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph({ text: "VIA", bold: true }),
                          new Table({ rows: agentRows("Via") }),
                        ],
                        width: { size: 50, type: WidthType.PERCENTAGE },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({ text: "BERN", bold: true }),
                          new Table({ rows: agentRows("Bern") }),
                        ],
                        width: { size: 50, type: WidthType.PERCENTAGE },
                      }),
                    ],
                  }),
                ],
              }),
              new Paragraph(""),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Grand Total: $${grandTotal.toFixed(2)}`,
                    bold: true,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          },
        ],
      });
      Packer.toBlob(doc).then((blob) => {
        saveAs(
          blob,
          `Invoice_${invoiceNumber}_${isoYmdLocal(invoiceFriday)}.docx`
        );
      });
    } catch (err) {
      alert(
        "DOCX generation failed. Please ensure you are connected to the internet."
      );
      console.error(err);
    }
  }
  function exportInvoiceHtml() {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Invoice #${invoiceNumber}</title>
        <style>
            body { font-family: 'Courier New', Courier, monospace; margin: 0; padding: 24px; color: #000; background-color: #f6f7fb; }
            .invoice-container { max-width: 800px; margin: 0 auto; padding: 24px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { text-align: center; margin-bottom: 16px; font-size: 24px; font-weight: bold; }
            .info-table, .details-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            .info-table td { padding: 8px 0; vertical-align: top; }
            .details-table th, .details-table td { padding: 8px; border-bottom: 1px solid #eef2f6; text-align: left; }
            .details-table th { text-transform: uppercase; }
            .total-row td { font-weight: bold; }
            .grand-total { text-align: right; font-size: 20px; font-weight: bold; margin-top: 24px; }
            .hr-dashed { border: 0; border-top: 1px dashed #94a3b8; margin: 16px 0; }
            .hr-solid { border: 0; border-top: 1px solid #94a3b8; margin: 16px 0; }
            pre { margin: 0; font-family: inherit; }
        </style>
    </head>
    <body>
        <div class="invoice-container">
            <div class="header">INVOICE</div>
            <hr class="hr-solid" />
            <table class="info-table">
                <tbody>
                    <tr>
                        <td style="width: 50%;">
                            <pre><strong>From:</strong><br />Block 4 Lot 5 Fortunate Street<br />Luckyhomes Subdivision,<br />Deparo Caloocan City,<br />Postal Code 1420, Brgy 168</pre>
                        </td>
                        <td style="width: 50%;">
                            <pre><strong>To:</strong><br />Stumblehere<br />3100 W Ray Road #201 Office #209<br />Chandler, Arizona, United States 85226<br />(480) 201-7225</pre>
                        </td>
                    </tr>
                </tbody>
            </table>
            <hr class="hr-solid" />
            <table class="info-table">
                <tbody>
                    <tr>
                        <td><strong>Invoice #:</strong> ${invoiceNumber}</td>
                        <td style="text-align: right;"><strong>Invoice Date:</strong> ${formatLongDate(
                          invoiceFriday
                        )}</td>
                    </tr>
                    <tr>
                        <td colspan="2"><strong>Coverage:</strong> ${formatLongDate(
                          weekDays[0]
                        )} – ${formatLongDate(weekDays[4])}</td>
                    </tr>
                </tbody>
            </table>
            <hr class="hr-solid" />
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                ${INVOICE_AGENTS.map((agent) => {
                  const agentRows = weekDays
                    .map((day) => {
                      const key = isoYmdLocal(day);
                      const hours = computedHours[agent]?.[key] || 0;
                      return `
                          <tr>
                              <td>${formatShort(day)}</td>
                              <td>${hours.toFixed(2)}</td>
                              <td>$${FIXED_RATE.toFixed(2)}</td>
                              <td>$${(hours * FIXED_RATE).toFixed(2)}</td>
                          </tr>
                      `;
                    })
                    .join("");
                  return `
                      <div>
                          <h3 style="margin: 0 0 8px 0; text-align: center;">${agent.toUpperCase()}</h3>
                          <table class="details-table">
                              <thead>
                                  <tr>
                                      <th>Date</th>
                                      <th>Hours</th>
                                      <th>Rate</th>
                                      <th>Subtotal</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  ${agentRows}
                                  <tr>
                                    <td><strong>Subtotal Hours</strong></td>
                                    <td><strong>${subtotalByAgent[
                                      agent
                                    ].toFixed(2)}</strong></td>
                                    <td></td>
                                    <td><strong>$${(
                                      subtotalByAgent[agent] * FIXED_RATE
                                    ).toFixed(2)}</strong></td>
                                  </tr>
                                  <tr>
                                    <td>Commission</td>
                                    <td></td>
                                    <td></td>
                                    <td>$${(commissions[agent] || 0).toFixed(
                                      2
                                    )}</td>
                                  </tr>
                                  <tr>
                                    <td>Bonus</td>
                                    <td></td>
                                    <td></td>
                                    <td>$${(bonuses[agent] || 0).toFixed(
                                      2
                                    )}</td>
                                  </tr>
                                  <tr class="total-row">
                                    <td colspan="3" style="text-align: right; font-size: 16px;">Total:</td>
                                    <td style="font-size: 16px;">$${amountByAgent[
                                      agent
                                    ].toFixed(2)}</td>
                                  </tr>
                              </tbody>
                          </table>
                      </div>
                  `;
                }).join("")}
            </div>
            <hr class="hr-dashed" />
            <div class="grand-total">
                GRAND TOTAL: $${grandTotal.toFixed(2)}
            </div>
        </div>
    </body>
    </html>
    `;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    URL.revokeObjectURL(url);
  }
  function clearWeekDataConfirm() {
    if (!confirm("Clear this week's data?")) return;
    const wkStart = weekStart;
    const wkEnd = fridayOfWeekPhoenix(weekStart);
    setAttendanceEvents((s) =>
      s.filter((e) => {
        const d = new Date(e.ts);
        return d < wkStart || d > wkEnd;
      })
    );
    setCalls((s) =>
      s.filter((c) => {
        const d = new Date(c.ts);
        return d < wkStart || d > wkEnd;
      })
    );
    const newOverrides = JSON.parse(JSON.stringify(overrides));
    AGENTS.forEach((agent) =>
      weekDays.forEach((day) => delete newOverrides[agent]?.[isoYmdLocal(day)])
    );
    setOverrides(newOverrides);
    setCommissions({ Via: 0, Bern: 0 });
    setBonuses({ Via: 0, Bern: 0 });
    alert("Week data cleared.");
  }
  function exportCallsCSV() {
    if (calls.length === 0) return alert("No calls to export.");
    const header = "time_utc,time_phx,agent,outcome";
    const rows = calls.map((c) =>
      [
        new Date(c.ts).toISOString(),
        new Date(
          new Date(c.ts).toLocaleString("en-US", {
            timeZone: "America/Phoenix",
          })
        ).toISOString(),
        c.agent,
        `"${c.outcome}"`,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calls_${isoYmdLocal(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={S.page}>
      <div style={S.container}>
        <div style={S.header}>
          <div>
            <h1 style={{ margin: 0 }}>Team Dashboard</h1>
            <div style={{ color: "#475569", marginTop: 6, fontSize: 13 }}>
              Attendance • Calls • Invoices — Phoenix timezone
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>
              {now.toLocaleTimeString("en-US", { timeZone: "America/Phoenix" })}{" "}
              (PHX)
            </div>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8 }}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {["dashboard", "calls", "attendance", "weekly"].map((tab) => (
            <div
              key={tab}
              role="button"
              onClick={() => setActiveTab(tab as any)}
              style={S.tab(activeTab === tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </div>
          ))}
          {selectedAgent === ADMIN_USER && (
            <div
              role="button"
              onClick={tryOpenAdmin}
              style={S.tab(activeTab === "admin")}
            >
              Admin
            </div>
          )}
        </div>

        {activeTab === "dashboard" && (
          <div style={S.card}>
            {" "}
            <h2 style={{ marginTop: 0 }}>Daily Agent Dashboard</h2>{" "}
            <div style={S.dashboardGrid}>
              {" "}
              {AGENTS.map((agent) => {
                const stats = dashboardStats[agent];
                if (!stats) return null;
                return (
                  <div key={agent} style={S.agentCard}>
                    {" "}
                    <div style={S.agentCardHeader}>
                      {" "}
                      <span style={S.agentName}>{agent}</span>{" "}
                      {stats.isLate && <span style={S.lateTag}>LATE</span>}{" "}
                    </div>{" "}
                    <div
                      style={{
                        ...S.statValue,
                        color:
                          stats.status === "Online" ? "#166534" : "#374151",
                        textAlign: "center",
                        marginBottom: 12,
                      }}
                    >
                      {stats.status}
                    </div>{" "}
                    <div style={S.statGrid}>
                      {" "}
                      <div>
                        <div style={S.statValue}>{stats.callsThisHour}</div>
                        <div style={S.statLabel}>Calls This Hour</div>
                      </div>{" "}
                      <div>
                        <div style={S.statValue}>{stats.callsToday}</div>
                        <div style={S.statLabel}>Calls Today</div>
                      </div>{" "}
                      <div>
                        <div style={S.statValue}>
                          {stats.hoursToday.toFixed(2)}
                        </div>
                        <div style={S.statLabel}>Hours Today</div>
                      </div>{" "}
                    </div>{" "}
                    <div
                      style={{
                        textAlign: "center",
                        background: "#eef2ff",
                        padding: "8px",
                        borderRadius: 8,
                      }}
                    >
                      {" "}
                      <span style={{ color: "#4338ca", fontWeight: 600 }}>
                        {stats.hoursRemaining.toFixed(2)} hours to go
                      </span>{" "}
                      <span style={{ color: "#64748b", fontSize: 13 }}>
                        {" "}
                        ({stats.targetHours}hr target)
                      </span>{" "}
                    </div>{" "}
                  </div>
                );
              })}{" "}
            </div>{" "}
          </div>
        )}
        {activeTab === "calls" && (
          <div style={S.card}>
            {" "}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              {" "}
              <h2 style={{ margin: 0 }}>
                Call Tracker:{" "}
                <span style={{ color: "#3730a3" }}>{selectedAgent}</span>
              </h2>{" "}
              <div style={{ display: "flex", gap: 16, textAlign: "center" }}>
                {" "}
                <div>
                  <div style={S.statValue}>{callStats.callsThisHour}</div>
                  <div style={S.statLabel}>Calls This Hour</div>
                </div>{" "}
                <div>
                  <div style={S.statValue}>{callStats.callsToday}</div>
                  <div style={S.statLabel}>Calls Today</div>
                </div>{" "}
              </div>{" "}
            </div>{" "}
            <div style={S.tallyGrid}>
              {" "}
              {CALL_OUTCOMES.map((outcome) => (
                <div
                  key={outcome}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#f8fafc",
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid #f1f5f9",
                  }}
                >
                  {" "}
                  <div>
                    {" "}
                    <div style={{ fontWeight: 600 }}>{outcome}</div>{" "}
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      Today: {callStats.outcomeCountsToday[outcome]}
                    </div>{" "}
                  </div>{" "}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    {" "}
                    <button
                      style={S.tallyButton}
                      onClick={() =>
                        removeLastCallForOutcome(selectedAgent, outcome)
                      }
                    >
                      -
                    </button>{" "}
                    <button
                      style={{
                        ...S.tallyButton,
                        background: "#eef2ff",
                        color: "#3730a3",
                      }}
                      onClick={() => logCall(selectedAgent, outcome)}
                    >
                      +
                    </button>{" "}
                  </div>{" "}
                </div>
              ))}{" "}
            </div>{" "}
          </div>
        )}
        {activeTab === "attendance" && (
          <div style={S.card}>
            {" "}
            <h2 style={{ marginTop: 0 }}>Attendance Events</h2>{" "}
            <div style={{ display: "grid", gap: 12 }}>
              {" "}
              <div style={{ display: "flex", gap: 8 }}>
                {" "}
                <select
                  style={S.smallInput}
                  id="att_agent_select"
                  defaultValue={selectedAgent}
                >
                  {" "}
                  {AGENTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}{" "}
                </select>{" "}
                <button
                  style={S.btnPrimary}
                  onClick={() =>
                    clockIn(
                      (
                        document.getElementById(
                          "att_agent_select"
                        ) as HTMLSelectElement
                      ).value
                    )
                  }
                >
                  Clock In
                </button>{" "}
                <button
                  style={{ ...S.btnPrimary, background: "#0369a1" }}
                  onClick={() =>
                    clockOut(
                      (
                        document.getElementById(
                          "att_agent_select"
                        ) as HTMLSelectElement
                      ).value
                    )
                  }
                >
                  Clock Out
                </button>{" "}
              </div>{" "}
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {" "}
                <table style={S.table}>
                  {" "}
                  <thead>
                    <tr>
                      <th style={S.th}>Time (PHX)</th>
                      <th style={S.th}>Agent</th>
                      <th style={S.th}>Type</th>
                    </tr>
                  </thead>{" "}
                  <tbody>
                    {" "}
                    {attendanceEvents
                      .slice()
                      .reverse()
                      .map((e) => (
                        <tr key={e.id}>
                          <td style={S.td}>
                            {new Date(e.ts).toLocaleString("en-US", {
                              timeZone: "America/Phoenix",
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </td>
                          <td style={S.td}>{e.agent}</td>
                          <td style={S.td}>
                            {e.type === "in" ? "Clock In" : "Clock Out"}
                          </td>
                        </tr>
                      ))}{" "}
                  </tbody>{" "}
                </table>{" "}
              </div>{" "}
            </div>{" "}
          </div>
        )}
        {activeTab === "weekly" && (
          <div style={S.card}>
            {" "}
            <h2 style={{ marginTop: 0 }}>Weekly Hours (Mon–Fri)</h2>{" "}
            <div style={{ display: "grid", gap: 12 }}>
              {" "}
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {" "}
                <div>
                  Week starting: <strong>{formatShort(weekStart)}</strong>
                </div>{" "}
                <input
                  type="date"
                  value={isoYmdLocal(weekStart)}
                  onChange={(e) =>
                    setWeekStart(new Date(e.target.value + "T00:00:00"))
                  }
                  style={S.input}
                />{" "}
              </div>{" "}
              <div style={{ overflowX: "auto" }}>
                {" "}
                <table style={S.table}>
                  {" "}
                  <thead>
                    {" "}
                    <tr>
                      {" "}
                      <th style={S.th}>Agent</th>{" "}
                      {weekDays.map((d) => (
                        <th style={S.th} key={isoYmdLocal(d)}>
                          {formatShort(d)}
                        </th>
                      ))}{" "}
                      <th style={S.th}>Week Total</th>{" "}
                    </tr>{" "}
                  </thead>{" "}
                  <tbody>
                    {" "}
                    {AGENTS.map((a) => (
                      <tr key={a}>
                        {" "}
                        <td style={S.td}>
                          <strong>{a}</strong>
                        </td>{" "}
                        {weekDays.map((d) => {
                          const key = isoYmdLocal(d);
                          return (
                            <td style={S.td} key={key}>
                              {" "}
                              <input
                                type="number"
                                step="0.25"
                                defaultValue={
                                  computedHours[a]?.[key]?.toFixed(2) || "0.00"
                                }
                                onBlur={(e) =>
                                  setOverrideFor(a, key, e.target.value)
                                }
                                style={S.smallInput}
                                disabled={!adminUnlocked}
                              />{" "}
                            </td>
                          );
                        })}{" "}
                        <td style={S.td}>
                          <strong>
                            {weekDays
                              .reduce(
                                (s, d) =>
                                  s + (computedHours[a]?.[isoYmdLocal(d)] || 0),
                                0
                              )
                              .toFixed(2)}{" "}
                            hrs
                          </strong>
                        </td>{" "}
                      </tr>
                    ))}{" "}
                  </tbody>{" "}
                </table>{" "}
              </div>{" "}
              <div>
                <em style={{ color: "#64748b" }}>
                  Note: Editing hours requires Admin access. Changes are saved
                  on blur and will override attendance calculations.
                </em>
              </div>{" "}
            </div>{" "}
          </div>
        )}
        {activeTab === "admin" && adminUnlocked && (
          <div style={S.card}>
            {" "}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              {" "}
              <h2 style={{ margin: 0 }}>Admin Panel</h2>{" "}
              <div style={{ display: "flex", gap: 4 }}>
                {" "}
                <div
                  role="button"
                  onClick={() => setAdminSubTab("invoice")}
                  style={S.tab(adminSubTab === "invoice")}
                >
                  Invoice
                </div>{" "}
                <div
                  role="button"
                  onClick={() => setAdminSubTab("settings")}
                  style={S.tab(adminSubTab === "settings")}
                >
                  Settings
                </div>{" "}
              </div>{" "}
            </div>{" "}
            {adminSubTab === "invoice" && (
              <div style={{ marginTop: 24 }}>
                {" "}
                <div style={S.invoicePaper}>
                  {" "}
                  <h2 style={{ textAlign: "center", margin: "0 0 16px 0" }}>
                    INVOICE
                  </h2>{" "}
                  <hr style={S.invoiceHr} />{" "}
                  <table style={{ width: "100%", borderSpacing: 0 }}>
                    <tbody>
                      <tr>
                        {" "}
                        <td style={{ verticalAlign: "top", width: "50%" }}>
                          <pre style={{ margin: 0, fontFamily: "inherit" }}>
                            <strong>From:</strong>
                            <br />
                            Block 4 Lot 5 Fortunate Street
                            <br />
                            Luckyhomes Subdivision,
                            <br />
                            Deparo Caloocan City,
                            <br />
                            Postal Code 1420, Brgy 168
                          </pre>
                        </td>{" "}
                        <td style={{ verticalAlign: "top", width: "50%" }}>
                          <pre style={{ margin: 0, fontFamily: "inherit" }}>
                            <strong>To:</strong>
                            <br />
                            Stumblehere
                            <br />
                            3100 W Ray Road #201 Office #209
                            <br />
                            Chandler, Arizona, United States 85226
                            <br />
                            (480) 201-7225
                          </pre>
                        </td>{" "}
                      </tr>
                    </tbody>
                  </table>{" "}
                  <hr style={S.invoiceHr} />{" "}
                  <table style={{ width: "100%" }}>
                    <tbody>
                      <tr>
                        {" "}
                        <td>
                          <strong>Invoice #:</strong> {invoiceNumber}
                        </td>{" "}
                        <td style={{ textAlign: "right" }}>
                          <strong>Invoice Date:</strong>{" "}
                          {formatLongDate(invoiceFriday)}
                        </td>{" "}
                      </tr>
                      <tr>
                        {" "}
                        <td colSpan={2}>
                          <strong>Coverage:</strong>{" "}
                          {formatLongDate(weekDays[0])} –{" "}
                          {formatLongDate(weekDays[4])}
                        </td>{" "}
                      </tr>
                    </tbody>
                  </table>{" "}
                  <hr style={S.invoiceHr} />{" "}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 24,
                    }}
                  >
                    {" "}
                    {INVOICE_AGENTS.map((agent) => (
                      <div key={agent}>
                        {" "}
                        <h3
                          style={{ margin: "0 0 8px 0", textAlign: "center" }}
                        >
                          {agent.toUpperCase()}
                        </h3>{" "}
                        <table
                          style={{ ...S.invoiceTable, textAlign: "center" }}
                        >
                          {" "}
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Hours</th>
                              <th>Rate</th>
                              <th>Subtotal</th>
                            </tr>
                          </thead>{" "}
                          <tbody>
                            {" "}
                            {weekDays.map((day) => {
                              const key = isoYmdLocal(day);
                              const hours = computedHours[agent]?.[key] || 0;
                              return (
                                <tr key={key}>
                                  {" "}
                                  <td>{formatShort(day)}</td>{" "}
                                  <td>
                                    <input
                                      type="number"
                                      style={S.invoiceTableInput}
                                      value={hours.toFixed(2)}
                                      onChange={(e) =>
                                        setOverrideFor(
                                          agent,
                                          key,
                                          e.target.value
                                        )
                                      }
                                    />
                                  </td>{" "}
                                  <td>${FIXED_RATE.toFixed(2)}</td>{" "}
                                  <td>${(hours * FIXED_RATE).toFixed(2)}</td>{" "}
                                </tr>
                              );
                            })}{" "}
                            <tr class="total-row">
                              <td
                                colSpan={3}
                                style={{ textAlign: "right", fontSize: "16px" }}
                              >
                                Total:
                              </td>
                              <td style={{ fontSize: "16px" }}>
                                $${amountByAgent[agent].toFixed(2)}
                              </td>
                            </tr>
                          </tbody>{" "}
                        </table>{" "}
                      </div>
                    ))}{" "}
                  </div>
                  <hr class="hr-dashed" />
                  <div class="grand-total">
                    GRAND TOTAL: $${grandTotal.toFixed(2)}
                  </div>
                </div>{" "}
                <div style={{ marginTop: 14 }}>
                  <button style={S.btnPrimary} onClick={exportInvoiceHtml}>
                    Download HTML Version
                  </button>
                </div>{" "}
              </div>
            )}
            {adminSubTab === "settings" && (
              <div style={{ marginTop: 18 }}>
                {" "}
                <div style={{ display: "grid", gap: 16 }}>
                  {" "}
                  <div
                    style={{ display: "flex", gap: 12, alignItems: "flex-end" }}
                  >
                    {" "}
                    <div style={{ flex: 1 }}>
                      <label>Week start (Mon)</label>
                      <input
                        type="date"
                        value={isoYmdLocal(weekStart)}
                        onChange={(e) =>
                          setWeekStart(new Date(e.target.value + "T00:00:00"))
                        }
                        style={S.input}
                      />
                    </div>{" "}
                    <div>
                      <label>Invoice # Override</label>
                      <input
                        type="number"
                        placeholder="Auto"
                        value={invoiceOverride ?? ""}
                        onChange={(e) =>
                          setInvoiceOverride(
                            e.target.value === ""
                              ? null
                              : Number(e.target.value)
                          )
                        }
                        style={S.smallInput}
                      />
                    </div>{" "}
                  </div>{" "}
                  <div style={{ display: "flex", gap: 12 }}>
                    {" "}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: "0 0 8px 0" }}>
                        Commission (Via / Bern)
                      </h4>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="number"
                          value={commissions.Via || 0}
                          onChange={(e) =>
                            setCommissions((p) => ({
                              ...p,
                              Via: Number(e.target.value),
                            }))
                          }
                          style={S.smallInput}
                        />
                        <input
                          type="number"
                          value={commissions.Bern || 0}
                          onChange={(e) =>
                            setCommissions((p) => ({
                              ...p,
                              Bern: Number(e.target.value),
                            }))
                          }
                          style={S.smallInput}
                        />
                      </div>
                    </div>{" "}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: "0 0 8px 0" }}>
                        Bonus (Via / Bern)
                      </h4>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="number"
                          value={bonuses.Via || 0}
                          onChange={(e) =>
                            setBonuses((p) => ({
                              ...p,
                              Via: Number(e.target.value),
                            }))
                          }
                          style={S.smallInput}
                        />
                        <input
                          type="number"
                          value={bonuses.Bern || 0}
                          onChange={(e) =>
                            setBonuses((p) => ({
                              ...p,
                              Bern: Number(e.target.value),
                            }))
                          }
                          style={S.smallInput}
                        />
                      </div>
                    </div>{" "}
                  </div>{" "}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      paddingTop: 16,
                      borderTop: "1px solid #eef2f6",
                    }}
                  >
                    {" "}
                    <button style={S.btnDanger} onClick={clearWeekDataConfirm}>
                      Clear Current Week Data
                    </button>{" "}
                    <button
                      style={S.btnPrimary}
                      onClick={() => {
                        setAdminUnlocked(false);
                        alert("Admin locked.");
                      }}
                    >
                      Lock Admin
                    </button>{" "}
                  </div>{" "}
                </div>{" "}
              </div>
            )}
          </div>
        )}
        {showPinPrompt && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              background: "rgba(2,6,23,0.45)",
            }}
          >
            {" "}
            <div
              style={{
                width: 360,
                background: "#fff",
                padding: 18,
                borderRadius: 12,
              }}
            >
              {" "}
              <h3 style={{ marginTop: 0 }}>Enter Admin PIN</h3>{" "}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitPin();
                }}
              >
                {" "}
                <input
                  autoFocus
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  style={S.input}
                />{" "}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {" "}
                  <button type="submit" style={S.btnPrimary}>
                    Unlock
                  </button>{" "}
                  <button
                    type="button"
                    style={{ ...S.btnDanger, background: "#94a3b8" }}
                    onClick={() => {
                      setShowPinPrompt(false);
                      setPinInput("");
                    }}
                  >
                    Cancel
                  </button>{" "}
                </div>{" "}
              </form>{" "}
            </div>{" "}
          </div>
        )}
      </div>
    </div>
  );
}
