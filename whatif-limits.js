/* What-if limits: pure helpers (no DOM, no app state) so the rules can be unit-tested.
   The sliders in the What-if panel must never offer a value the product does not allow. */
(function(root){
  'use strict';
  var PREMIUM_CAP = 500000;            // highest premium per payment offered
  var WLC_MIN = 1000000, WLC_MAX = 200000000;   // Faida Maisha whole life cover
  // Maturity-age caps taken from the product brochures where the app data has none.
  var SMART_MAT_AGE = { 'Smart Save': 70, 'Smart Scholar': 68 };

  function roundUp(v, s){ return Math.ceil(v / s) * s; }
  function stepFor(lo, hi){ var span = hi - lo; return span <= 20000 ? 100 : span <= 100000 ? 500 : span <= 1000000 ? 5000 : span <= 10000000 ? 50000 : span <= 50000000 ? 500000 : 1000000; }

  // Candidate band edges per kind. A band is dropped when it lies fully outside [min,max].
  var EDGES = {
    premium: [5000, 25000, 100000, 500000],
    sa:      [200000, 1000000, 5000000, 20000000, 50000000],
    target:  [100000, 1000000, 10000000, 100000000],
    wlc:     [1000000, 10000000, 50000000, 200000000]
  };
  function bandsFor(kind, min, max){
    var edges = (EDGES[kind] || EDGES.premium).slice(), pts = [min];
    edges.forEach(function(e){ if(e > min && e < max) pts.push(e); });
    pts.push(max);
    var out = [];
    for(var i = 0; i < pts.length - 1; i++){
      var lo = pts[i], hi = pts[i + 1];
      if(hi <= lo) continue;
      out.push({ lo: lo, hi: hi, step: stepFor(lo, hi) });
    }
    // very narrow first band: merge into the next so no useless two-value slider
    if(out.length > 1 && (out[0].hi - out[0].lo) < out[0].step * 3){ out[1].lo = out[0].lo; out.shift(); }
    if(!out.length) out.push({ lo: min, hi: Math.max(min, max), step: stepFor(min, max) });
    return out;
  }
  function bandIndexFor(bands, v){
    for(var i = 0; i < bands.length; i++) if(v >= bands[i].lo && v <= bands[i].hi) return i;
    return v < bands[0].lo ? 0 : bands.length - 1;
  }
  // Snap a value into a band and onto its step grid, never outside [lo,hi].
  function snap(v, band){
    var s = band.step, x = Math.round((v - band.lo) / s) * s + band.lo;
    if(x < band.lo) x = band.lo; if(x > band.hi) x = band.hi;
    return Math.round(x * 100) / 100;
  }
  // Valid terms from a list of allowed years -> {min,max,step,fixed}
  function termRange(options, current){
    var o = (options || []).filter(function(t){ return isFinite(t); }).sort(function(a,b){ return a - b; });
    if(!o.length) return { min: current, max: current, step: 1, fixed: true, options: [current] };
    var step = 1; if(o.length > 1){ step = o[1] - o[0]; for(var i = 2; i < o.length; i++) if(o[i] - o[i-1] !== step){ step = 1; break; } }
    return { min: o[0], max: o[o.length - 1], step: step, fixed: o.length === 1, options: o };
  }
  function range(a, b){ var r = []; for(var i = a; i <= b; i++) r.push(i); return r; }
  root.WhatIfLimits = { PREMIUM_CAP: PREMIUM_CAP, WLC_MIN: WLC_MIN, WLC_MAX: WLC_MAX, SMART_MAT_AGE: SMART_MAT_AGE,
    roundUp: roundUp, stepFor: stepFor, bandsFor: bandsFor, bandIndexFor: bandIndexFor, snap: snap, termRange: termRange, range: range };
  if(typeof module !== 'undefined' && module.exports) module.exports = root.WhatIfLimits;
})(typeof window !== 'undefined' ? window : globalThis);
