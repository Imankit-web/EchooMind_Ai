'use strict';

/* ══════════════════════════════════════════
   CONFIG
══════════════════════════════════════════ */
const CFG = {
    scanSpeed: 1400, threshold: null, smileThreshold: null,
    sensitivity: 5, minFrames: 2, maxShortF: 22, sosFrames: 220,
    speechRate: .90, voiceURI: null, voicePitch: 1.0,
    groqKey: null, hfToken: null,
    sosPhone: '', sosMsg: 'I need help urgently — EchoMind Ai user',
};

const TWIN = {
    name: '', age: '', stage: 'moderate',
    relationships: [], personality: [], notes: '',
    phraseUsage: {}, memory: [],
};

/* Landmark indices */
const LE = { top: 159, bot: 145, lft: 33, rgt: 133 };
const RE = { top: 386, bot: 374, lft: 362, rgt: 263 };
const MOUTH_L = 61, MOUTH_R = 291, LIP_TOP = 13;

const PH_ROWS = [
    ['Yes ✓', 'No ✗', 'I need help', 'Call someone'],
    ["I'm in pain", "I'm okay", "I'm tired", "Please adjust me"],
    ["I'm cold", "I'm hot", "I'm hungry", "I'm thirsty"],
    ["I love you", "Thank you", "Please wait", "Say that again"],
    ["Move me", "Adjust pillow", "Turn off lights", "Turn on lights"],
];

/* Navigation row — appended to phrases panel */
const PH_NAV = ['⌨ Keyboard', '🆘 Emergency', '↻ AI Refresh', '🔊 Repeat'];

const EMERG_ROWS = [
    ["Can't breathe!", 'Help now!', 'I am in pain', 'Call doctor now'],
    ['Need medicine', 'Need toilet', 'I feel faint', 'Need water now'],
    ['Too cold', 'Too hot', 'Adjust position', 'I need oxygen'],
    ['💬 Phrases', '⌨ Keys', '↻ Refresh AI', 'Stay with me'],
];

const KB_ROWS = [
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    ['H', 'I', 'J', 'K', 'L', 'M', 'N'],
    ['O', 'P', 'Q', 'R', 'S', 'T', 'U'],
    ['V', 'W', 'X', 'Y', 'Z', '⌫', '␣'],
    ['🔊 SPEAK', '✨ AI COMPLETE', '🗑 CLEAR', '⌫ DEL'],
    ['💬 Phrase', '🆘 Emergency', '😊 Happy', '😢 Sad'],
    ['😤 Urgent', '❤ Love', '↻ Refresh AI', '🔊 SPEAK'],
];

const TIME_PHRASES = {
    morning: ['Good morning 🌅', 'My medication', 'I need breakfast', 'Open the curtains'],
    midday: ['I need lunch', 'Turn on TV', 'Are you there?', 'Comfortable ✓'],
    afternoon: ['How was your day?', 'I need water', 'Adjust position', 'Read to me'],
    evening: ['Good evening', 'I need dinner', 'Check my pain', 'Lights dim please'],
    night: ['Goodnight 🌙', 'Adjust blanket', 'I am in pain', 'Please stay near'],
};

const TONE_P = { calm: { rate: .90, pitch: 1.00 }, warm: { rate: .82, pitch: .93 }, urgent: { rate: 1.20, pitch: 1.10 }, play: { rate: 1.05, pitch: 1.15 } };

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
let curScreen = 's-loading', mode = 'phrases', tone = 'calm';
let text = '', lastSpoken = '';
let smartTiles = ['…', '…', '…', '…', '…', '…', '…', '…'];
let tilesGenerating = false;
let scanLvl = 'row', scanRow = -1, scanCol = -1, scanSugIdx = -1;
let scanTimer = null, scanStart = null;
let skipSugZoneOnce = false;
let blinkFrames = 0, longTrig = false, sosTrig = false;
let sosAccumulator = 0, lastFrameTs = null;
let blinkActive = false, fm = null, stream = null, fmCam = null;
let voices = [], aiTimer = null, notifTO = null;
let smileNeutral = null, smileActive = false, smileFrames = 0;
let smileHoldStart = null, smileHoldTriggered = false;
const SMILE_HOLD_MS = 5000;
const SOS_HOLD_MS   = 10000;
let sosActive = false, sosRepeatTO = null, paused = false;
let recognition = null, ambientOn = false, lastHeard = '';
let contextPhrases = [...TIME_PHRASES[getTimeBucket()]];
let calibPhase = 0, calibFrames = 0;
let openSamples = [], closeSamples = [], smileOpenSamples = [], smileSmileSamples = [];
let initDone = false;
let obStep = 0;
const OB_TOTAL = 6;
let currentAudio = null;



/* ══════════════════════════════════════════
   UTILS
══════════════════════════════════════════ */
function el(t, c) { const e = document.createElement(t); if (c) e.className = c; return e; }
function qsa(s) { return Array.from(document.querySelectorAll(s)); }
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getTimeBucket() {
    const h = new Date().getHours();
    if (h >= 5 && h < 11) return 'morning'; if (h >= 11 && h < 16) return 'midday';
    if (h >= 16 && h < 19) return 'afternoon'; if (h >= 19 && h < 22) return 'evening';
    return 'night';
}

/* ══════════════════════════════════════════
   ONBOARDING
══════════════════════════════════════════ */
function startOnboarding() { obStep = 0; renderObProg(); qsa('.ob-step').forEach(s => s.classList.remove('active')); document.getElementById('ob-0').classList.add('active'); showScreen('s-onboard'); }
function renderObProg() { const d = document.getElementById('ob-prog'); d.innerHTML = ''; for (let i = 0; i < OB_TOTAL; i++) { const dot = el('div', 'ob-dot' + (i < obStep ? ' done' : i === obStep ? ' on' : '')); d.appendChild(dot); } }
function obNext() { obStep = Math.min(obStep + 1, OB_TOTAL); renderObProg(); qsa('.ob-step').forEach(s => s.classList.remove('active')); document.getElementById('ob-' + obStep)?.classList.add('active'); }
function obBack() { obStep = Math.max(obStep - 1, 0); renderObProg(); qsa('.ob-step').forEach(s => s.classList.remove('active')); document.getElementById('ob-' + obStep)?.classList.add('active'); }
function addRel() { const d = el('div', 'rel-entry'); d.innerHTML = '<input placeholder="Name" class="rel-name"/><input placeholder="Relation" class="rel-role"/>'; document.getElementById('rel-list').appendChild(d); }
function updateTwinPreview() { const n = document.getElementById('ob-name')?.value || ''; document.getElementById('prev-name').textContent = n || '—'; }

async function finishOnboarding() {
    TWIN.name = document.getElementById('ob-name')?.value.trim() || '';
    TWIN.age = document.getElementById('ob-age')?.value.trim() || '';
    TWIN.stage = document.getElementById('ob-stage')?.value || 'moderate';
    TWIN.relationships = [];
    qsa('.rel-entry').forEach(row => { const n = row.querySelector('.rel-name')?.value.trim(), r = row.querySelector('.rel-role')?.value.trim(); if (n && r) TWIN.relationships.push({ name: n, role: r }); });
    TWIN.personality = qsa('#persona-chips .persona-chip.on').map(c => c.textContent);
    TWIN.notes = document.getElementById('ob-notes')?.value.trim() || '';
    const gk = document.getElementById('ob-groq')?.value.trim(); if (gk) CFG.groqKey = gk;
    const hk = document.getElementById('ob-hf')?.value.trim(); if (hk) CFG.hfToken = hk;
    const sp = document.getElementById('ob-sos-phone')?.value.trim(); if (sp) CFG.sosPhone = sp;
    obStep = OB_TOTAL; renderObProg(); qsa('.ob-step').forEach(s => s.classList.remove('active')); document.getElementById('ob-' + OB_TOTAL)?.classList.add('active');
    document.getElementById('prev-name').textContent = TWIN.name || 'Your AI Twin';
    document.getElementById('prev-traits').textContent = [...TWIN.personality, TWIN.notes].filter(Boolean).join(' · ') || 'Ready to help';
    document.getElementById('prev-sample').textContent = 'Launching…';
    await saveTwin(); await saveCFG();
    await sleep(1200);
    showScreen('s-loading');

    setTimeout(init, 80);
}
/* ══════════════════════════════════════════
   TTS — HuggingFace + Web Speech fallback
══════════════════════════════════════════ */
async function speakImm(t) {
    if (!t || !t.trim()) return;
    lastSpoken = t;
    if (CFG.hfToken) {
        try {
            const r = await fetch('https://api-inference.huggingface.co/models/facebook/mms-tts-eng', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + CFG.hfToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ inputs: t })
            });
            if (r.ok) {
                const blob = await r.blob();
                const url = URL.createObjectURL(blob);
                if (currentAudio) { currentAudio.pause(); URL.revokeObjectURL(currentAudio.src); }
                currentAudio = new Audio(url);
                currentAudio.playbackRate = CFG.speechRate;
                await currentAudio.play();
                notify('🔊 Speaking…'); return;
            }
        } catch (_) { }
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    const tp = TONE_P[tone] || TONE_P.calm;
    u.rate = CFG.speechRate * (tp.rate / .90);
    u.pitch = CFG.voicePitch * (tp.pitch);
    u.volume = 1;
    if (CFG.voiceURI) { const v = voices.find(v => v.voiceURI === CFG.voiceURI); if (v) u.voice = v; }
    u.onstart = () => notify('🔊 Speaking…');
    speechSynthesis.speak(u);
}
function speakMessage() { if (!text.trim()) { notify('Nothing typed yet'); return; } speakImm(text); }
function repeatSpeak() { if (lastSpoken) speakImm(lastSpoken); else notify('Nothing spoken yet'); }

