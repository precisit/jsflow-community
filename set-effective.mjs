// The one effective date of the legal texts (SCOPE Q7): terms, privacy policy, AUP, DPA, the waitlist notice's "last reviewed" and the
// subprocessors' "last updated" all carry the same date, set when the texts are published.
//   node community/set-effective.mjs 2026-12-01      writes the date into every text and into docs/legal/effective.json, then regenerates versions.json
//   node community/set-effective.mjs --check          fails unless every text carries the date in effective.json (or still the marker [date] while it is null)
// Until it is run the texts say `[date]`, which the build refuses (markers.mjs), so a production build cannot go out undated.
// The waitlist entries end 90 days after this date (SCOPE Q9): control reads it from docs/legal/effective.json (JSFLOW_GA_DATE).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legal = join(root, 'docs/legal');
export const FILE = join(legal, 'effective.json');
/** One line in each text carries the date: its lead-in, so the date can be set again for a later version. */
export const DATED = {
  'terms-of-service.md': 'Effective ',
  'privacy-policy-service.md': 'Effective ',
  'acceptable-use-policy.md': 'Effective ',
  'dpa.md': 'Effective ',
  'subprocessors.md': 'Last updated: ',
  'waitlist-privacy-notice.md': 'Last reviewed: ',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-12-01" as the texts write it: "1 December 2026". */
export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.toISOString().slice(0, 10) !== iso) throw new Error(`not a date (YYYY-MM-DD): ${iso}`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const pattern = (lead) => new RegExp(`(\\*${lead})(\\[date\\]|\\d{1,2} [A-Z][a-z]+ \\d{4})`);
/** The date a text carries: "[date]" while it is undated, "1 December 2026" once set, or undefined when the line is missing or occurs twice. */
export function carried(file, text) {
  const hits = text.match(new RegExp(pattern(DATED[file]).source, 'g'));
  if (hits?.length !== 1) return undefined;
  return pattern(DATED[file]).exec(text)[2];
}
export const stamp = (file, text, long) => text.replace(pattern(DATED[file]), `$1${long}`);
export const readDate = () => JSON.parse(readFileSync(FILE, 'utf8')).date;

export function check() {
  const iso = readDate();
  const want = iso === null ? '[date]' : longDate(iso);
  const bad = [];
  for (const file of Object.keys(DATED)) {
    const got = carried(file, readFileSync(join(legal, file), 'utf8'));
    if (got !== want) bad.push(`${file} carries ${got === undefined ? 'no single date line' : JSON.stringify(got)}, effective.json says ${JSON.stringify(want)}`);
  }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === '--check' || arg === undefined) {
    const bad = check();
    if (bad.length) { console.error(`FAIL docs/legal effective date:\n  ${bad.join('\n  ')}\nrun: node community/set-effective.mjs <YYYY-MM-DD>`); process.exit(1); }
    console.log('effective date ok');
  } else {
    const long = longDate(arg);
    for (const file of Object.keys(DATED)) {
      const p = join(legal, file);
      const text = readFileSync(p, 'utf8');
      if (carried(file, text) === undefined) throw new Error(`${file}: no single "${DATED[file]}…" line to date`);
      writeFileSync(p, stamp(file, text, long));
    }
    writeFileSync(FILE, `${JSON.stringify({ date: arg }, null, 2)}\n`);
    console.log(`effective ${arg} (${long}) written to ${Object.keys(DATED).length} texts and docs/legal/effective.json; now: node community/gen-legal-versions.mjs`);
    console.log(`the waitlist function reads the same date (the entries end 90 days after it) from Parameter Store every 5 minutes, no deploy: aws ssm put-parameter --profile <the environment's profile> --name /jsflow/<staging|prod>/waitlist/publish-date --type String --value ${arg} --overwrite (production refuses sign-ups until it is set)`);
  }
}
