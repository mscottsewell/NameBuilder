/**
 * Client-side ports of the .NET formatting the NameBuilder plugin performs
 * server-side (invariant culture), so the live preview matches what the
 * plugin will produce. See NameBuilderPlugin/FieldValueResolver.cs.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * Formats a date using .NET custom date format tokens (invariant culture).
 * Supported tokens: yyyy yy MMMM MMM MM M dddd ddd dd d HH H hh h mm m ss s
 * tt t fff ff f. Literals may be quoted with ' or ". The date is formatted
 * using its UTC components — Dataverse stores datetimes in UTC and the plugin
 * formats the raw UTC value (plus the optional timezone offset).
 */
export function formatDotNetDate(date: Date, format: string): string {
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  const dow = date.getUTCDay();
  const h = date.getUTCHours();
  const mi = date.getUTCMinutes();
  const s = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';

  let out = '';
  let i = 0;
  while (i < format.length) {
    const c = format[i];

    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      while (j < format.length && format[j] !== quote) {
        out += format[j];
        j++;
      }
      i = j + 1;
      continue;
    }

    if (c === '\\' && i + 1 < format.length) {
      out += format[i + 1];
      i += 2;
      continue;
    }

    let run = 1;
    while (i + run < format.length && format[i + run] === c) run++;

    switch (c) {
      case 'y':
        out += run >= 4 ? pad(y, 4) : run >= 2 ? pad(y % 100, 2) : String(y % 100);
        break;
      case 'M':
        out += run >= 4 ? MONTHS[mo] : run === 3 ? MONTHS[mo].slice(0, 3) : run === 2 ? pad(mo + 1, 2) : String(mo + 1);
        break;
      case 'd':
        out += run >= 4 ? DAYS[dow] : run === 3 ? DAYS[dow].slice(0, 3) : run === 2 ? pad(d, 2) : String(d);
        break;
      case 'H':
        out += run >= 2 ? pad(h, 2) : String(h);
        break;
      case 'h':
        out += run >= 2 ? pad(h12, 2) : String(h12);
        break;
      case 'm':
        out += run >= 2 ? pad(mi, 2) : String(mi);
        break;
      case 's':
        out += run >= 2 ? pad(s, 2) : String(s);
        break;
      case 't':
        out += run >= 2 ? ampm : ampm[0];
        break;
      case 'f':
        out += pad(ms, 3).slice(0, Math.min(run, 3));
        break;
      default:
        out += format.slice(i, i + run);
        break;
    }
    i += run;
  }
  return out;
}

/**
 * Applies the plugin's optional casing transform embedded in a date format.
 * "upper:MMM" → "JAN"; "yyyy.MM - upper:MMM" → "2026.01 - JAN".
 * The prefix may appear anywhere; everything left of it formats normally and
 * everything right of it is case-transformed.
 */
export function formatDateWithCasing(date: Date, format: string | undefined): string {
  const fmt = format || 'yyyy-MM-dd';
  const transforms: { token: string; apply: (s: string) => string }[] = [
    { token: 'upper:', apply: (t) => t.toUpperCase() },
    { token: 'lower:', apply: (t) => t.toLowerCase() },
    {
      token: 'title:',
      apply: (t) => t.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sp: string, ch: string) => sp + ch.toUpperCase()),
    },
  ];

  const lower = fmt.toLowerCase();
  for (const { token, apply } of transforms) {
    const idx = lower.indexOf(token);
    if (idx >= 0) {
      const left = fmt.slice(0, idx);
      const right = fmt.slice(idx + token.length);
      const leftPart = left ? formatDotNetDate(date, left) : '';
      return leftPart + apply(formatDotNetDate(date, right));
    }
  }

  try {
    return formatDotNetDate(date, fmt);
  } catch {
    return formatDotNetDate(date, 'yyyy-MM-dd');
  }
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats a number using the subset of .NET custom numeric format strings
 * the configurator emits: '0' / '#' placeholders, optional ',' grouping,
 * optional '.' decimal section (e.g. "#,##0.00", "#,##0.##", "0.0", "00").
 */
export function formatDotNetNumber(value: number, format: string): string {
  const useGrouping = format.includes(',');
  const core = format.replace(/,/g, '');
  const dot = core.indexOf('.');
  const intSection = dot >= 0 ? core.slice(0, dot) : core;
  const decSection = dot >= 0 ? core.slice(dot + 1) : '';

  const minInt = (intSection.match(/0/g) || []).length || 1;
  const minDec = (decSection.match(/0/g) || []).length;
  const maxDec = decSection.length;

  const negative = value < 0;
  const abs = Math.abs(value);

  // Round to maxDec decimals.
  const rounded = maxDec > 0 ? abs.toFixed(maxDec) : String(Math.round(abs));
  let [intPart, decPart = ''] = rounded.split('.');

  // Trim optional (#) trailing decimals down to the required minimum.
  while (decPart.length > minDec && decPart.endsWith('0')) {
    decPart = decPart.slice(0, -1);
  }

  intPart = intPart.padStart(minInt, '0');
  if (useGrouping) intPart = groupThousands(intPart);

  let out = intPart;
  if (decPart.length > 0) out += '.' + decPart;
  return (negative && out.replace(/[0.,]/g, '') !== '' ? '-' : negative ? '-' : '') + out;
}

/**
 * Numeric/currency formatting with the plugin's K/M/B scaling rule: a format
 * ending in K, M, or B (case-insensitive) divides the value and appends the
 * uppercase suffix, e.g. 2500000 with "0.0M" → "2.5M".
 */
export function formatNumberWithScaling(value: number, format: string | undefined, defaultFormat: string): string {
  if (!format || !format.trim()) {
    return formatDotNetNumber(value, defaultFormat);
  }
  const last = format[format.length - 1].toUpperCase();
  if (last === 'K' || last === 'M' || last === 'B') {
    const divisor = last === 'K' ? 1_000 : last === 'M' ? 1_000_000 : 1_000_000_000;
    const coreFormat = format.slice(0, -1) || '0';
    return formatDotNetNumber(value / divisor, coreFormat) + last;
  }
  return formatDotNetNumber(value, format);
}