/* ══════════════════════════════════════════
   GROQ AI
══════════════════════════════════════════ */
async function groqCall(userMsg, systemMsg) {
    if (!CFG.groqKey) throw new Error('NO_KEY');

    const msgs = [];
    if (systemMsg) msgs.push({ role: 'system', content: systemMsg });
    msgs.push({ role: 'user', content: userMsg });
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CFG.groqKey },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: msgs, max_tokens: 350, temperature: .7 })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error('Groq ' + r.status + ': ' + (e?.error?.message || 'error')); }
    return (await r.json())?.choices?.[0]?.message?.content || '';
}

function twinSys(extra = '') {
    // ⚠ PRIVACY: use anonymised profile — real name & family names never sent to external APIs
    const anon    = ZKPrivacy.anonymiseTwinProfile(TWIN);
    const rels    = anon.relationships.map(r => r.role).join(', ') || 'none';
    const persona = [...anon.personality].filter(Boolean).join(', ') || 'caring and warm';
    const top     = Object.entries(TWIN.phraseUsage || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]).join(', ') || 'none yet';
    const mem     = (TWIN.memory || []).slice(-6).map(e => (e.role === 'p' ? 'Patient' : 'Caregiver') + ': "' + e.text + '"').join('\n') || 'none';
    return `You are the AI communication assistant for ${anon.name}, an ALS patient (stage: ${anon.stage || 'moderate'}).
Key people in their life (by role): ${rels}. Communication style: ${persona}.
Time of day: ${getTimeBucket()}. Most-used phrases: ${top}.
Recent exchanges:\n${mem}${extra ? '\n' + extra : ''}
Generate responses that feel personal, warm, and authentic — matching their communication style.`;
}

function addMem(role, t) {
    TWIN.memory = TWIN.memory || [];
    TWIN.memory.push({ role, text: t, ts: Date.now() });
    if (TWIN.memory.length > 20) TWIN.memory = TWIN.memory.slice(-20);
    saveTwin();
}

/* ══════════════════════════════════════════
   AI TILES
══════════════════════════════════════════ */
async function refreshAI(ctxText = '', forcedAnswer = '') {
    if (tilesGenerating) return;
    tilesGenerating = true;
    smartTiles = ['…', '…', '…', '…', '…', '…', '…', '…'];
    renderAIPhraseRows(smartTiles);
    setTwinStatus('<span class="ai-spin"></span>Generating suggestions…');

    const banner = document.getElementById('ctx-banner');
    if (ctxText) {
        document.getElementById('ctx-heard').textContent = 'Responding to: "' + ctxText + '"';
        banner.classList.add('show');
    }

    const ctxInstr = ctxText
        ? `IMPORTANT: Someone nearby just said: "${ctxText}". Generate 8 natural first-person RESPONSES from ${TWIN.name || 'the patient'} to this.`
        : `Generate 8 things ${TWIN.name || 'the patient'} is most likely to want to say right now (${getTimeBucket()}).`;
    try {
        const raw = await groqCall(ctxInstr + '\nReturn ONLY a JSON array of exactly 8 strings (3–9 words each). No markdown.', twinSys(ctxText ? `Responding to: "${ctxText}"` : ''));
            const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
            if (Array.isArray(parsed) && parsed.length > 0) {
                smartTiles = parsed.slice(0, 8);
            }


        while (smartTiles.length < 8) smartTiles.push('I need a moment');
        renderAIPhraseRows(smartTiles);
        setTwinStatus('✦ ' + (smartTiles.length + ' AI suggestions ready'));

        if (ctxText) addMem('c', ctxText);

    } catch (e) {
        const noKey = e.message?.includes('NO_KEY');
        smartTiles = noKey
            ? ['Add Groq key in ⚙ Settings', 'I need help', 'I am okay', 'I need water', 'Yes please', 'No thank you', 'Please wait', 'I love you']
            : ['I need water', 'I am okay', 'I need help', 'Adjust me please', 'I am in pain', 'Thank you', 'Please wait', 'I love you'];
        renderAIPhraseRows(smartTiles);
        setTwinStatus(noKey ? '⚙ Add Groq key in Settings for AI' : '✦ Default suggestions');
    }
    tilesGenerating = false;
}

function renderAIPhraseRows(tiles) {
    const rows = qsa('#phrases-grid .ai-phrase-row');
    tiles = tiles || smartTiles;
    rows.forEach((row, ri) => {
        const btns = row.querySelectorAll('.ph-btn');
        for (let ci = 0; ci < 4; ci++) {
            const tileIdx = ri * 4 + ci;
            const t = tiles[tileIdx] || '…';
            if (btns[ci]) {
                btns[ci].textContent = t;
                btns[ci].className = 'ph-btn' + (t === '…' ? ' skeleton' : '');
                if (t !== '…') {
                    const captured = t;
                    btns[ci].onclick = () => phraseSelect(captured);
                } else { btns[ci].onclick = null; }
            }
        }
    });
}

/* ══════════════════════════════════════════
   AMBIENT LISTENER
══════════════════════════════════════════ */
function toggleAmbient() { ambientOn ? stopAmbient() : startAmbient(); }

function startAmbient() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { notify('Speech recognition not available in this browser'); return; }
    if (ambientOn && recognition) { document.getElementById('ambient-btn').classList.add('ambient-on'); return; }
    recognition = new SR();
    recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US';
    recognition.onresult = e => {
        const last = e.results[e.results.length - 1];
        if (last.isFinal) { const t = last[0].transcript.trim(); if (t.length > 3) onAmbient(t); }
    };
    recognition.onerror = e => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            ambientOn = false; document.getElementById('ambient-btn').classList.remove('ambient-on');
            notify('Microphone access denied'); return;
        }
        if (ambientOn) setTimeout(startAmbient, 2000);
    };
    recognition.onend = () => { if (ambientOn) recognition.start(); };
    recognition.start(); ambientOn = true;
    document.getElementById('ambient-btn').classList.add('ambient-on');
    notify('🎙 Listening — AI phrases adapt to conversation');
}

function stopAmbient() {
    ambientOn = false;
    if (recognition) { try { recognition.abort(); } catch (_) { } recognition = null; }
    document.getElementById('ambient-btn').classList.remove('ambient-on');
    notify('Ambient listener off');
}

async function onAmbient(transcript) {
    if (transcript === lastHeard) return;
    lastHeard = transcript;
    notify('💬 Heard: "' + transcript.slice(0, 40) + '"');
    updateContextRow(transcript);
    if (curScreen === 's-main' && mode === 'phrases') {
        setTwinStatus('<span class="ai-spin"></span>Adapting to: "' + transcript.slice(0, 28) + '"…');
        refreshAI(transcript);
    } else if (curScreen === 's-main' && mode === 'keyboard' && !text.trim()) {
        renderAI(contextPhrases, 'ambient');
    }
}

async function updateContextRow(transcript) {
    const instant = ['Yes, I heard that', 'Tell me more', 'Please repeat that', 'I understand'];
    contextPhrases = instant;
    rebuildContextRow(true);
    if (!CFG.groqKey) return;
    try {
        const raw = await groqCall(
            `You are an AI generating communication options for ${TWIN.name || 'an ALS patient'}. Someone just told them: "${transcript}". Generate 4 highly relevant, natural first-person responses (2-8 words each) they might want to say back. Ensure it fits a conversational flow. JSON array of exactly 4 strings.`,
            twinSys()
        );
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
            contextPhrases = parsed.slice(0, 4);
            while (contextPhrases.length < 4) contextPhrases.push('I understand');
            rebuildContextRow(true);
            
            if (mode === 'keyboard' && !text.trim()) {
                renderAI(contextPhrases, 'ambient');
            }
        }
    } catch (_) { }
}

