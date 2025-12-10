console.log("app.js loaded");

import { ascii7BitsForText } from "./ascii.js";

let noiseInterval = null;

//For freezing noise values
let isFrozen = false;
const freezeBtn = document.getElementById('freeze-btn');
const copyNoisyBtn = document.getElementById('copy-noisy-btn');
const copyStatus = document.getElementById('copy-status');


// map bit → physical level
function bitToLevel(b) {
  return b === "1" ? "8.0" : "0.0";
}

// clamp helper
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Binary centers and threshold (unchanged)
const BINARY_LOW = 0.0, BINARY_HIGH = 8.0, THRESH = 5.0;
const SCALE_MAX = 10.0;

// 32-level direct character→level mapping (indices 1..32)
const STEP32 = 0.309375; // 32 * STEP32 = 9.9
const INDEX_TO_CHAR = [
  null, // pad to make 1-based
  'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',' ', '!', '?', ',', '.', '&'
];
const CHAR_TO_INDEX = Object.fromEntries(INDEX_TO_CHAR
  .map((ch,i)=>[ch,i]).filter(([ch,i])=>ch && i>=1));

// level for index i (1..32): i * STEP32
function indexToLevel(i) { return i * STEP32; }

// nearest index from a numeric level value
function levelToNearestIndex(v) {
  let i = Math.round(v / STEP32);
  if (i < 1) i = 1;
  if (i > 32) i = 32;
  return i;
}

//To help auto-copy
async function copyTextFrom(elId) {
  const text = (document.getElementById(elId)?.textContent || "").trim();
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  } catch { return false; }
}

function showCopyStatus(msg, ok=true) {
  if (!copyStatus) return;
  copyStatus.textContent = msg;
  copyStatus.style.color = ok ? '#2b6' : '#c00';
  copyStatus.classList.remove('hidden');
  setTimeout(()=>copyStatus.classList.add('hidden'), 1200);
}

function setNoisyColor(active) {
  const box = document.getElementById('encode-output-noisy');
  if (!box) return;
  box.classList.toggle('noisy-active', active);
}



const modeEncodeSel = document.getElementById('mode-encode');
const modeDecodeSel = document.getElementById('mode-decode');


function updateNoisyFromClean() {
  if (isFrozen) { renderGraph(); return; }

  const clean = document.getElementById('encode-output').textContent;
  if (!clean || !clean.trim()) { setNoisyColor(false); renderGraph(); return; }

  const mode = modeEncodeSel ? modeEncodeSel.value : 'binary7';
  const decimals = (mode === 'binary7') ? 1 : 2;
  const amp = Number(noiseSlider?.value || 0);

  document.getElementById('encode-output-noisy').textContent =
    addNoise(clean, amp, decimals, mode);

  setNoisyColor(amp > 0);

  renderGraph();
}





//Tried and failed to make the disallowed characters turn red.
const ALLOWED_REGEX = /^[A-Z !\?\.,&]$/; // one char: A–Z, space, ! ? , . &

function validateInputs() {
  const inputs = Array.from(document.querySelectorAll('#char-grid .char'));
  const invalids = [];

  const cleaned = inputs.map((i, idx) => {
    const raw = (i.value || "").slice(0,1);
    const up = raw.toUpperCase();

    if (!raw) {
      i.classList.remove('invalid');
      return "";
    }

    if (ALLOWED_REGEX.test(up)) {
      i.classList.remove('invalid');
      i.value = up;
      return up;
    } else {
      i.classList.add('invalid');   // ← apply highlight
      invalids.push({ idx: idx + 1, ch: raw });
      return "";
    }
  });

  const box = document.getElementById('char-errors');
  if (invalids.length > 0) {
    box.textContent = `Only A–Z, space, ! ? , . & allowed. Invalid: ` +
                      invalids.map(o => `${o.idx}:"${o.ch}"`).join(", ");
    box.classList.remove('hidden');
    return { ok: false, text: cleaned.join("") };
  } else {
    box.textContent = "";
    box.classList.add('hidden');
    return { ok: true, text: cleaned.join("") };
  }
}

document.querySelectorAll('#char-grid .char').forEach(el => {
  el.addEventListener('input', validateInputs);
});



function fmt(n, decimals) { return n.toFixed(decimals); }

function jitterValue(baseValue, amp, mode) {
  const isBinaryLow = mode === 'binary7' && Math.abs(baseValue - BINARY_LOW) < 1e-9;
  const jitter = isBinaryLow ? Math.random() * amp : (Math.random() * 2 - 1) * amp;
  return clamp(baseValue + jitter, 0.0, SCALE_MAX);
}

