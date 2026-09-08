// Shared acceptance predicate for the fixed band and its prove-red control.
export const bandPasses = sample => sample.count > 100
  && sample.matches[0] === 0 && sample.matches[1] / sample.count > 0.99;

// Reject the SAME predicate on both sides, with substantial hero-colour
// evidence. A blank screenshot or an unchanged dock is not a positive control.
export const controlPasses = samples => samples.length === 2
  && samples.every(sample => !bandPasses(sample) && sample.matches[0] > 100);