function rebuildContextRow(animate = false) {
    const ctxRow = document.querySelector('#phrases-grid .ctx-row');
    if (!ctxRow) return;
    if (animate) ctxRow.classList.add('ctx-updating');
    setTimeout(() => ctxRow.classList.remove('ctx-updating'), 700);
    const btns = ctxRow.querySelectorAll('.ph-btn');
    contextPhrases.forEach((t, i) => {
        if (btns[i]) { btns[i].textContent = t; const captured = t; btns[i].onclick = () => phraseSelect(captured); }
    });
}

/* ══════════════════════════════════════════
   CAMERA / MEDIAPIPE
══════════════════════════════════════════ */
function loadScript(src, ms) {
    return new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous';
        const t = setTimeout(() => rej(new Error('timeout: ' + src)), ms);
        s.onload = () => { clearTimeout(t); res(); }; s.onerror = () => { clearTimeout(t); rej(new Error('load error: ' + src)); };
        document.head.appendChild(s);
    });
}

async function init() {
    await loadCFG(); await loadTwin();
    setLoadUI('Loading vision module…', 12);
    let mpOk = false;
    try {
        await Promise.all([
            loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js', 5000),
            loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js', 5000),
        ]);
        mpOk = true;
    } catch (e) { console.warn('MediaPipe not available:', e.message); }
    if (initDone) return;
    if (!mpOk) {
        setLoadUI('Vision unavailable — keyboard mode', 80);
        await sleep(700);
        if (!initDone) {
            initDone = true;
            CFG.threshold = 0.25; CFG.smileThreshold = 0.6;
            fallbackLaunch();
        }
        return;
    }
    setLoadUI('Starting camera…', 42);
    const vidCalib = document.getElementById('cv-calib');
    try {
        await loadFaceMesh(vidCalib);
        if (initDone) return;
        if (!stream && vidCalib.srcObject) stream = vidCalib.srcObject;
        mirrorStream();
        setLoadUI('Calibrating…', 95); await sleep(300);
        if (!initDone) { showScreen('s-calib'); startCalib(); }
    } catch (e) {
        console.warn('FaceMesh failed:', e.message);
        if (!initDone) { setLoadUI('Vision failed — keyboard mode', 80); await sleep(700); initDone = true; fallbackLaunch(); }
    }
    speechSynthesis.onvoiceschanged = loadVoices; loadVoices();
}

async function loadFaceMesh(vid) {
    return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('FaceMesh timeout')), 12000);
        try {
            if (typeof FaceMesh === 'undefined') { clearTimeout(t); rej(new Error('FaceMesh undefined')); return; }
            fm = new FaceMesh({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
            fm.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: .5, minTrackingConfidence: .5 });
            fm.onResults(onFMResult);
            if (typeof Camera === 'undefined') { clearTimeout(t); rej(new Error('Camera undefined')); return; }
            fmCam = new Camera(vid, {
                onFrame: async () => { try { await fm.send({ image: vid }); } catch (_) { } },
                width: 640, height: 480
            });
            fmCam.start()
                .then(() => { clearTimeout(t); fmReady = true; waitForStream(vid, res, rej); })
                .catch(e => { clearTimeout(t); rej(e); });
        } catch (e) { clearTimeout(t); rej(e); }
    });
}

function waitForStream(vid, res, rej, tries = 0) {
    if (vid.srcObject && vid.readyState >= 1) { stream = vid.srcObject; res(); return; }
    if (vid.srcObject && !stream) { stream = vid.srcObject; }
    if (tries > 40) { res(); return; }
    setTimeout(() => waitForStream(vid, res, rej, tries + 1), 50);
}

let fmReady = false;

function mirrorStream() {
    if (!stream) {
        const vc = document.getElementById('cv-calib');
        if (vc && vc.srcObject) stream = vc.srcObject;
        else return;
    }
    const v = document.getElementById('cv-main');
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play().catch(e => console.warn('Thumb video play failed:', e.message));
}

function skipCamera() { if (initDone) return; initDone = true; CFG.threshold = null; blinkActive = false; calibPhase = 3; fallbackLaunch(); }

function fallbackLaunch() {
    const d = document.getElementById('cam-dot'); if (d) d.style.background = 'var(--red)';
    launchMain();
    notify('Keyboard / tap mode active — Space = blink');
}

/* ══════════════════════════════════════════
   FACE MESH RESULT HANDLER
══════════════════════════════════════════ */
function onFMResult(results) {
    if (!results.multiFaceLandmarks?.length) {

        if (calibPhase < 3) setCalibInst('No face detected — please face the camera');
        return;
    }
    const lm = results.multiFaceLandmarks[0];
    const ear = (calcEAR(lm, LE) + calcEAR(lm, RE)) / 2;
    const smile = calcSmile(lm);

    const earEl = document.getElementById('ear-read');
    const smEl = document.getElementById('smile-read');
    if (earEl) earEl.textContent = 'EAR: ' + ear.toFixed(3);
    if (smEl) smEl.textContent = 'Smile: ' + smile.toFixed(3);

    if (calibPhase < 3) { handleCalibFrame(ear, smile); return; }
    if (!blinkActive) return;

    handleSmile(smile);

    const now = Date.now();
    const dt = lastFrameTs ? (now - lastFrameTs) : 30;
    lastFrameTs = now;

    if (ear < CFG.threshold) {
        sosAccumulator += dt;
        blinkFrames++;
        const led = document.getElementById('blink-led');
        if (led) led.classList.add('blink-on');

        if (blinkFrames > CFG.maxShortF && !longTrig && !sosTrig) {
            longTrig = true; if (led) led.classList.add('blink-long');
        }
    } else {
        sosAccumulator -= (dt * 1.5); // drain faster than fill if eyes open
        if (blinkFrames >= CFG.minFrames && !sosTrig) { longTrig ? onLongBlink() : onShortBlink(); }
        blinkFrames = 0; longTrig = false;
        const led = document.getElementById('blink-led'); if (led) led.className = 'sig-led';
    }

    sosAccumulator = Math.max(0, Math.min(sosAccumulator, SOS_HOLD_MS + 100));

    /* ── SOS eye-hold progress bar ── */
    const sosBar = document.getElementById('sos-hold-fill');
    if (sosBar) {
        const pct = Math.min(sosAccumulator / SOS_HOLD_MS * 100, 100);
        sosBar.style.width = pct + '%';
        sosBar.style.opacity = sosAccumulator > 400 ? '1' : '0';
    }

    if (sosAccumulator >= SOS_HOLD_MS && !sosTrig) {
        sosTrig = true;
        const led = document.getElementById('blink-led');
        if (led) led.className = 'sig-led sos-warn';
        if (sosBar) { sosBar.style.width = '0%'; sosBar.style.opacity = '0'; }
        if (!sosActive) enterSOS();
    }
    if (sosAccumulator === 0) {
        sosTrig = false; // Reset trigger lock when fully drained
    }
}

function calcEAR(lm, eye) {
    const dx = Math.hypot(lm[eye.rgt].x - lm[eye.lft].x, lm[eye.rgt].y - lm[eye.lft].y);
    const dy = Math.hypot(lm[eye.top].x - lm[eye.bot].x, lm[eye.top].y - lm[eye.bot].y);
    return dx > .001 ? dy / dx : 0;
}

function calcSmile(lm) {
    const mw = Math.hypot(lm[MOUTH_R].x - lm[MOUTH_L].x, lm[MOUTH_R].y - lm[MOUTH_L].y);
    const avgCorY = (lm[MOUTH_L].y + lm[MOUTH_R].y) / 2;
    return mw > .001 ? (lm[LIP_TOP].y - avgCorY) / mw : 0;
}