// apply noise U[-Δ, +Δ], except binary lows only get additive noise
function addNoise(levelString, amp, decimals = 1, mode = 'binary7') {
  if (!levelString || !levelString.trim()) return "";
  const lines = levelString.trim().split(/\n+/);
  return lines.map(line => {
    const nums = line.trim().split(/\s+/).map(parseFloat);
    const noisy = nums.map(x => {
      const y = jitterValue(x, amp, mode);
      return y.toFixed(decimals);
    });
    return noisy.join(" ");
  }).join("\n");
}



function parseLevels(s) {
  if (!s || !s.trim()) return [];
  return s.trim().split(/\s+/).map(Number).filter(n => Number.isFinite(n));
}

// repeat each symbol K times (for a longer horizontal hold on the graph)
function repeatEach(arr, K) {
  const out = [];
  for (const v of arr) for (let i = 0; i < K; i++) out.push(v);
  return out;
}

// fast noise for the GRAPH; optionally avoid rounding for smoothness
function makeFastNoiseTrace(symbolLevels, amp, K, noRound=false, decimals=1, mode='binary7') {
  const out = [];
  for (const v of symbolLevels) {
    for (let i = 0; i < K; i++) {
      const y = jitterValue(v, amp, mode);
      out.push(noRound ? y : Number(y.toFixed(decimals)));
    }
  }
  return out;
}

// Run validation whenever a box changes
document.querySelectorAll('#char-grid .char').forEach(el => {
  el.addEventListener('input', validateInputs);
});



function drawSignal(canvas, cleanArr, noisyArr) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const mL = 40, mR = 10, mT = 10, mB = 25;
  const w = W - mL - mR, h = H - mT - mB;

  ctx.clearRect(0,0,W,H);

  // axes
  ctx.strokeStyle = '#1f1f1f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mL, mT); ctx.lineTo(mL, mT + h); ctx.lineTo(mL + w, mT + h);
  ctx.stroke();

  // value→y map (0..10)
  const yOf = v => mT + h - (v / SCALE_MAX) * h;

  // reference lines: 0,2,4,6,8,10 plus threshold at 5
  const ticks = [0, 2, 4, 6, 8, 10];
  ticks.forEach(v => {
    const y = yOf(v);
    ctx.strokeStyle = 'rgba(0,255,149,0.15)';
    ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(mL + w, y); ctx.stroke();
    ctx.fillStyle = '#00ff95';
    ctx.font = '11px "Cascadia Code", "Fira Code", "Consolas", "Courier New", monospace';
    ctx.fillText(v.toString(), 6, y - 2);
  });

  // threshold marker
  const yThresh = yOf(THRESH);
  ctx.strokeStyle = 'rgba(255,59,59,0.25)';
  ctx.beginPath(); ctx.moveTo(mL, yThresh); ctx.lineTo(mL + w, yThresh); ctx.stroke();
  ctx.fillStyle = '#ff3b3b';
  ctx.font = '11px "Cascadia Code", "Fira Code", "Consolas", "Courier New", monospace';
  ctx.fillText(THRESH.toString(), 6, yThresh - 2);

  // choose x scale based on the longer of the two arrays
  const n = Math.max(cleanArr.length, noisyArr.length);
  if (n < 2) return;
  const xOfIndex = i => mL + (i/(n-1)) * w;


  // plot helper
  function plotStep(arr, style) {
    if (arr.length === 0) return;
    ctx.strokeStyle = style;
    ctx.lineWidth = 2;
    ctx.beginPath();

    // start at first sample
    let xPrev = xOfIndex(0);
    let yPrev = yOf(arr[0]);
    ctx.moveTo(xPrev, yPrev);

    for (let i = 0; i < arr.length - 1; i++) {
      const xNext = xOfIndex(i + 1);
      const yLevel = yOf(arr[i]);       // stay at current value
      const yJump  = yOf(arr[i + 1]);   // next value

      // horizontal segment (hold value)
      ctx.lineTo(xNext, yLevel);
      // vertical jump to next value
      ctx.lineTo(xNext, yJump);

      xPrev = xNext;
      yPrev = yJump;
    }
    ctx.stroke();
  }


  // clean = neon green, noisy = red
  plotStep(cleanArr, '#00ff95');
  plotStep(noisyArr, '#ff3b3b');
}

function computeKForXResolution(symbolCount, canvasWidth) {
  const mL = 40, mR = 10;
  const w = Math.max(1, canvasWidth - mL - mR);
  const DX_TARGET = 1.5;          // 1–2 px looks smooth

  let k;
  if (symbolCount <= 1) {
    k = Math.ceil(w / DX_TARGET); // fill width with dense samples
  } else {
    k = Math.ceil(w / ((symbolCount - 1) * DX_TARGET));
  }

  const MIN_K = 8;
  const MAX_K = 1200;             // raise ceiling for 1-symbol case
  return Math.max(MIN_K, Math.min(MAX_K, k));
}



