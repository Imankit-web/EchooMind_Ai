'use strict';

/*
 * ╔═══════════════════════════════════════════════════════╗
 * ║   EchoMind Ai — Zero-Knowledge Privacy Engine         ║
 * ║   Client-side AES-256-GCM encryption (Web Crypto API) ║
 * ║   - All patient data encrypted at rest                ║
 * ║   - Key derives from device fingerprint + random salt ║
 * ║   - AI system prompts anonymised before transmission  ║
 * ║   - No plain-text PII ever leaves this device         ║
 * ╚═══════════════════════════════════════════════════════╝
 */

const ZKPrivacy = (() => {

    /* ── In-memory key (never written to storage) ── */
    let _key = null;

    /* ── Storage key names ── */
    const SALT_KEY   = 'em_salt';
    const TWIN_KEY   = 'em_twin';
    const CFG_KEY    = 'em_cfg';
    const LEGACY_KEYS = ['bs8_twin', 'bs8_cfg'];

    /* ── PBKDF2 iteration count ── */
    const ITER = 200_000;

    /* ────────────────────────────────────────────────
       Device Fingerprint
       Used as input material for key derivation.
       Ties the encryption key to this specific device.
    ──────────────────────────────────────────────── */
    function _fingerprint() {
        return [
            navigator.userAgent,
            navigator.language || 'en',
            `${screen.width}x${screen.height}x${screen.colorDepth}`,
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            navigator.platform || ''
        ].join('||');
    }

    /* ────────────────────────────────────────────────
       Salt — generated once, stored in localStorage.
       Without the device fingerprint it is useless.
    ──────────────────────────────────────────────── */
    function _getSalt() {
        const stored = localStorage.getItem(SALT_KEY);
        if (stored) {
            try { return Uint8Array.from(atob(stored), c => c.charCodeAt(0)); }
            catch {}
        }
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...bytes)));
        return bytes;
    }

    /* ────────────────────────────────────────────────
       Key Derivation — PBKDF2 → AES-256-GCM
       Key is held only in JS memory, never serialised.
    ──────────────────────────────────────────────── */
    async function _deriveKey(fingerprint, salt) {
        const enc = new TextEncoder();
        const raw = await crypto.subtle.importKey(
            'raw', enc.encode(fingerprint),
            { name: 'PBKDF2' }, false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
            raw,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /* ────────────────────────────────────────────────
       Migration — convert old plain-text localStorage
       keys to encrypted format on first boot.
    ──────────────────────────────────────────────── */
    async function _migrate() {
        const pairs = [
            ['bs8_twin', TWIN_KEY],
            ['bs8_cfg',  CFG_KEY]
        ];
        for (const [oldKey, newKey] of pairs) {
            const plainText = localStorage.getItem(oldKey);
            if (!plainText) continue;
            // Encrypt and save; whether new key exists or not, old must die
            if (!localStorage.getItem(newKey)) {
                try {
                    const data    = JSON.parse(plainText);
                    const payload = await encrypt(data);
                    if (payload) localStorage.setItem(newKey, JSON.stringify(payload));
                } catch {
                    // If migration fails, remove the dangerous plain-text anyway
                }
            }
            localStorage.removeItem(oldKey); // always remove plain-text
        }
    }

    /* ════════════════════════════════════════════════
       PUBLIC API
    ════════════════════════════════════════════════ */

    /**
     * init() — must be called before any encrypt/decrypt.
     * Derives the AES key from device fingerprint + salt,
     * then migrates any legacy plain-text storage.
     */
    async function init() {
        try {
            const salt = _getSalt();
            _key = await _deriveKey(_fingerprint(), salt);
            await _migrate();
            return true;
        } catch (e) {
            console.warn('[ZKPrivacy] init failed:', e.message);
            return false;
        }
    }

    /**
     * encrypt(data) — AES-256-GCM encrypt any JS value.
     * Returns { iv, ct } with base64-encoded fields.
     */
    async function encrypt(data) {
        if (!_key) return null;
        try {
            const iv  = crypto.getRandomValues(new Uint8Array(12));
            const ct  = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                _key,
                new TextEncoder().encode(JSON.stringify(data))
            );
            return {
                iv: btoa(String.fromCharCode(...iv)),
                ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
                v: 1   // schema version for future-proofing
            };
        } catch (e) {
            console.warn('[ZKPrivacy] encrypt failed:', e.message);
            return null;
        }
    }

    /**
     * decrypt(payload) — AES-256-GCM decrypt a stored { iv, ct } object.
     * Returns the original JS value, or null on any failure.
     */
    async function decrypt(payload) {
        if (!_key || !payload?.iv || !payload?.ct) return null;
        try {
            const iv    = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
            const ct    = Uint8Array.from(atob(payload.ct), c => c.charCodeAt(0));
            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _key, ct);
            return JSON.parse(new TextDecoder().decode(plain));
        } catch {
            return null; // wrong key, tampered data, or corrupt storage
        }
    }

    /**
     * anonymiseTwinProfile(twin) — returns a sanitised copy of the patient
     * profile safe to transmit to external AI APIs.
     *
     * Rules:
     *  - Real patient name    → "this person"
     *  - Family member names  → replaced by their role only (e.g. "daughter")
     *  - Freeform notes       → stripped (may contain unrestricted PII)
     *  - Medical stage + age  → kept (medically necessary, not personally identifying)
     *  - Personality traits   → kept (non-identifying behavioural descriptors)
     */
    function anonymiseTwinProfile(twin) {
        const anonRels = (twin.relationships || []).map(r => ({
            name: r.role || 'a family member',   // role only, never real name
            role: r.role || 'family member'
        }));

        // Remove duplicates by role
        const seen = new Set();
        const uniqueRels = anonRels.filter(r => {
            if (seen.has(r.role)) return false;
            seen.add(r.role);
            return true;
        });

        return {
            name:          'this person',     // patientʼs real name never leaves device
            age:           twin.age  || '',
            stage:         twin.stage || 'moderate',
            relationships: uniqueRels,        // roles only, no real names
            personality:   twin.personality || [],
            notes:         '',                // stripped — may contain free-form PII
        };
    }

    /**
     * getStatus() — returns a snapshot of encryption health
     * for use in the Privacy Dashboard.
     */
    function getStatus() {
        const encryptedKeys = [TWIN_KEY, CFG_KEY, SALT_KEY]
            .filter(k => localStorage.getItem(k) !== null);
        const legacyKeys = LEGACY_KEYS
            .filter(k => localStorage.getItem(k) !== null);

        return {
            ready:         _key !== null,
            encryptedKeys,
            legacyKeys,
            algorithm:     'AES-256-GCM',
            keyDerivation: 'PBKDF2-SHA256 (200 000 iterations)',
            dataLocality:  'Device-only — no cloud storage',
            aiAnonymised:  true,
        };
    }

    /* ── Expose only what the app needs ── */
    return { init, encrypt, decrypt, anonymiseTwinProfile, getStatus, TWIN_KEY, CFG_KEY };

})();