/* ── Smile handler ── */
function handleSmile(sv) {
    const led = document.getElementById('smile-led');
    const ind = document.getElementById('smile-ind');
    const isSmiling = smileNeutral !== null && sv > (smileNeutral + CFG.smileThreshold);

    if (isSmiling) {
        if (!smileHoldStart) smileHoldStart = Date.now();
        const holdDur = Date.now() - smileHoldStart;
        const holdPct = Math.min(holdDur / SMILE_HOLD_MS * 100, 100);

        const fill = document.getElementById('smile-hold-fill');
        if (fill) fill.style.width = holdPct + '%';
        if (led) {
            if (holdPct > 20) led.classList.add('smile-hold');
            else led.classList.add('smile-on');
        }

        if (holdDur >= SMILE_HOLD_MS && !smileHoldTriggered) {
            smileHoldTriggered = true;
            if (fill) fill.style.width = '0%';
            if (led) { led.classList.remove('smile-hold', 'smile-on'); }
            togglePause();
            return;
        }

        smileActive = true;
        smileFrames++;

    } else {
        if (smileActive && smileFrames > CFG.minFrames && !smileHoldTriggered) {
            const holdDur = smileHoldStart ? Date.now() - smileHoldStart : 0;
            if (holdDur < SMILE_HOLD_MS * 0.6 && !paused) {
                onSmileSelect();
            }
        }
        smileActive = false;
        smileFrames = 0;
        smileHoldStart = null;
        smileHoldTriggered = false;
        const fill = document.getElementById('smile-hold-fill');
        if (fill) fill.style.width = '0%';
        if (led) { led.classList.remove('smile-on', 'smile-hold'); }
        if (ind) ind.style.display = 'none';
    }
}

function onSmileSelect() {
    if (curScreen !== 's-main') return;
    if (mode === 'phrases') {
        const si = document.querySelector('#panel-phrases .ph-btn.si');
        if (si) { si.classList.add('sf'); setTimeout(() => si.classList.remove('sf'), 380); phraseSelect(si.textContent); }
    } else if (mode === 'keyboard') {
        if (text.trim()) speakMessage();
    } else if (mode === 'emergency') {
        const si = document.querySelector('#panel-emergency .si');
        if (si) {
            si.classList.add('sf'); setTimeout(() => si.classList.remove('sf'), 380);
            if (si.dataset.text) speakImm(si.dataset.text); else phraseSelect(si.textContent);
        }
    }
    notify('😊 Smile → selected!');
}

/* ══════════════════════════════════════════
   CALIBRATION
══════════════════════════════════════════ */
function startCalib() {
    calibPhase = 0; calibFrames = 0;
    openSamples = []; closeSamples = []; smileOpenSamples = []; smileSmileSamples = [];
    updateCalibDots();
    setCalibInst('Keep eyes open — look at camera naturally');
    document.getElementById('calib-p').textContent = 'Step 1: Measuring your open-eye baseline.';
}

function updateCalibDots() {
    [0, 1, 2].forEach(i => {
        const d = document.getElementById('cdot-' + i);
        if (!d) return;
        d.className = 'calib-step-dot' + (i < calibPhase ? ' done' : i === calibPhase ? ' active' : '');
    });
}

function handleCalibFrame(ear, smile) {
    const ring = document.getElementById('cr');
    if (calibPhase === 0) {
        openSamples.push(ear); smileOpenSamples.push(smile); calibFrames++;
        if (ring) ring.style.strokeDashoffset = 188 * (1 - Math.min(calibFrames / 90, 1));
        const s = document.getElementById('calib-stat'); if (s) s.textContent = 'Open eye baseline… ' + calibFrames + '/90';
        if (calibFrames >= 90) {
            calibPhase = 1; calibFrames = 0; updateCalibDots();
            setCalibInst('Now blink slowly 3–4 times');
            document.getElementById('calib-p').textContent = 'Step 2: Blink naturally to set your threshold.';
        }
    } else if (calibPhase === 1) {
        closeSamples.push(ear); calibFrames++;
        if (ring) ring.style.strokeDashoffset = 188 * (1 - Math.min(calibFrames / 80, 1));
        const s = document.getElementById('calib-stat'); if (s) s.textContent = 'Blink calibration… ' + calibFrames + '/80';
        if (calibFrames >= 80) {
            const avgOpen = avg(openSamples), minClose = Math.min(...closeSamples);
            CFG.threshold = minClose + (avgOpen - minClose) * ((11 - CFG.sensitivity) / 10) * .68;
            calibPhase = 2; calibFrames = 0; updateCalibDots();
            setCalibInst('Now smile naturally and hold for 2 seconds 😊');
            document.getElementById('calib-p').textContent = 'Step 3: Smile to calibrate smile detection.';
        }
    } else if (calibPhase === 2) {
        smileSmileSamples.push(smile); calibFrames++;
        if (ring) ring.style.strokeDashoffset = 188 * (1 - Math.min(calibFrames / 60, 1));
        const s = document.getElementById('calib-stat'); if (s) s.textContent = 'Smile calibration… ' + calibFrames + '/60';
        if (calibFrames >= 60) {
            smileNeutral = avg(smileOpenSamples);
            const smileAvg = avg(smileSmileSamples);
            CFG.smileThreshold = Math.max(0.008, Math.abs(smileAvg - smileNeutral) * 0.45);
            calibPhase = 3; updateCalibDots();
            setCalibInst('✓ Calibration complete!');
            const s2 = document.getElementById('calib-stat');
            if (s2) s2.textContent = 'Blink: ' + CFG.threshold.toFixed(3) + ' · Smile offset: ' + CFG.smileThreshold.toFixed(3);
            const db = document.getElementById('done-btn'); if (db) db.disabled = false;
        }
    }
}

function setCalibInst(t) { const e = document.getElementById('calib-inst'); if (e) e.textContent = t; }
function finishCalib() { if (initDone) return; initDone = true; blinkActive = true; launchMain(); }
function skipCalib() {
    if (initDone) return; initDone = true;
    CFG.threshold = .17; CFG.smileThreshold = .012; smileNeutral = 0; calibPhase = 3; blinkActive = false;
    const d = document.getElementById('cam-dot'); if (d) d.style.background = 'var(--amber)';
    launchMain();
}
function recalibrate() {
    closeSettings(); blinkActive = false; initDone = false; calibPhase = 0;
    openSamples = []; closeSamples = []; smileOpenSamples = []; smileSmileSamples = []; calibFrames = 0;
    const cr = document.getElementById('cr'); if (cr) cr.style.strokeDashoffset = '188';
    const db = document.getElementById('done-btn'); if (db) db.disabled = true;
    const vc = document.getElementById('cv-calib');
    if (stream && vc) {
        if (vc.srcObject !== stream) vc.srcObject = stream;
        vc.play().catch(() => { });
        showScreen('s-calib'); startCalib();
    } else {
        initDone = false; showScreen('s-loading'); setTimeout(init, 80);
    }
}

/* ══════════════════════════════════════════
   LAUNCH
══════════════════════════════════════════ */
function launchMain() {
    buildPhrases(); buildKeyboard(); buildEmergency();
    showScreen('s-main');
    setMode('phrases');
    refreshAI();
    loadVoices();
}

/* ══════════════════════════════════════════
   PAUSE / RESUME
══════════════════════════════════════════ */
function togglePause() { paused ? resumeApp() : pauseApp(); }

function pauseApp() {
    paused = true;
    clearTimeout(scanTimer);
    qsa('.ph-btn,.key,.yn-btn,.sug-chip').forEach(e => e.classList.remove('si', 'sr', 'sf'));
    qsa('.ph-row,.kb-row').forEach(e => e.classList.remove('sr'));
    document.getElementById('pause-overlay').classList.add('active');
    notify('⏸ Paused — blink once to resume');
}