function renderGraph() {
  const canvas = document.getElementById('signal');
  if (!canvas) return;

  const amp = Number(document.getElementById('noise')?.value || 0);
  const mode = modeEncodeSel ? modeEncodeSel.value : 'binary7';
  const decimals = (mode === 'binary7') ? 1 : 2;

  const cleanText = document.getElementById('encode-output').textContent;
  const cleanSymbols = parseLevels(cleanText);
  if (cleanSymbols.length === 0) { drawSignal(canvas, [], []); return; }

  const K = computeKForXResolution(cleanSymbols.length, canvas.width);
  const cleanTrace = repeatEach(cleanSymbols, K);
  const noisyTrace = amp === 0
    ? []
    : makeFastNoiseTrace(cleanSymbols, amp, K, /*noRound=*/true, decimals, mode);

  drawSignal(canvas, cleanTrace, noisyTrace);
}

modeEncodeSel.addEventListener('change', () => { modeDecodeSel.value = modeEncodeSel.value; renderGraph(); });
modeDecodeSel.addEventListener('change', () => { modeEncodeSel.value = modeDecodeSel.value; renderGraph(); });


//Tab switching
const tabEncode = document.getElementById('tab-encode');
const tabDecode = document.getElementById('tab-decode');
const encodeView = document.getElementById('encode-view');
const decodeView = document.getElementById('decode-view');

tabEncode.onclick = () => {
  // tab visuals
  tabEncode.classList.add('active');
  tabDecode.classList.remove('active');

  // panel visibility + background state
  encodeView.classList.remove('hidden', 'inactive-panel');
  encodeView.classList.add('active-panel');

  decodeView.classList.add('hidden', 'inactive-panel');
  decodeView.classList.remove('active-panel');
  renderGraph();
};

tabDecode.onclick = () => {
  // tab visuals
  tabDecode.classList.add('active');
  tabEncode.classList.remove('active');

  // panel visibility + background state
  decodeView.classList.remove('hidden', 'inactive-panel');
  decodeView.classList.add('active-panel');

  encodeView.classList.add('hidden', 'inactive-panel');
  encodeView.classList.remove('active-panel');
};


document.getElementById('encode-btn').onclick = () => {
  //unfreeze noise if frozen
  setFrozen(false);
  const mode = modeEncodeSel ? modeEncodeSel.value : 'binary7';
  const v = validateInputs();
  if (!v.ok) {
    // clear outputs and graph if invalid
    document.getElementById('encode-output').textContent = "";
    document.getElementById('encode-output-noisy').textContent = "";
    setNoisyColor(false);
    renderGraph();
    return; // stop; user must fix red boxes
  }
  const rawText = v.text; // already uppercased and filtered

  let rows = [];
  let decimals = (mode === 'binary7') ? 1 : 2;

  if (mode === 'binary7') {
    // existing 7-bit path
    const bits = ascii7BitsForText(rawText);
    rows = bits.map(b => b.split("").map(bit => (bit === "1" ? BINARY_HIGH : BINARY_LOW)));
    decimals = 1; // one decimal for binary
  } else {
    // 32-level direct mapping
    rows = encodeBase32_levels(rawText);
    decimals = 2; // two decimals for 32-level (your request)
  }

  const clean = rows.map(arr => arr.map(v => fmt(v, decimals)).join(" ")).join("\n");
  document.getElementById('encode-output').textContent = clean || "(no input)";

  updateNoisyFromClean(); // ← starts from the new clean text

};




const noiseSlider = document.getElementById("noise");

noiseSlider.addEventListener("input", () => {
  if (noiseInterval) clearInterval(noiseInterval);
  updateNoisyFromClean();

  const amp = Number(noiseSlider.value);
  if (amp === 0) return;

  const mode = modeEncodeSel ? modeEncodeSel.value : 'binary7';
  const decimals = (mode === 'binary7') ? 1 : 2;
  noiseInterval = setInterval(() => {
    const cleanNow = document.getElementById('encode-output').textContent;
    document.getElementById('encode-output-noisy').textContent =
      cleanNow ? addNoise(cleanNow, amp, decimals, mode) : "";
    setNoisyColor(amp > 0);
    renderGraph();
  }, 200);
});

