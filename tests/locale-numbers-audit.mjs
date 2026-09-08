// R52-9 frozen work order, 2026-09-08: execute the existing production parser.
// The app uses Number#toLocaleString() with the default Intl locale. Inject
// that default into each VM, then format actual numbers with the same API.
// Node only: no DOM, browser, sockets, or parser copied into this guard.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import vm from 'node:vm';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('const NUM_SHAPE');
const end = app.indexOf('/* READ A FIELD', start);
assert.ok(start >= 0 && end > start, 'production numeric region exists');
const source = app.slice(start, end);

function parser(locale) {
  const context = vm.createContext({ Intl: { NumberFormat: class extends Intl.NumberFormat {
    constructor(locales, options) { super(locales ?? locale, options); }
  } } });
  vm.runInContext(source, context);
  return raw => {
    context.raw = raw;
    return vm.runInContext('numParse(raw)', context);
  };
}

export function checkLocaleNumbers() {
  // There is no app locale allowlist. Cover the requested locales and each
  // additional grouping, digit, sign, and decimal shape used by these locales.
  const locales = ['en-US', 'en-GB', 'de-DE', 'de-CH', 'fr-FR', 'fr-CA',
    'ar', 'ar-EG', 'ar-SA', 'ar-MA', 'fa-IR', 'hi-IN', 'bn-BD', 'sv-SE',
    'ru-RU', 'pl-PL', 'es-ES', 'pt-BR', 'ja-JP', 'zh-CN', 'my-MM'];
  assert.equal(Intl.NumberFormat.supportedLocalesOf(locales).length, locales.length,
    'all guard locales must be available; do not silently skip coverage');
  // The default formatter rounds to three fraction digits. Use values it can
  // print exactly, so equality grades parsing rather than display rounding.
  const numbers = [0, -0, 0.001, -0.001, 0.125, 0.5, 1, 1.234, 12.345,
    82.5, 999, 999.999, 1000, 1234, 1234.5, 1234.567, 10000, 123456.789,
    1234567, 123456789.125, -1234, -1234.567, Number.MAX_SAFE_INTEGER, 1e21];
  let roundTrips = 0;
  for (const locale of locales) {
    const parse = parser(locale);
    for (const number of numbers) {
      const printed = number.toLocaleString(locale);
      const result = parse(printed);
      assert.equal(result.ok, true, `${locale} refused its output ${JSON.stringify(printed)}`);
      assert.equal(result.value, number, `${locale} changed ${JSON.stringify(printed)}`);
      roundTrips++;
    }
    for (const raw of ['', ' ', '12abc', '1e9', 'NaN', 'Infinity', '1.23.4',
      '1,23,4', '12 34', '1\u202f23', '١٢abc', '١٢\u200f٣']) {
      assert.ok(!parse(raw).ok, `${locale} accepted malformed ${JSON.stringify(raw)}`);
    }
    for (const number of [0, -0, 1.234, 1234.5]) assert.equal(parse(number).value, number);
    for (const number of [NaN, Infinity, -Infinity]) assert.ok(!parse(number).ok);
    for (const raw of ['1.5', '1,5', '.5', '+12.5']) {
      assert.equal(parse(raw).value, Number(raw.replace(',', '.')), `${locale} legacy decimal ${raw}`);
    }
  }
  const fr = parser('fr-FR'), ar = parser('ar-EG'), de = parser('de-DE'), en = parser('en-US');
  for (const space of [' ', '\u202f', '\u00a0']) {
    assert.equal(fr(`1${space}234,5`).value, 1234.5);
    assert.equal(fr(`12${space}345${space}678,125`).value, 12345678.125);
    assert.ok(!fr(`12${space}34,5`).ok, 'malformed space grouping');
  }
  for (const [raw, expected] of [['١٢٣٤', 1234], ['١٬٢٣٤', 1234],
    ['١٬٢٣٤٫٥', 1234.5], ['١٢٫٥', 12.5], ['١٢,٥', 12.5], ['1٬234٫5', 1234.5]]) {
    assert.equal(ar(raw).value, expected, `Arabic entry ${raw}`);
  }
  assert.equal(de('1.234').value, 1234, 'German v517 regression');
  assert.equal(de('1,234').value, 1.234, 'German decimal resolved by locale');
  assert.equal(en('1,234').value, 1234, 'English own grouped output');
  assert.equal(en('1.234').value, 1.234, 'English decimal resolved by locale');
  assert.equal(fr('1,234').value, 1.234, 'French decimal resolved by locale');
  // Positive CONTROL: French does not use a dot for either separator. Arabic
  // uses neither ASCII separator. These foreign 3-digit tails stay ambiguous.
  for (const [parse, raw] of [[fr, '1.234'], [fr, '-12.345'],
    [ar, '1.234'], [ar, '1,234'], [ar, '١,٢٣٤']]) {
    assert.equal(parse(raw).why, 'grouped', `CONTROL must refuse ${raw}`);
  }
  return `${roundTrips} formatter round trips across ${locales.length} locales; malformed and ambiguity controls passed`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`ok R52-9: ${checkLocaleNumbers()}`);
}