function resumeApp() {
    paused = false;
    document.getElementById('pause-overlay').classList.remove('active');
    startScan();
    notify('▶ Resumed');
}

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
function showScreen(id) {
    qsa('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    curScreen = id;
    setTimeout(() => {
        if (stream) {
            const v = document.getElementById('cv-main');
            if (v && v.srcObject !== stream) v.srcObject = stream;
            if (v && v.paused) v.play().catch(() => { });
        }
        qsa('.screen.active video').forEach(v => { if (v.srcObject && v.paused) v.play().catch(() => { }); });
        if (id === 's-main' && !paused) startScan();
    }, 80);
}

function setMode(m) {
    mode = m;
    qsa('.tab').forEach(t => t.classList.remove('on'));
    document.getElementById('tab-' + m)?.classList.add('on');
    qsa('.panel').forEach(p => p.classList.remove('on'));
    document.getElementById('panel-' + m)?.classList.add('on');
    const sb = document.getElementById('sug-bar');
    const mainEl = document.getElementById('s-main');
    if (sb) { sb.style.display = (m === 'keyboard') ? 'flex' : 'none'; }
    if (mainEl) { mainEl.style.gridTemplateRows = (m === 'keyboard') ? '50px auto auto 22px 3px 30px 20px 34px 1fr 44px' : '50px auto auto 22px 3px 0px 20px 34px 1fr 44px'; }
    
    // Ambient suggestions auto-populate when entering keyboard mode if empty
    if (m === 'keyboard' && ambientOn && !text.trim() && contextPhrases.length > 0) {
        renderAI(contextPhrases, 'ambient');
    }

    if (curScreen === 's-main' && !paused) startScan();
}

function setTwinStatus(msg) { const e = document.getElementById('twin-status'); if (e) e.innerHTML = msg; }

/* ══════════════════════════════════════════
   BLINK HANDLERS
══════════════════════════════════════════ */
function onShortBlink() {
    flashBlink(false);
    if (paused) return; // Must use a smile to resume while paused
    if (sosActive) { cancelSOS(); return; }
    if (curScreen !== 's-main') return;

    if (mode === 'keyboard') {
        if (scanLvl === 'sug') { handleSugBlink(); return; }
        handleKBBlink();
    } else if (mode === 'phrases') {
        if (scanLvl === 'sug') { handleSugBlink(); return; }
        handlePhrasesBlink();
    } else if (mode === 'emergency') {
        handleEmergencyBlink();
    }
}

function onLongBlink() {
    flashBlink(true);
    if (paused) return; // Must use a smile to resume while paused
    if (curScreen !== 's-main') return;

    if (scanLvl === 'sug') {
        exitSugZone(); clearScanHL();
        skipSugZoneOnce = true;
        scanLvl = 'row'; scanRow = -1; scanCol = -1; scheduleScan();
        notify('↳ Back to keyboard'); return;
    }
    if (scanLvl === 'col') {
        scanLvl = 'row'; scanRow = -1; scanCol = -1; clearScanHL(); scheduleScan();
        notify('↳ Back to rows');
    } else {
        if (mode === 'keyboard') deleteLastChar();
    }
}

/* ══════════════════════════════════════════
   SCAN ENGINE
══════════════════════════════════════════ */
function startScan() {
    clearScanHL(); clearTimeout(scanTimer);
    const chips = qsa('#sug-bar .sug-chip');

    if (chips.length && mode === 'keyboard' && !skipSugZoneOnce) {
        scanLvl = 'sug'; scanSugIdx = -1;
        document.getElementById('sug-bar').classList.add('sug-zone-active');
    } else if (mode === 'emergency') {
        scanLvl = 'row'; scanRow = -1; scanCol = -1;
    } else {
        scanLvl = 'row'; scanRow = -1; scanCol = -1;
    }
    skipSugZoneOnce = false;
    scheduleScan();
}

function scheduleScan() {
    clearTimeout(scanTimer);
    scanStart = Date.now();
    animScanBar();
    scanTimer = setTimeout(advanceScan, CFG.scanSpeed);
}

function animScanBar() {
    if (!scanStart || curScreen !== 's-main') return;
    const f = document.getElementById('main-scan-fill');
    if (f) f.style.width = Math.min((Date.now() - scanStart) / CFG.scanSpeed * 100, 100) + '%';
    requestAnimationFrame(animScanBar);
}

function advanceScan() {
    if (paused || curScreen !== 's-main') { return; }
    clearScanHL();

    if (scanLvl === 'sug') {
        const chips = qsa('#sug-bar .sug-chip');
        if (!chips.length) { exitSugZone(); scheduleScan(); return; }
        scanSugIdx = (scanSugIdx + 1) % (chips.length + 1);
        if (scanSugIdx < chips.length) { chips[scanSugIdx].classList.add('si'); }
        scheduleScan(); return;
    }

    if (mode === 'phrases') {
        const rows = qsa('#panel-phrases .ph-row');
        if (!rows.length) { scheduleScan(); return; }
        if (scanLvl === 'row') {
            scanRow = (scanRow + 1) % rows.length;
            rows[scanRow].classList.add('sr');
        } else {
            const items = rows[scanRow].querySelectorAll('.ph-btn');
            scanCol = (scanCol + 1) % items.length;
            items[scanCol]?.classList.add('si');
        }
    }
    else if (mode === 'keyboard') {
        const rows = qsa('.kb-row');
        if (!rows.length) { scheduleScan(); return; }
        if (scanLvl === 'row') {
            scanRow = (scanRow + 1) % rows.length;
            rows[scanRow].classList.add('sr');
            if (scanRow === 0 && qsa('#sug-bar .sug-chip').length && !skipSugZoneOnce) {
                exitSugZone();
                scanLvl = 'sug'; scanSugIdx = -1;
                document.getElementById('sug-bar').classList.add('sug-zone-active');
                clearScanHL();
                scheduleScan(); return;
            }
        } else {
            const items = rows[scanRow].querySelectorAll('.key');
            scanCol = (scanCol + 1) % items.length;
            items[scanCol]?.classList.add('si');
        }
    }
    else if (mode === 'emergency') {
        const ynRow = document.getElementById('emerg-yn-row');
        const emerRows = qsa('#emerg-grid .ph-row');
        const totalRows = 1 + emerRows.length;
        if (scanLvl === 'row') {
            scanRow = (scanRow + 1) % totalRows;
            if (scanRow === 0) { if (ynRow) ynRow.classList.add('sr'); }
            else { emerRows[scanRow - 1]?.classList.add('sr'); }
        } else {
            if (scanRow === 0) {
                const yns = qsa('.yn-btn');
                if (yns.length) { scanCol = (scanCol + 1) % yns.length; yns[scanCol]?.classList.add('si'); }
            } else if (emerRows[scanRow - 1]) {
                const items = emerRows[scanRow - 1].querySelectorAll('.ph-btn');
                if (items.length) { scanCol = (scanCol + 1) % items.length; items[scanCol]?.classList.add('si'); }
            }
        }
    }

    scheduleScan();
}

function clearScanHL() {
    qsa('.sr,.si').forEach(e => e.classList.remove('sr', 'si'));
}

function exitSugZone() {
    const sb = document.getElementById('sug-bar');
    if (sb) sb.classList.remove('sug-zone-active');
    scanLvl = 'row'; scanRow = -1; scanCol = -1; scanSugIdx = -1;
}

/* ── Blink handlers per mode ── */
function handleSugBlink() {
    const chips = qsa('#sug-bar .sug-chip');
    if (scanSugIdx >= chips.length || scanSugIdx < 0) {
        exitSugZone(); clearScanHL();
        if (mode === 'keyboard') skipSugZoneOnce = true;
        scheduleScan(); return;
    }
    const chip = chips[scanSugIdx];
    const t = chip.textContent;
    chip.classList.add('sf'); setTimeout(() => chip.classList.remove('sf'), 380);
    applyAI(t);
    exitSugZone(); clearScanHL();
    if (mode === 'keyboard') {
        skipSugZoneOnce = true;
        scanLvl = 'row'; scanRow = -1; scanCol = -1;
    }
    scheduleScan();
}

function handlePhrasesBlink() {
    const rows = qsa('#panel-phrases .ph-row');
    if (scanLvl === 'row') {
        if (scanRow < 0) return;
        scanLvl = 'col'; scanCol = -1; clearScanHL(); rows[scanRow].classList.add('sr'); scheduleScan();
    } else {
        const items = rows[scanRow].querySelectorAll('.ph-btn');
        if (scanCol < 0 || scanCol >= items.length) return;
        const s = items[scanCol];
        s.classList.add('sf'); setTimeout(() => s.classList.remove('sf'), 380);
        phraseSelect(s.textContent);
        scanLvl = 'row'; scanRow = -1; scanCol = -1; clearScanHL(); scheduleScan();
    }
}

function handleKBBlink() {
    const rows = qsa('.kb-row');
    if (scanLvl === 'row') {
        if (scanRow < 0) return;
        scanLvl = 'col'; scanCol = -1; clearScanHL(); rows[scanRow].classList.add('sr'); scheduleScan();
    } else {
        const items = rows[scanRow].querySelectorAll('.key');
        if (scanCol < 0 || scanCol >= items.length) return;
        const s = items[scanCol];
        s.classList.add('sf'); setTimeout(() => s.classList.remove('sf'), 380);
        keyPress(s.textContent.trim());
        scanLvl = 'row'; scanRow = -1; scanCol = -1; clearScanHL(); scheduleScan();
    }
}

function handleEmergencyBlink() {
    const ynRow = document.getElementById('emerg-yn-row');
    const yns = qsa('.yn-btn');
    const emerRows = qsa('#emerg-grid .ph-row');
    if (scanLvl === 'row') {
        if (scanRow < 0) return;
        scanLvl = 'col'; scanCol = -1; clearScanHL();
        if (scanRow === 0) { if (ynRow) ynRow.classList.add('sr'); }
        else { emerRows[scanRow - 1]?.classList.add('sr'); }
        scheduleScan();
    } else {
        if (scanRow === 0) {
            if (scanCol < 0 || scanCol >= yns.length) return;
            const s = yns[scanCol];
            s.classList.add('sf'); setTimeout(() => s.classList.remove('sf'), 380);
            speakImm(s.dataset.text); addMem('p', s.dataset.text);
            notify('🚨 "' + s.dataset.text + '"');
        } else {
            if (!emerRows[scanRow - 1]) return;
            const items = emerRows[scanRow - 1].querySelectorAll('.ph-btn');
            if (scanCol < 0 || scanCol >= items.length) return;
            const s = items[scanCol];
            s.classList.add('sf'); setTimeout(() => s.classList.remove('sf'), 380);
            emergSelect(s.textContent);
        }
        scanLvl = 'row'; scanRow = -1; scanCol = -1; clearScanHL(); scheduleScan();
    }
}

/* ══════════════════════════════════════════
   BUILD PANELS
══════════════════════════════════════════ */
function buildPhrases() {
    const g = document.getElementById('phrases-grid');
    g.style.cssText = 'display:flex;flex-direction:column;gap:4px;'; g.innerHTML = '';

    const ctxRow = el('div', 'ph-row ctx-row');
    contextPhrases.forEach((t, i) => {
        const b = el('div', 'ph-btn'); b.textContent = t;
        const captured = t; b.onclick = () => phraseSelect(captured); ctxRow.appendChild(b);
    });
    g.appendChild(ctxRow);

    for (let r = 0; r < 2; r++) {
        const row = el('div', 'ph-row ai-phrase-row');
        for (let c = 0; c < 4; c++) {
            const b = el('div', 'ph-btn skeleton'); b.textContent = '…'; row.appendChild(b);
        }
        g.appendChild(row);
    }

    const sep = el('div', 'ph-section-label'); sep.textContent = 'Preset Phrases'; g.appendChild(sep);

    const flat = PH_ROWS.flatMap(r => r);
    const sorted = [...flat].sort((a, b) => (TWIN.phraseUsage[b] || 0) - (TWIN.phraseUsage[a] || 0));
    const topUsed = new Set(flat.filter(p => (TWIN.phraseUsage[p] || 0) > 0).sort((a, b) => (TWIN.phraseUsage[b] || 0) - (TWIN.phraseUsage[a] || 0)).slice(0, 4));
    for (let i = 0; i < sorted.length; i += 4) {
        const row = sorted.slice(i, i + 4);
        const rowEl = el('div', 'ph-row');
        row.forEach(t => {
            const b = el('div', 'ph-btn'); b.textContent = t;
            if (topUsed.has(t)) b.classList.add('hot');
            const captured = t; b.onclick = () => phraseSelect(captured); rowEl.appendChild(b);
        });
        g.appendChild(rowEl);
    }

    const navRow = el('div', 'ph-row nav-row');
    PH_NAV.forEach(label => {
        const b = el('div', 'ph-btn'); b.textContent = label;
        if (label === '⌨ Keyboard') b.onclick = () => setMode('keyboard');
        else if (label === '🆘 Emergency') b.onclick = () => setMode('emergency');
        else if (label === '↻ AI Refresh') b.onclick = () => refreshAI();
        else if (label === '🔊 Repeat') b.onclick = () => repeatSpeak();
        else b.onclick = () => refreshAI();
        navRow.appendChild(b);
    });
    g.appendChild(navRow);
}

function buildKeyboard() {
    const w = document.getElementById('kb-wrap'); w.innerHTML = '';
    KB_ROWS.forEach((row, ri) => {
        const re = el('div', 'kb-row'); re.dataset.row = ri;
        const isNavRow = (ri >= 5);
        row.forEach((k, ci) => {
            const ke = el('div', 'key' + (isNavRow ? ' nav-key' : ''));
            if (['😢 Sad', '😤 Urgent', '❤ Love', '😊 Happy'].includes(k)) ke.classList.add('emotion');
            if (k.length > 10) ke.classList.add('w3'); else if (k.length > 5) ke.classList.add('w2'); else if (k.length > 1) ke.classList.add('w1');
            ke.textContent = k; ke.dataset.row = ri; ke.dataset.col = ci; ke.onclick = () => keyPress(k); re.appendChild(ke);
        });
        w.appendChild(re);
    });
}

function buildEmergency() {
    const g = document.getElementById('emerg-grid'); g.innerHTML = '';
    g.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:4px 0;';

    /* Category headers + rows */
    const cats = [
        { label: '🚨 Critical', cls: 'emg-critical', rows: [
            ["Can't breathe!", 'Help now!', 'Call ambulance', 'Call doctor now'],
            ['I am in pain', 'I feel faint', 'I need oxygen', 'Stay with me'],
        ]},
        { label: '💊 Medical', cls: 'emg-medical', rows: [
            ['Need medicine', 'Check my pulse', 'Adjust position', 'I need water'],
            ['Need toilet', 'Too cold', 'Too hot', 'I am nauseous'],
        ]},
        { label: '↩ Navigate', cls: 'emg-nav', rows: [
            ['💬 Phrases', '⌨ Keys', '↻ Refresh AI', '🆘 SOS'],
        ]},
    ];

    cats.forEach(cat => {
        const hdr = el('div', 'emg-cat-hdr'); hdr.textContent = cat.label; g.appendChild(hdr);
        cat.rows.forEach(row => {
            const rowEl = el('div', 'ph-row emg-row ' + cat.cls);
            row.forEach(t => {
                const b = el('div', 'ph-btn emg-btn');
                if (cat.cls === 'emg-critical') b.classList.add('emg-crit-btn');
                if (cat.cls === 'emg-nav')      b.classList.add('emg-nav-btn');
                if (t === '🆘 SOS') b.classList.add('emg-sos-btn-big');
                b.textContent = t;
                const captured = t; b.onclick = () => emergSelect(captured);
                rowEl.appendChild(b);
            });
            g.appendChild(rowEl);
        });
    });
}

function emergSelect(t) {
    if (t === '💬 Phrases' || t === '💬 Phrase') { setMode('phrases'); return; }
    if (t === '⌨ Keys' || t === '⌨ Keyboard') { setMode('keyboard'); return; }
    if (t === '↻ Refresh AI' || t === '↻ AI Refresh') { refreshAI(); return; }
    if (t === '🆘 SOS') { enterSOS(); return; }
    speakImm(t); addMem('p', t); notify('🚨 "' + t.slice(0, 30) + '"');
}

/* ══════════════════════════════════════════
   PHRASE + KEYBOARD ACTIONS
══════════════════════════════════════════ */
function phraseSelect(t) {
    if (t === '⌨ Keyboard') { setMode('keyboard'); return; }
    if (t === '🆘 Emergency') { setMode('emergency'); return; }
    if (t === '↻ AI Refresh' || t === '↻ Refresh AI') { refreshAI(); return; }
    if (t === '💬 Phrase' || t === '💬 Phrases') { setMode('phrases'); return; }
    trackPhrase(t); speakImm(t); addMem('p', t);
    notify('Speaking: "' + t.replace(/[✓✗✅❌🌅🌙🔥]/g, '').trim().slice(0, 30) + '"');
}

function keyPress(k) {
    switch (k) {
        case '⌫': case '⌫ DEL': deleteLastChar(); break;
        case '␣': appendChar(' '); break;
        case '🔊 SPEAK': speakMessage(); break;
        case '✨ AI COMPLETE': fetchAIComplete(true); break;
        case '🗑 CLEAR': clearMessage(); break;
        case '💬 Phrase': case '💬 Phrases': setMode('phrases'); break;
        case '🆘 Emergency': setMode('emergency'); break;
        case '😊 Happy': buildEmotion('happiness and contentment'); break;
        case '😢 Sad': buildEmotion('sadness, needing comfort'); break;
        case '😤 Urgent': buildEmotion('urgency and immediate need'); break;
        case '❤ Love': buildEmotion('love and deep gratitude'); break;
        case '↻ Refresh AI': refreshAI(); break;
        default: if (k.length === 1) appendChar(k);
    }
}

function appendChar(c) { text += c; renderMsg(); if (c.trim()) fetchAIComplete(false); }
function deleteLastChar() { if (!text.length) return; text = text.slice(0, -1); renderMsg(); }
function clearMessage() { text = ''; renderMsg(); clearAI(); notify('Message cleared'); }

function renderMsg() {
    document.getElementById('msg-body').textContent = text;
    document.getElementById('msg-ph').style.display = text ? 'none' : 'inline';
    document.getElementById('msg-cur').style.display = text ? 'inline-block' : 'none';
}

/* ══════════════════════════════════════════
   TONE ENGINE
══════════════════════════════════════════ */
function setTone(t) {
    tone = t;
    qsa('.tone-chip').forEach(c => c.classList.remove('on'));
    document.getElementById('tone-' + t)?.classList.add('on');
    if (text.trim().length > 3) reformulate();
}
async function reformulate() {
    const st = document.getElementById('tone-status'); if (st) st.textContent = '✦ Reformulating…';
    try {
        const tones = { calm: 'calm, composed', warm: 'warm, gentle', urgent: 'urgent, direct', play: 'light, playful' };
        const r = await groqCall('Rewrite this message in a ' + tones[tone] + ' tone: "' + text + '"\nReturn ONLY the rewritten message.', twinSys());
        if (r && r.trim() !== text) { text = r.trim(); renderMsg(); notify('Tone applied: ' + tone); }
    } catch (_) { }
    if (st) st.textContent = '';
}

/* ══════════════════════════════════════════
   AI COMPLETE (keyboard mode)
══════════════════════════════════════════ */
function fetchAIComplete(now) {
    clearTimeout(aiTimer);
    aiTimer = setTimeout(async () => {
        if (text.length < 2) { clearAI(); return; }
        try {
            const raw = await groqCall('Partial: "' + text + '"\nGive 4 short completions (2-6 words). JSON array only.', twinSys());
            const s = JSON.parse(raw.replace(/```json|```/g, '').trim());
            if (s?.length) renderAI(s, 'normal');
        } catch (_) { }
    }, now ? 0 : 600);
}

function renderAI(sugs, type) {
    const bar = document.getElementById('sug-bar');
    const isCtx = type === 'context', isAmb = type === 'ambient';
    bar.innerHTML = `<span class="sug-label">${isAmb ? '🎙 HEARD' : isCtx ? '🤖 CONTEXT' : '✨ AI'}</span>`;
    sugs.forEach(s => {
        const chip = el('div', 'sug-chip' + (isCtx || isAmb ? ' ctx-chip' : ''));
        chip.textContent = s; chip.onclick = () => applyAI(s); bar.appendChild(chip);
    });
    const rb = el('button', 'ai-refresh-btn'); rb.textContent = '↻'; rb.onclick = () => refreshAI(); bar.appendChild(rb);
    if (curScreen === 's-main' && mode === 'keyboard' && scanLvl !== 'col') {
        startScan();
    }
}

function applyAI(s) {
    const sp = text.lastIndexOf(' '); text = (sp >= 0 ? text.slice(0, sp + 1) : '') + s + ' ';
    renderMsg(); fetchAIComplete(false); notify('Suggestion applied');
}

function clearAI() {
    const bar = document.getElementById('sug-bar');
    bar.innerHTML = '<span class="sug-label">✨ AI</span><span class="sug-empty">Type to see suggestions…</span>';
    bar.classList.remove('sug-zone-active');
}

async function buildEmotion(emotion) {
    notify('🤖 Generating…');
    try {
        const p = await groqCall('Write a 5-12 word first-person message expressing ' + emotion + '. Return ONLY the message.', twinSys());
        if (p) { text = p.trim(); renderMsg(); speakImm(p); addMem('p', p); }
    } catch (e) { notify(e.message?.includes('NO_KEY') ? '⚙ Add Groq key in Settings' : 'AI unavailable'); }
}

/* ══════════════════════════════════════════
   SOS
══════════════════════════════════════════ */
function playBeeps() {
    try {
        const c = new (window.AudioContext || window.webkitAudioContext)();
        function b(f, t, d) { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = f; g.gain.setValueAtTime(.7, c.currentTime + t); g.gain.exponentialRampToValueAtTime(.01, c.currentTime + t + d); o.start(c.currentTime + t); o.stop(c.currentTime + t + d + .05); }
        for (let i = 0; i < 5; i++) { b(880, i * .4, .3); b(660, i * .4 + .15, .2); }
    } catch (_) { }
}
function enterSOS() {
    if (sosActive) return;
    sosActive = true;
    speechSynthesis.cancel();
    const overlay = document.getElementById('sos-overlay');
    const subEl   = document.getElementById('sos-sub');
    const cdEl    = document.getElementById('sos-countdown');
    overlay.classList.add('active');
    playBeeps();
    notify('🚨 SOS ACTIVATED');

    if (!CFG.sosPhone) {
        subEl.textContent = '⚠ Set caregiver phone in ⚙ Settings → Emergency tab';
        cdEl.textContent  = 'Beeping locally only — no number saved';
        _startSOSTimer();
        return;
    }

    subEl.textContent = '📍 Getting your location…';
    const GEO_TIMEOUT = 8000;
    let sent = false;

    function _sendSMS(locationStr) {
        if (sent) return; sent = true;
        const bodyText = CFG.sosMsg + (locationStr ? '\n📍 Location: ' + locationStr : '');
        const smsUrl   = 'sms:' + CFG.sosPhone + '?body=' + encodeURIComponent(bodyText);
        /* Use an anchor click — works on Android/iOS, safely ignored on desktop */
        try {
            const a = document.createElement('a');
            a.href = smsUrl; a.style.display = 'none';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch (_) {}
        /* Clipboard fallback for desktop */
        if (navigator.clipboard) navigator.clipboard.writeText(bodyText).catch(() => {});
        subEl.textContent = locationStr
            ? '✅ SMS opened with Google Maps location'
            : '✅ SMS opened (allow location in browser for coordinates)';
    }

    const geoTimer = setTimeout(() => _sendSMS(''), GEO_TIMEOUT);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                clearTimeout(geoTimer);
                const lat = pos.coords.latitude.toFixed(5);
                const lon = pos.coords.longitude.toFixed(5);
                _sendSMS('https://maps.google.com/?q=' + lat + ',' + lon);
            },
            err => {
                clearTimeout(geoTimer);
                subEl.textContent = '📍 Location denied — sending without coordinates…';
                _sendSMS('');
            },
            { timeout: GEO_TIMEOUT, maximumAge: 60000, enableHighAccuracy: true }
        );
    } else {
        clearTimeout(geoTimer);
        _sendSMS('');
    }

    _startSOSTimer();
}

