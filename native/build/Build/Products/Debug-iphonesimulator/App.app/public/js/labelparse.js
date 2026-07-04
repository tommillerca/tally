// Parse OCR text of a nutrition facts label (US and Canadian bilingual formats).
// Pure functions, unit-tested against fixture texts in tests/unit.test.js.

function normalize(text) {
  return text
    .replace(/ /g, ' ')
    .replace(/[|]/g, ' ')
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
