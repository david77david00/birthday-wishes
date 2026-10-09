// Sends Telegram reminders for birthdays today and tomorrow.
// Runs daily from .github/workflows/reminders.yml.
// Requires repo secrets TELEGRAM_TOKEN and TELEGRAM_CHAT_ID (skips quietly if missing).
import { readFile } from "node:fs/promises";

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));
const tz = (data.settings && data.settings.timezone) || "Asia/Kolkata";

// Month/day/year "today" in the configured timezone.
function ymdIn(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(date).map((p) => [p.type, p.value])
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day };
}
const now = new Date();
const today = ymdIn(now);
const tomorrow = ymdIn(new Date(now.getTime() + 86400000));
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function matches(date, day) {
  let [, m, d] = date.split("-").map(Number);
  if (m === 2 && d === 29 && !isLeap(day.y)) d = 28;
  return m === day.m && d === day.d;
}
const age = (date, year) => year - Number(date.split("-")[0]);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const people = data.people || [];
const lines = [];
for (const p of people.filter((p) => matches(p.date, today))) {
  lines.push(`🎉 Today is <b>${esc(p.name)}</b>'s birthday! (turns ${age(p.date, today.y)}) 🎂`);
}
for (const p of people.filter((p) => matches(p.date, tomorrow))) {
  lines.push(`⏰ Reminder: Tomorrow is <b>${esc(p.name)}</b>'s birthday! (turns ${age(p.date, tomorrow.y)})`);
}

if (!lines.length) {
  console.log(`No birthdays today or tomorrow (${tz}).`);
  process.exit(0);
}
console.log(lines.join("\n"));

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.log("TELEGRAM_TOKEN / TELEGRAM_CHAT_ID secrets not set — skipping send.");
  process.exit(0);
}

const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: lines.join("\n\n"), parse_mode: "HTML" })
});
if (!res.ok) {
  console.error("Telegram error:", res.status, await res.text());
  process.exit(1);
}
console.log("Telegram message sent ✅");