// restart animation to respect any existing slider value
const amp = Number(noiseSlider.value);
if (noiseInterval) clearInterval(noiseInterval);
if (amp > 0) {
  const mode = modeEncodeSel ? modeEncodeSel.value : 'binary7';
  const decimals = (mode === 'binary7') ? 1 : 2;
  noiseInterval = setInterval(() => {
    const cleanNow = document.getElementById('encode-output').textContent;
    document.getElementById('encode-output-noisy').textContent =
      cleanNow ? addNoise(cleanNow, amp, decimals, mode) : "";
    setNoisyColor(amp > 0);
    renderGraph();
  }, 200);
}

modeEncodeSel.addEventListener('change', () => {
  updateNoisyFromClean();
});


function decodeLevelsToText(input) {
  // 1. split on any whitespace
  const nums = input.trim().split(/\s+/);

  // 2. convert each number → bit
  const bits = nums.map(n => {
    const value = parseFloat(n);
    return value >= 5 ? "1" : "0";   // fixed threshold
  });

  // 3. group into chunks of 7
  const chars = [];
  for (let i = 0; i < bits.length; i += 7) {
    const chunk = bits.slice(i, i + 7).join("");
    if (chunk.length < 7) break; // ignore incomplete tail

    // 4. convert each 7-bit chunk → ASCII char
    const code = parseInt(chunk, 2);
    chars.push(String.fromCharCode(code));
  }

  return chars.join("");
}

document.getElementById('decode-btn').onclick = () => {
  const mode = modeDecodeSel ? modeDecodeSel.value : 'binary7';
  const raw = document.getElementById('decode-input').value.trim();
  if (!raw) { 
    document.getElementById('decode-output').textContent = "(no output)"; 
    return; 
  }

  const levels = raw.split(/\s+/).map(Number).filter(n => Number.isFinite(n));
  let text = "";

  if (mode === 'binary7') {
    // threshold → bits → chunks of 7 → ASCII
    const bits = levels.map(v => (v >= THRESH ? "1" : "0")).join("");
    const chars = [];
    for (let i = 0; i + 7 <= bits.length; i += 7) {
      chars.push(String.fromCharCode(parseInt(bits.slice(i, i+7), 2)));
    }
    text = chars.join("").toUpperCase();     // ← enforce uppercase
  } else {
    // 32-level nearest-match decoding
    text = decodeBase32_fromLevels(levels).toUpperCase(); // ← enforce uppercase
  }

  document.getElementById('decode-output').textContent = text || "(no output)";
};



// ENCODE (32-level): one number per character, one line per character
function encodeBase32_levels(text) {
  const rows = [];
  for (const ch of text) {
    const idx = CHAR_TO_INDEX[ch];
    if (!idx) continue; // skip unsupported chars
    const level = indexToLevel(idx);
    rows.push([level]);
  }
  return rows; // array of arrays; each row has one level
}

// DECODE (32-level): nearest-level wins
function decodeBase32_fromLevels(levelsFlat) {
  const out = [];
  for (const v of levelsFlat) {
    const idx = levelToNearestIndex(v);
    const ch = INDEX_TO_CHAR[idx] || '';
    out.push(ch);
  }
  return out.join('');
}

function setFrozen(state) {
  isFrozen = state;

  // button label
  if (freezeBtn) freezeBtn.textContent = isFrozen ? 'Unfreeze noise' : 'Freeze noise';

  // stop or start interval
  if (noiseInterval) { clearInterval(noiseInterval); noiseInterval = null; }

  // disable/enable slider
  const slider = document.getElementById('noise');
  if (slider) slider.disabled = isFrozen;

  // when freezing, do NOT recompute noise; keep current numbers and graph
  // when unfreezing, resume animation if amp > 0
  if (!isFrozen) {
    const amp = Number(slider?.value || 0);
    if (amp > 0) noiseInterval = setInterval(updateNoisyFromClean, 200);
  }

  renderGraph(); // redraw using current values
}


//Freeze Button
if (freezeBtn) {
  freezeBtn.addEventListener('click', async () => {
    // If we are about to freeze, ensure the current noisy text exists
    if (!isFrozen) {
      // if no noisy values yet, generate once from the clean text
      const noisyBox = document.getElementById('encode-output-noisy');
      if (noisyBox && (!noisyBox.textContent || !noisyBox.textContent.trim())) {
        updateNoisyFromClean();
      }
    }
    setFrozen(!isFrozen);

    // Auto-copy on freeze
    //if (isFrozen) {
    //  const ok = await copyTextFrom('encode-output-noisy');
    //  showCopyStatus(ok ? 'Copied noisy values' : 'Copy failed', ok);
    //}
  });
}

if (copyNoisyBtn) {
  copyNoisyBtn.addEventListener('click', async () => {
    const ok = await copyTextFrom('encode-output-noisy');
    showCopyStatus(ok ? 'Copied noisy values' : 'Copy failed', ok);
  });
}
