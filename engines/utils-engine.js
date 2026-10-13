/**
 * Shared formatting/validation utilities — no data dependency.
 */
(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
  } else {
    root.UtilsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';

function fmt(n){
  if(n===null||n===undefined||isNaN(n)) return "—";
  return "KES " + Math.round(n).toLocaleString('en-KE');
}

function fmtPct(n){ return (n*100).toFixed(2)+"%"; }

function normalizeKenyanPhone(raw){
  if(!raw) return null;
  let digits = raw.replace(/[\s\-()]/g, '');
  // Accept +254/254 country-code forms and normalize to local 0-prefixed form
  if(digits.startsWith('+254')) digits = '0'+digits.slice(4);
  else if(digits.startsWith('254') && digits.length===12) digits = '0'+digits.slice(3);
  // Valid Kenyan mobile: 0 + (7 or 1) + 8 digits = 10 digits total
  if(!/^0[71]\d{8}$/.test(digits)) return null;
  return digits;
}


  return { fmt, fmtPct, normalizeKenyanPhone };
});