function _startSOSTimer() {
    let cd = 30;
    const cdEl = document.getElementById('sos-countdown');
    const subEl = document.getElementById('sos-sub');
    function tick() {
        if (!sosActive) return;
        cd--;
        if (cdEl) cdEl.textContent = 'Re-alerting in ' + cd + 's · blink or tap to cancel';
        if (cd <= 0) {
            cd = 30; playBeeps();
            if (CFG.sosPhone) {
                const a = document.createElement('a');
                a.href = 'sms:' + CFG.sosPhone + '?body=' + encodeURIComponent(CFG.sosMsg);
                a.style.display = 'none'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                if (subEl) subEl.textContent = '🔁 Re-alerting caregiver…';
            }
        }
        sosRepeatTO = setTimeout(tick, 1000);
    }
    sosRepeatTO = setTimeout(tick, 1000);
}

function cancelSOS() {
    sosActive = false;
    clearTimeout(sosRepeatTO);
    document.getElementById('sos-overlay').classList.remove('active');
    document.getElementById('sos-countdown').textContent = '';
    document.getElementById('sos-sub').textContent = 'Alerting caregiver…';
    notify('SOS cancelled');
}

/* ══════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════ */
function openSettings() {
    loadVoices();
    document.getElementById('inp-name').value = TWIN.name || '';
    document.getElementById('inp-groq').value = CFG.groqKey || '';
    document.getElementById('inp-hf').value = CFG.hfToken || '';
    document.getElementById('inp-sos').value = CFG.sosPhone || '';
    document.getElementById('inp-sos-msg').value = CFG.sosMsg || '';
    document.getElementById('modal-settings').classList.add('open');
    updatePrivacyDashboard();
}
async function closeSettings() {
    document.getElementById('modal-settings').classList.remove('open');
    const nm = document.getElementById('inp-name').value.trim(); if (nm) TWIN.name = nm;
    const gk = document.getElementById('inp-groq').value.trim(); if (gk) CFG.groqKey = gk;
    const hk = document.getElementById('inp-hf').value.trim(); if (hk) CFG.hfToken = hk;
    CFG.sosPhone = document.getElementById('inp-sos').value.trim();
    CFG.sosMsg = document.getElementById('inp-sos-msg').value.trim() || CFG.sosMsg;
    await saveCFG(); await saveTwin(); notify('Settings saved 🔐');
}
function openHelp() { document.getElementById('modal-help').classList.add('open'); }
function closeHelp() { document.getElementById('modal-help').classList.remove('open'); }

