/**
 * Calendar-based mission resets (player local timezone).
 * Daily: each local calendar day. Weekly: each local Monday 00:00.
 */

/** `YYYY-MM-DD` in the device's local calendar. */
export function getLocalDayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Monday 00:00 local of the week containing `ts`, as a day key.
 * Used to detect week rollover for weekly missions.
 */
export function getLocalWeekAnchorDayKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const daysFromMonday = (day + 6) % 7; // Mon → 0, Sun → 6
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  return getLocalDayKey(monday.getTime());
}

/** Milliseconds until the next local midnight (start of tomorrow). */
export function msUntilNextLocalMidnight(now: number = Date.now()): number {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(0, next.getTime() - now);
}

/** Milliseconds until next Monday 00:00 local (weekly mission reset). */
export function msUntilNextWeeklyReset(now: number = Date.now()): number {
  const d = new Date(now);
  const day = d.getDay();
  const daysFromMonday = (day + 6) % 7;
  const thisMonday = new Date(d);
  thisMonday.setDate(d.getDate() - daysFromMonday);
  thisMonday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  return Math.max(0, nextMonday.getTime() - now);
}

export function formatMissionResetCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'soon';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Short label for next local midnight, e.g. "12:00 AM". */
export function formatNextDailyResetClock(now: number = Date.now()): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
