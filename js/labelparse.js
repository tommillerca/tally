// Parse OCR text of a nutrition facts label (US and Canadian bilingual formats).
// Pure functions, unit-tested against fixture texts in tests/unit.test.js.

function normalize(text) {
  return text
    .replace(/ /g, ' ')
    .replace(/[|]/g, ' ')
    // drop the %-Daily-Value column so it can never be read as a gram/mg amount.
    // [ \t]* (never \s*) so it can't reach across a newline and eat the big
    // Calories number that sits a few lines above "% Daily Value".
    .replace(/(\d+(?:\.\d+)?)[ \t]*%/g, ' ')
    // letter O or l used as digits next to units
    .replace(/\bO(?=\s*(g|mg)\b)/gi, '0')
    .replace(/\b[lI](?=\s*(g|mg)\b)/g, '1')
    .replace(/(?<=\d)[oO]/g, '0')
    .replace(/[oO](?=\d)/g, '0')
    // l or I inside numbers
    .replace(/(?<=\d)[lI]/g, '1')
    .replace(/[lI](?=\d)/g, '1')
    // comma decimals
    .replace(/(\d),(\d)/g, '$1.$2');
}

function firstNum(line, { max = 10000 } = {}) {
  const m = line.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isFinite(v) && v <= max ? v : null;
}

// value + unit, preferring g/mg detection for sodium
function numWithUnit(line) {
  const m = line.match(/(\d+(?:\.\d+)?)\s*(mg|g)\b/i);
  if (m) return { v: parseFloat(m[1]), unit: m[2].toLowerCase() };
  const v = firstNum(line);
  return v == null ? null : { v, unit: null };
}

export function parseServingGrams(text) {
  // "(55g)" "(2/3 cup (55 g))" "(250 mL)"
  const m = text.match(/\(\s*(?:about\s*|environ\s*)?(\d+(?:\.\d+)?)\s*(g|ml)\s*\)/i)
    || text.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  if (!m) return null;
  return parseFloat(m[1]); // treat ml as g (close enough for label entry, user can edit)
}

