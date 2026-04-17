/**
 * Parse flexible schedule strings into cron expressions.
 *
 * Accepts: raw cron ("0 9 * * *"), natural language ("every day at 9am",
 * "every 15 minutes", "every monday at 10:30", "hourly", "weekly").
 */
export interface ParsedSchedule {
  cron: string;
  description: string;
}

const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

export function parseSchedule(input: string): ParsedSchedule {
  const raw = input.trim();
  if (!raw) throw new Error("Schedule is empty");

  // Raw cron expression
  const parts = raw.split(/\s+/);
  if (
    (parts.length === 5 || parts.length === 6) &&
    parts.every((p) => /^[\d*/,\-A-Z?]+$/i.test(p))
  ) {
    return { cron: raw, description: `cron \`${raw}\`` };
  }

  const lower = raw.toLowerCase();

  // "every N minutes/hours"
  const everyN = lower.match(/^every\s+(\d+)\s+(minute|minutes|min|hour|hours|hr)s?$/);
  if (everyN) {
    const n = Number(everyN[1]);
    const unit = everyN[2];
    if (unit.startsWith("min")) {
      return { cron: `*/${n} * * * *`, description: `every ${n} minutes` };
    }
    return { cron: `0 */${n} * * *`, description: `every ${n} hours` };
  }

  if (lower === "every minute") return { cron: "* * * * *", description: "every minute" };
  if (lower === "every hour" || lower === "hourly") return { cron: "0 * * * *", description: "every hour" };

  const time = extractTime(lower);
  const dayOfWeek = extractDayOfWeek(lower);

  if (lower.includes("daily") || /every\s+day/.test(lower)) {
    const t = time ?? { h: 9, m: 0 };
    return { cron: `${t.m} ${t.h} * * *`, description: `daily at ${fmtTime(t)}` };
  }

  if (dayOfWeek !== null) {
    const t = time ?? { h: 9, m: 0 };
    return { cron: `${t.m} ${t.h} * * ${dayOfWeek}`, description: `every ${dayName(dayOfWeek)} at ${fmtTime(t)}` };
  }

  if (lower === "weekly") return { cron: "0 9 * * 1", description: "every Monday at 09:00" };
  if (lower === "monthly") return { cron: "0 9 1 * *", description: "1st of month at 09:00" };

  throw new Error(
    `Could not parse "${input}". Use cron ("0 9 * * *") or phrases like "every day at 9am", "every 15 minutes".`,
  );
}

function extractTime(s: string): { h: number; m: number } | null {
  const m1 = s.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  if (m1) {
    let h = Number(m1[1]);
    const min = Number(m1[2]);
    if (m1[3] === "pm" && h < 12) h += 12;
    if (m1[3] === "am" && h === 12) h = 0;
    return { h, m: min };
  }
  const m2 = s.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (m2) {
    let h = Number(m2[1]);
    if (m2[2] === "pm" && h < 12) h += 12;
    if (m2[2] === "am" && h === 12) h = 0;
    return { h, m: 0 };
  }
  return null;
}

function extractDayOfWeek(s: string): number | null {
  for (const [name, num] of Object.entries(DAY_MAP)) {
    if (new RegExp(`\\b${name}\\b`).test(s)) return num;
  }
  return null;
}

function dayName(n: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][n] ?? String(n);
}

function fmtTime(t: { h: number; m: number }): string {
  return `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;
}