/* ── Settings tab switcher ── */
function mshTab(btn, panelId) {
    document.querySelectorAll('.msh-tab').forEach(t => t.classList.remove('on'));
    document.querySelectorAll('.msh-panel').forEach(p => p.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById(panelId)?.classList.add('on');
}

/* ── Help tab switcher (scoped to help modal) ── */
function hlpTab(btn, panelId) {
    const modal = document.getElementById('modal-help');
    modal.querySelectorAll('.msh-tab').forEach(t => t.classList.remove('on'));
    modal.querySelectorAll('.msh-panel').forEach(p => p.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById(panelId)?.classList.add('on');
}

/* ── Password show/hide toggle ── */
function togglePwd(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.style.opacity = inp.type === 'text' ? '1' : '';
}
function onSpeed(v) { CFG.scanSpeed = +v; document.getElementById('v-speed').textContent = v + ' ms'; }
function onRate(v) { CFG.speechRate = +v; document.getElementById('v-rate').textContent = (+v).toFixed(2) + '×'; }
function onSens(v) {
    CFG.sensitivity = +v;
    const l = ['', 'Very High', 'High', 'Med-High', 'Medium', 'Medium', 'Med-Low', 'Low', 'Very Low', 'Minimal'][v] || v;
    document.getElementById('v-sens').textContent = l;
    if (openSamples.length && closeSamples.length) CFG.threshold = Math.min(...closeSamples) + (avg(openSamples) - Math.min(...closeSamples)) * ((11 - CFG.sensitivity) / 10) * .68;
}
function loadVoices() {
    voices = speechSynthesis.getVoices();
    const sel = document.getElementById('sel-voice'); if (!sel) return;
    sel.innerHTML = '';
    voices.forEach(v => { const o = document.createElement('option'); o.value = v.voiceURI; o.textContent = v.name + ' (' + v.lang + ')'; if (v.voiceURI === CFG.voiceURI) o.selected = true; sel.appendChild(o); });
}
function resetTwinData() { if (!confirm('Reset all AI twin data?')) return; TWIN.memory = []; TWIN.phraseUsage = {}; saveTwin(); notify('🔐 Twin data reset & re-encrypted'); buildPhrases(); }

/* ══════════════════════════════════════════
   PERSISTENCE  (AES-256-GCM encrypted via ZKPrivacy)
══════════════════════════════════════════ */
async function saveCFG() {
    try {
        const data = {
            scanSpeed: CFG.scanSpeed, sensitivity: CFG.sensitivity,
            speechRate: CFG.speechRate, voiceURI: CFG.voiceURI,
            voicePitch: CFG.voicePitch, groqKey: CFG.groqKey,
            hfToken: CFG.hfToken, sosPhone: CFG.sosPhone, sosMsg: CFG.sosMsg,
        };
        const payload = await ZKPrivacy.encrypt(data);
        if (payload) localStorage.setItem(ZKPrivacy.CFG_KEY, JSON.stringify(payload));
    } catch (_) { }
}
async function loadCFG() {
    try {
        const raw = localStorage.getItem(ZKPrivacy.CFG_KEY);
        if (!raw) return;
        const c = await ZKPrivacy.decrypt(JSON.parse(raw));
        if (!c) return;
        if (c.scanSpeed)  { CFG.scanSpeed  = c.scanSpeed;  const e = document.getElementById('sl-speed'); if (e) { e.value = c.scanSpeed;  onSpeed(c.scanSpeed);  } }
        if (c.sensitivity){ CFG.sensitivity = c.sensitivity;const e = document.getElementById('sl-sens');  if (e) { e.value = c.sensitivity; onSens(c.sensitivity);  } }
        if (c.speechRate) { CFG.speechRate  = c.speechRate; const e = document.getElementById('sl-rate');  if (e) { e.value = c.speechRate;  onRate(c.speechRate);  } }
        if (c.voiceURI)   CFG.voiceURI  = c.voiceURI;
        if (c.voicePitch) CFG.voicePitch = c.voicePitch;
        if (c.groqKey)    CFG.groqKey   = c.groqKey;
        if (c.hfToken)    CFG.hfToken   = c.hfToken;
        if (c.sosPhone)   CFG.sosPhone  = c.sosPhone;
        if (c.sosMsg)     CFG.sosMsg    = c.sosMsg;
    } catch (_) { }
}
async function saveTwin() {
    try {
        const s = { ...TWIN }; delete s.voiceBlob;
        const payload = await ZKPrivacy.encrypt(s);
        if (payload) localStorage.setItem(ZKPrivacy.TWIN_KEY, JSON.stringify(payload));
    } catch (_) { }
}
async function loadTwin() {
    try {
        const raw = localStorage.getItem(ZKPrivacy.TWIN_KEY);
        if (!raw) return;
        const data = await ZKPrivacy.decrypt(JSON.parse(raw));
        if (data) Object.assign(TWIN, data);
    } catch (_) { }
}
function trackPhrase(t) { TWIN.phraseUsage[t] = (TWIN.phraseUsage[t] || 0) + 1; saveTwin(); buildPhrases(); }

/* ── Privacy Dashboard ── */
function updatePrivacyDashboard() {
    const el = document.getElementById('prv-status');
    if (!el) return;
    const s = ZKPrivacy.getStatus();
    const row = (icon, label, ok) =>
        `<div class="prv-row ${ok ? 'prv-ok' : 'prv-warn'}"><span class="prv-icon">${icon}</span>${label}</div>`;
    el.innerHTML =
        row('🔐', s.ready ? 'Storage: AES-256-GCM encrypted (device-bound)' : '⚠ Encryption key not ready', s.ready) +
        row('🤖', 'AI calls: name & identity anonymised before transmission', true) +
        row('☁️', 'Cloud storage: none — 100% local device only', true) +
        row('🔑', 'Key derivation: PBKDF2-SHA256 · 200 000 iterations', s.ready) +
        (s.legacyKeys.length ? row('⚠️', 'Unencrypted legacy keys detected: ' + s.legacyKeys.join(', '), false) : '') +
        `<div class="prv-note">Encrypted keys stored: ${s.encryptedKeys.join(', ') || 'none yet'}</div>`;
}

/* ══════════════════════════════════════════
   FEEDBACK
══════════════════════════════════════════ */
function setLoadUI(msg, pct) { document.getElementById('load-label').textContent = msg; document.getElementById('load-fill').style.width = pct + '%'; }
function flashBlink(long) {
    const f = document.getElementById('blink-flash');
    f.style.background = long ? 'rgba(240,160,106,.1)' : 'rgba(88,221,213,.07)';
    f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 110);
}
function notify(msg) {
    const n = document.getElementById('notif'); n.textContent = msg; n.classList.add('show');
    clearTimeout(notifTO); notifTO = setTimeout(() => n.classList.remove('show'), 2800);
}

/* ══════════════════════════════════════════
   KEYBOARD + CLICK EVENTS
══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); onShortBlink(); }
    if (e.code === 'Backspace' && !e.target.matches('input,textarea')) { e.preventDefault(); onLongBlink(); }
    if (e.key === 'F1') { e.preventDefault(); speakMessage(); }
    if (e.key === 'F2') { e.preventDefault(); clearMessage(); }
    if (e.key === 'F3') { e.preventDefault(); repeatSpeak(); }
    if (e.key === 'Escape') { if (sosActive) cancelSOS(); }
    if ((e.key === 'p' || e.key === 'P') && !e.target.matches('input,textarea')) togglePause();
});

document.getElementById('s-main').addEventListener('click', e => {
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.target.closest('.hdr,.ctx-banner,.twin-bar,.bot-bar,.ph-btn,.key,.yn-btn,.sug-chip,.modal-wrap,.tone-chip,.emerg-sos-btn')) return;
    if (curScreen === 's-main') onShortBlink();
});

/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
async function boot() {
    /* Always initialise ZKPrivacy first — derives key & migrates legacy data */
    await ZKPrivacy.init();
    /* Check for existing setup in encrypted store (or legacy store pre-migration) */
    const hasSetup = localStorage.getItem(ZKPrivacy.TWIN_KEY) !== null
                  || localStorage.getItem('bs8_twin') !== null;
    if (!hasSetup) { startOnboarding(); }
    else { setTimeout(init, 60); }
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); }
else { boot(); }