// QA round 25 M7 (HIGH): two-column European panels ("Per 100 g | Per 45 g")
// put the per-100 g figure FIRST on every line, and firstNum() took it. A 45 g
// serving that should read 203 kcal reached the log as 451 kcal, 189 g fat,
// 76 g fibre with servingGrams null and warnings []: a 2.22x food, no warning.
// The 4/4/9 check cannot see it (per-100 g figures are internally perfect).
// Header line: contains "100 g"/"per 100" AND a serving marker (the word
// serving/portion, or a second gram figure). Returns which column is the
// serving one and the serving grams if the header carries them.
// ponytail: header and values must each sit on one OCR line; a header split
// across two lines is not detected and falls back to the old single-column read.
function detectColumns(line) {
  const hundred = line.match(/per\s*100|100\s*(g|ml)\b/i);
  if (!hundred) return null;
  const rest = line.slice(0, hundred.index) + ' '.repeat(hundred[0].length) + line.slice(hundred.index + hundred[0].length);
  const serving = rest.match(/serving|portion|(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  if (!serving) return null;
  const grams = rest.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i); // "Per serving (30 g)": word first, grams later
  return {
    col: serving.index < hundred.index ? 0 : 1,
    grams: grams ? parseFloat(grams[1]) : null,
  };
}

// Reduce a two-column value line to its serving column: "Fat 18.9 g 8.5 g" ->
// "Fat 8.5 g", "Energy 1892 kJ / 451 kcal 851 kJ / 203 kcal" -> "Energy 203 kcal".
// Tokens are grouped by unit so the kJ pair never shifts the kcal pair; a line
// with no unit group of two or more (a single value, or a stray digit in a
// name) is left alone and read exactly as before.
function pickColumn(line, col) {
  const toks = [...line.matchAll(/(\d+(?:\.\d+)?)\s*(kcal|kj|mg|g)?(?![a-z])/gi)];
  const groups = {};
  for (const t of toks) (groups[(t[2] || '').toLowerCase()] ||= []).push(t);
  const unit = ['kcal', 'g', 'mg', ''].find(u => (groups[u] || []).length >= 2);
  if (unit == null) return line;
  const first = Math.min(...toks.map(t => t.index));
  return line.slice(0, first) + groups[unit][Math.min(col, groups[unit].length - 1)][0];
}

export function parseNutritionText(raw) {
  const text = normalize(raw || '');
  // strip old-label "calories from fat 70" so it can't shadow calories
  const cleaned = text.replace(/calories\s+from\s+fat\s*\d*/gi, '');
  const lines = cleaned.split(/\n+/).map(l => l.trim()).filter(Boolean);

  const out = {
    servingText: null, servingGrams: null,
    kcal: null, fat: null, satFat: null, transFat: null,
    carbs: null, fiber: null, sugar: null, addedSugar: null,
    protein: null, sodium: null,
    warnings: [],
  };

  let cols = null; // set once the "Per 100 g | Per serving" header is seen (M7)
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!cols) {
      cols = detectColumns(line);
      if (cols) {
        // the header is the serving line on these panels; must run BEFORE the
        // serving-size branch below, whose regex would read the 100 g as the serving.
        out.servingText = out.servingText ?? line;
        if (cols.grams != null && cols.grams !== 100) out.servingGrams = out.servingGrams ?? cols.grams;
        out.warnings.push(`Two columns on this label; read the ${cols.col === 0 ? 'first' : 'second'} (per serving column).`);
        continue;
      }
    } else {
      line = pickColumn(line, cols.col);
    }
    const low = line.toLowerCase();

    if (out.servingText == null && /(serving\s*size|portion\b|^per\s+\d|^per\s+[a-z0-9/ ]*\()/i.test(low)) {
      const m = line.match(/(?:serving\s*size|portion|per)\s*:?\s*(.+)/i);
      const t = m ? m[1].trim() : line;
      if (!/container|contenant/i.test(t)) {
        out.servingText = t;
        out.servingGrams = parseServingGrams(t);
      }
      continue;
    }

    if (out.kcal == null && /calor/i.test(low) && !/from\s+fat/.test(low)) {
      let v = firstNum(line.replace(/calor[a-z]*/i, ''), { max: 3000 });
      if (v == null) { // big-font calories number often lands on the next line
        for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
          const cand = lines[j].match(/^(\d{1,4})\s*$/);
          if (cand) { v = parseFloat(cand[1]); break; }
        }
      }
      if (v != null && v >= 0 && v <= 2000) { out.kcal = v; continue; }
    }
    // EU style "Energy 1046 kJ / 250 kcal"
    if (out.kcal == null && /kcal/.test(low)) {
      const m = line.match(/(\d+(?:\.\d+)?)\s*kcal/i);
      if (m) { out.kcal = parseFloat(m[1]); continue; }
    }

    if (/satur/i.test(low)) { const n = numWithUnit(low); if (n && out.satFat == null) out.satFat = n.v; continue; }
    if (/\btrans\b/i.test(low)) { const n = numWithUnit(low); if (n && out.transFat == null) out.transFat = n.v; continue; }
    if (out.fat == null && /(total\s*fat|lipides|^fat\b|\bfat\s*\d)/i.test(low) && !/satur|trans/.test(low)) {
      const n = numWithUnit(low.replace(/total\s*fat|lipides?(\s*\/\s*fat)?|fat/gi, ''));
      if (n) { out.fat = n.v; continue; }
    }
    if (/cholest/i.test(low)) continue;
    if (out.sodium == null && /sodium/i.test(low)) {
      const n = numWithUnit(low.replace(/sodium/gi, ''));
      if (n) out.sodium = n.unit === 'g' ? n.v * 1000 : n.v; // store mg
      continue;
    }
    if (out.fiber == null && /fib(er|re)/i.test(low)) { const n = numWithUnit(low.replace(/fib(er|re)s?/gi, '')); if (n) out.fiber = n.v; continue; }
    if (/added\s+sugar|sucres\s+ajout/i.test(low)) { const n = numWithUnit(low.replace(/includes|added\s+sugars?|sucres\s+ajout[eé]s?/gi, '')); if (n && out.addedSugar == null) out.addedSugar = n.v; continue; }
    if (out.sugar == null && /sugar|sucres/i.test(low)) { const n = numWithUnit(low.replace(/total|sugars?|sucres/gi, '')); if (n) out.sugar = n.v; continue; }
    if (out.carbs == null && /carbohydrate|glucides/i.test(low)) { const n = numWithUnit(low.replace(/total|carbohydrates?|glucides?/gi, '')); if (n) out.carbs = n.v; continue; }
    if (out.protein == null && /prot[eé]in/i.test(low)) { const n = numWithUnit(low.replace(/prot[eé]ines?(\s*\/\s*protein)?/gi, '')); if (n) out.protein = n.v; continue; }
  }

  // Recover "Xg" misread as digits ending in 9 (e.g. "1g" -> 19) using parent bounds:
  // a sub-value can never exceed its parent on a real label.
  const fixNine = (v, limit) => {
    if (v != null && limit != null && v > limit && v % 10 === 9) {
      const c = Math.floor(v / 10);
      if (c <= limit) return c;
    }
    return v;
  };
  out.satFat = fixNine(out.satFat, out.fat);
  out.fiber = fixNine(out.fiber, out.carbs);
  out.sugar = fixNine(out.sugar, out.carbs);
  out.addedSugar = fixNine(out.addedSugar, out.sugar);

  // QA round 25 M7: the primary guard. Fat + carbs + protein cannot weigh more
  // than the serving they sit in. Runs BEFORE the >250 clearing rule because
  // that rule cannot see this failure: on the 45 g panel every misread macro
  // (19, 58, 76 g with the decimal point lost) was under 250 and survived.
  // 15% slack for rounding and label tolerances. The confirm sheet renders
  // warnings[] above the fields, so this is what the player sees before Save.
  if (out.servingGrams != null && out.fat != null && out.carbs != null && out.protein != null) {
    const mass = out.fat + out.carbs + out.protein;
    if (mass > out.servingGrams * 1.15) {
      out.warnings.push(`Fat, carbs and protein add up to ${Math.round(mass)} g, more than the ${out.servingGrams} g serving. These numbers look like per-100 g, not per serving. Check each value before saving.`);
    }
  }

  // Plausibility guards against stray OCR junk
  for (const k of ['fat', 'satFat', 'transFat', 'carbs', 'fiber', 'sugar', 'addedSugar', 'protein']) {
    if (out[k] != null && out[k] > 250) { out[k] = null; out.warnings.push(`${k} looked wrong, cleared`); }
  }
  if (out.sodium != null && out.sodium > 10000) { out.sodium = null; out.warnings.push('sodium looked wrong, cleared'); }

  const missing = ['kcal', 'fat', 'carbs', 'protein'].filter(k => out[k] == null);
  if (missing.length) out.warnings.push(`Could not read: ${missing.join(', ')}`);

  if (out.kcal != null && out.fat != null && out.carbs != null && out.protein != null) {
    const est = 4 * out.protein + 4 * out.carbs + 9 * out.fat;
    if (Math.abs(est - out.kcal) > Math.max(25, out.kcal * 0.25)) {
      out.warnings.push(`Macros compute to ~${Math.round(est)} kcal but label read ${out.kcal}. Double-check values.`);
    }
  }
  return out;
}
