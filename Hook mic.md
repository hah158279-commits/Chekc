(function () {
    'use strict';
    if (window.__NgHienHellfire__) return;
    window.__NgHienHellfire__ = true;

    // ─── PHÁT HIỆN ANDROID ───────────────────────────────────
    const isAndroid = /android/i.test(navigator.userAgent);
    console.log('[NgHien] isAndroid:', isAndroid);

    // ─── THAM SỐ MẶC ĐỊNH CHO ANDROID ───────────────────────
    const P = {
        preGain:       isAndroid ? 3000 : 150,
        drive:         isAndroid ? 0.5 : 0.0,
        crush:         0.0,
        width:         0.0,
        postGain:      isAndroid ? 80 : 10,
        lowPass:       isAndroid ? 0.7 : 0.0,
        gateThreshold: 0.02,
        gateAttack:    0.3,
        gateRelease:   0.5,
        reverbMix:     0.0,
        reverbDecay:   0.5,
        mp3Volume:     1.0,
        mp3Mute:       false,
        loopEnabled:   true,
        boostMic:      false,
    };

    function createAudioProcessor(ctx, inputNode) {
        const processor = ctx.createScriptProcessor(4096, 2, 2);
        let lpL = 0, lpR = 0;
        let alpha = 0;
        let envL = 0, envR = 0;

        const DELAY_MAX = 4096;
        const delayBufL = new Float32Array(DELAY_MAX);
        const delayBufR = new Float32Array(DELAY_MAX);
        let delayIdx = 0;
        const taps = [587, 839, 1123, 1487];

        processor.onaudioprocess = function(e) {
            const inputL = e.inputBuffer.getChannelData(0);
            const inputR = e.inputBuffer.getChannelData(1);
            const outputL = e.outputBuffer.getChannelData(0);
            const outputR = e.outputBuffer.getChannelData(1);

            let pg = P.preGain;
            if (P.boostMic) pg *= 2;

            const dr = P.drive;
            const cr = P.crush;
            const wd = P.width;
            let po = P.postGain;
            if (P.boostMic) po *= 2;

            const lp = P.lowPass;
            const gThresh = P.gateThreshold;
            const gAttack = P.gateAttack;
            const gRelease = P.gateRelease;
            const revMix = P.reverbMix;
            const revDecay = P.reverbDecay;

            alpha = Math.min(lp * 0.98, 0.99);
            const attCoeff = Math.exp(-1 / (48000 * (0.001 + gAttack * 0.1)));
            const relCoeff = Math.exp(-1 / (48000 * (0.01 + gRelease * 0.5)));

            for (let i = 0; i < inputL.length; i++) {
                let L = (inputL[i] || 0) * pg;
                let R = (inputR[i] || 0) * pg;

                // Noise Gate
                if (gThresh > 0.0005) {
                    const peak = Math.max(Math.abs(L), Math.abs(R));
                    if (peak > envL) {
                        envL = envL * attCoeff + (1 - attCoeff) * peak;
                    } else {
                        envL = envL * relCoeff + (1 - relCoeff) * peak;
                    }
                    const gain = (envL > gThresh) ? 1 : 0;
                    L *= gain;
                    R *= gain;
                }

                const noiseFloor = 0.0002;
                if (Math.abs(L) < noiseFloor) L = 0;
                if (Math.abs(R) < noiseFloor) R = 0;

                // Drive (bão hòa)
                if (dr > 0.001) {
                    const d = dr * 30;
                    L = Math.atan(L * d) / Math.atan(d);
                    R = Math.atan(R * d) / Math.atan(d);
                }

                // Crush
                if (cr > 0) {
                    const th = Math.max(0.001, 1.0 - cr * 0.98);
                    L = Math.max(-th, Math.min(th, L)) / th;
                    R = Math.max(-th, Math.min(th, R)) / th;
                    const d2 = dr * 0.5 + 0.3;
                    L = Math.atan(L * d2) / Math.atan(d2);
                    R = Math.atan(R * d2) / Math.atan(d2);
                }

                // Width
                if (wd > 0) {
                    const mid = (L + R) * 0.5;
                    const side = (L - R) * 0.5 * (1 + wd * 2);
                    L = mid + side;
                    R = mid - side;
                }

                // Low Pass
                if (alpha > 0.001) {
                    lpL += alpha * (L - lpL);
                    lpR += alpha * (R - lpR);
                    L = lpL;
                    R = lpR;
                }

                // Reverb
                let revL = 0, revR = 0;
                if (revMix > 0.001) {
                    const fb = revDecay * 0.95;
                    delayBufL[delayIdx] = L + delayBufL[delayIdx] * fb;
                    delayBufR[delayIdx] = R + delayBufR[delayIdx] * fb;
                    for (let t = 0; t < taps.length; t++) {
                        const idx = (delayIdx - taps[t] + DELAY_MAX) % DELAY_MAX;
                        revL += delayBufL[idx];
                        revR += delayBufR[idx];
                    }
                    revL /= taps.length;
                    revR /= taps.length;
                    L = L * (1 - revMix) + revL * revMix;
                    R = R * (1 - revMix) + revR * revMix;
                    delayIdx = (delayIdx + 1) % DELAY_MAX;
                }

                L *= po;
                R *= po;

                // ─── GIỚI HẠN AMPLITUDE MỚI: 1000 ───────────
                const maxVal = 1000.0;
                if (L > maxVal) L = maxVal;
                if (L < -maxVal) L = -maxVal;
                if (R > maxVal) R = maxVal;
                if (R < -maxVal) R = -maxVal;

                outputL[i] = isFinite(L) ? L : 0;
                outputR[i] = isFinite(R) ? R : 0;
            }
        };

        inputNode.connect(processor);
        return processor;
    }

    // ─── HOOK getUserMedia ──────────────────────────────────────
    const _nativeGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function(constraints) {
        console.log('[NgHien] getUserMedia called');

        if (constraints.audio) {
            constraints.audio = {
                autoGainControl: false,
                echoCancellation: false,
                noiseSuppression: false,
                channelCount: 2,
                volume: 1.0,
                ...constraints.audio
            };
        }

        let rawStream;
        try {
            rawStream = await _nativeGUM(constraints);
        } catch(e) {
            console.error('[NgHien] getUserMedia failed:', e);
            throw e;
        }

        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive',
                sampleRate: 48000
            });

            const mixer = ctx.createGain();
            mixer.gain.value = 1;

            const micSource = ctx.createMediaStreamSource(rawStream);
            micSource.connect(mixer);

            const processor = createAudioProcessor(ctx, mixer);
            const dest = ctx.createMediaStreamDestination();
            processor.connect(dest);

            Core.ctx = ctx;
            Core.mixer = mixer;
            Core.dest = dest;
            Core.processor = processor;

            UI.badge('LIVE', '#00ff99');
            return dest.stream;

        } catch(e) {
            console.error('[NgHien] Processing error, returning raw stream:', e);
            UI.badge('BYPASS', '#ffaa00');
            return rawStream;
        }
    };

    // ─── CORE ──────────────────────────────────────────────────
    const Core = {
        ctx: null,
        mixer: null,
        dest: null,
        processor: null,
        mp3Source: null,
        mp3GainNode: null,
        isPlaying: false,
        audioBuffer: null,
        loopEnabled: true,

        pushAll() { },

        async loadAndPlayMP3(arrayBuffer) {
            if (!this.ctx || !this.mixer) {
                UI.badge('CTX ERR', '#ff4444');
                return;
            }
            if (this.ctx.state === 'suspended') await this.ctx.resume();
            this.stopMP3();

            let audioBuffer;
            try {
                audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            } catch(e) {
                UI.badge('DECODE ERR', '#ff4444');
                return;
            }
            this.audioBuffer = audioBuffer;

            if (!this.mp3GainNode) {
                this.mp3GainNode = this.ctx.createGain();
                this.mp3GainNode.gain.value = P.mp3Mute ? 0 : P.mp3Volume;
                this.mp3GainNode.connect(this.mixer);
            }

            this._playLoop();
        },

        _playLoop() {
            if (!this.audioBuffer) return;
            const src = this.ctx.createBufferSource();
            src.buffer = this.audioBuffer;
            this.mp3Source = src;

            src.connect(this.mp3GainNode);
            src.start(0);
            this.isPlaying = true;
            UI.badge('MP3 PLAY', '#00ccff');

            const duration = this.audioBuffer.duration;
            const startTime = this.ctx.currentTime;
            const updateProgress = () => {
                if (!this.isPlaying) return;
                const elapsed = this.ctx.currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const progEl = document.getElementById('kh-progress');
                const timeEl = document.getElementById('kh-time');
                if (progEl) progEl.value = progress * 100;
                if (timeEl) timeEl.innerText = formatTime(elapsed) + ' / ' + formatTime(duration);
                if (progress < 1) {
                    requestAnimationFrame(updateProgress);
                } else {
                    if (this.loopEnabled) {
                        this._playLoop();
                    } else {
                        this.isPlaying = false;
                        const btn = document.getElementById('kh-playbtn');
                        if (btn) btn.innerText = '▶ PLAY';
                        UI.badge('MP3 DONE', '#88ff88');
                    }
                }
            };
            updateProgress();
        },

        stopMP3() {
            if (this.mp3Source) {
                try { this.mp3Source.stop(); } catch(e) {}
                try { this.mp3Source.disconnect(); } catch(e) {}
                this.mp3Source = null;
            }
            this.isPlaying = false;
            const btn = document.getElementById('kh-playbtn');
            const prog = document.getElementById('kh-progress');
            const time = document.getElementById('kh-time');
            if (btn) btn.innerText = '▶ PLAY';
            if (prog) prog.value = 0;
            if (time) time.innerText = '00:00 / 00:00';
            UI.badge('MP3 STOP', '#ffaa00');
        },

        setMP3Volume(vol) {
            P.mp3Volume = vol;
            if (this.mp3GainNode) {
                this.mp3GainNode.gain.value = P.mp3Mute ? 0 : vol;
            }
        },

        setMP3Mute(mute) {
            P.mp3Mute = mute;
            if (this.mp3GainNode) {
                this.mp3GainNode.gain.value = mute ? 0 : P.mp3Volume;
            }
        },

        setLoop(enable) {
            P.loopEnabled = enable;
            this.loopEnabled = enable;
        },

        toggleBoost(enable) {
            P.boostMic = enable;
            UI.badge(enable ? 'BOOST ON' : 'LIVE', enable ? '#ff8800' : '#00ff99');
        }
    };

    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    // ─── PRESETS ───────────────────────────────────────────────
    const PRESETS = {
        'CLEAN':        { preGain:20,   drive:0, crush:0, width:0, postGain:5,  lowPass:0,   gateThreshold:0.005, gateAttack:0.3, gateRelease:0.5, reverbMix:0, reverbDecay:0.5 },
        'RÕ LỜI':    { preGain:200, drive:0, crush:0, width:0, postGain:15, lowPass:0,   gateThreshold:0.01,  gateAttack:0.2, gateRelease:0.4, reverbMix:0, reverbDecay:0.5 },
        'HỖN HỢP':   { preGain:150, drive:0.2, crush:0, width:0.1, postGain:10, lowPass:0.272, gateThreshold:0.01,  gateAttack:0.25, gateRelease:0.4, reverbMix:0.2, reverbDecay:0.4 },
        'CỰC TO':    { preGain:400, drive:0.3, crush:0, width:0, postGain:20, lowPass:0.272, gateThreshold:0.02,  gateAttack:0.3, gateRelease:0.5, reverbMix:0, reverbDecay:0.5 },
        'VANG NHẸ':  { preGain:150, drive:0, crush:0, width:0, postGain:10, lowPass:0,   gateThreshold:0.01,  gateAttack:0.2, gateRelease:0.4, reverbMix:0.3, reverbDecay:0.4 },
        'VANG TRUNG': { preGain:150, drive:0, crush:0, width:0, postGain:10, lowPass:0,   gateThreshold:0.01,  gateAttack:0.2, gateRelease:0.4, reverbMix:0.5, reverbDecay:0.6 },
        'VANG ĐẬM':  { preGain:150, drive:0, crush:0, width:0, postGain:10, lowPass:0,   gateThreshold:0.01,  gateAttack:0.2, gateRelease:0.4, reverbMix:0.7, reverbDecay:0.8 },
        'WARM':      { preGain:80,  drive:0.2, crush:0, width:0.1, postGain:8,  lowPass:0.544, gateThreshold:0.01,  gateAttack:0.25, gateRelease:0.4, reverbMix:0.1, reverbDecay:0.3 },
        'LOUD':      { preGain:250, drive:0.3, crush:0.1, width:0, postGain:18, lowPass:0.544, gateThreshold:0.02,  gateAttack:0.3, gateRelease:0.5, reverbMix:0.1, reverbDecay:0.3 },
        'SIÊU ỒN':   { preGain:500, drive:0.5, crush:0.3, width:0, postGain:25, lowPass:1.088, gateThreshold:0.04,  gateAttack:0.4, gateRelease:0.6, reverbMix:0.1, reverbDecay:0.3 },
        'NgHien KILLER': { preGain:800, drive:0.6, crush:0.4, width:0.1, postGain:30, lowPass:1.36, gateThreshold:0.05, gateAttack:0.5, gateRelease:0.7, reverbMix:0.1, reverbDecay:0.3 },
        'HỦY DIỆT':  { preGain:3000, drive:0.7, crush:0.6, width:0.2, postGain:60, lowPass:1.36, gateThreshold:0.06, gateAttack:0.6, gateRelease:0.8, reverbMix:0.1, reverbDecay:0.3 },
        'MAX GAIN':  { preGain:8000, drive:0.8, crush:0.7, width:0.3, postGain:100, lowPass:1.36, gateThreshold:0.07, gateAttack:0.7, gateRelease:0.8, reverbMix:0.1, reverbDecay:0.3 },
        'ĐIÊN CUỒNG': { preGain:12000, drive:0.9, crush:0.8, width:0.5, postGain:130, lowPass:1.36, gateThreshold:0.08, gateAttack:0.8, gateRelease:0.9, reverbMix:0.1, reverbDecay:0.3 },
        'ANDROID MAX': { preGain:5000, drive:0.8, crush:0, width:0, postGain:100, lowPass:0.8, gateThreshold:0.03, gateAttack:0.2, gateRelease:0.4, reverbMix:0, reverbDecay:0.5 },
    };

    function applyPreset(key) {
        const pr = PRESETS[key];
        Object.assign(P, pr);
        syncUI();
        document.querySelectorAll('.kp-btn').forEach(b =>
            b.classList.toggle('kp-on', b.dataset.k === key)
        );
        if (isAndroid) {
            UI.badge('ANDROID MODE', '#ff8800');
        }
    }

    function syncUI() {
        const sliders = [
            ['sl-pg', 'preGain', 15000],
            ['sl-dr', 'drive', 1],
            ['sl-cr', 'crush', 1],
            ['sl-wd', 'width', 2],
            ['sl-po', 'postGain', 150],
            ['sl-lp', 'lowPass', 1.36],
            ['sl-gt', 'gateThreshold', 1],
            ['sl-ga', 'gateAttack', 1],
            ['sl-gr', 'gateRelease', 1],
            ['sl-rv', 'reverbMix', 1],
            ['sl-rd', 'reverbDecay', 1],
            ['sl-mp3vol', 'mp3Volume', 1],
        ];
        sliders.forEach(([id, param, max]) => {
            const el = document.getElementById(id);
            if (!el) return;
            const val = P[param];
            el.value = val;
            const pct = Math.min((val / max) * 100, 100);
            el.style.setProperty('--v', pct.toFixed(1) + '%');
        });

        const labels = [
            ['lb-pg', 'preGain', 'x'],
            ['lb-dr', 'drive', '%', 100],
            ['lb-cr', 'crush', '%', 100],
            ['lb-wd', 'width', '%', 100],
            ['lb-po', 'postGain', 'x'],
            ['lb-lp', 'lowPass', '%', 100],
            ['lb-gt', 'gateThreshold', '%', 100],
            ['lb-ga', 'gateAttack', '%', 100],
            ['lb-gr', 'gateRelease', '%', 100],
            ['lb-rv', 'reverbMix', '%', 100],
            ['lb-rd', 'reverbDecay', '%', 100],
            ['lb-mp3vol', 'mp3Volume', '%', 100],
        ];
        labels.forEach(([id, param, unit, scale = 1]) => {
            const el = document.getElementById(id);
            if (!el) return;
            const val = P[param] * scale;
            el.innerText = val.toFixed(unit === 'x' ? 1 : 0) + unit;
        });

        const muteChk = document.getElementById('chk-mp3mute');
        if (muteChk) muteChk.checked = P.mp3Mute;

        const loopChk = document.getElementById('chk-loop');
        if (loopChk) loopChk.checked = P.loopEnabled;

        const boostChk = document.getElementById('chk-boost');
        if (boostChk) boostChk.checked = P.boostMic;

        const ind = document.getElementById('gate-indicator');
        if (ind) {
            const on = P.gateThreshold > 0.005;
            ind.style.background = on ? '#0f0' : '#555';
            ind.innerText = on ? 'ON' : 'OFF';
        }
    }

    const UI = {
        el: null,
        collapsed: false,
        dragging: false,
        ox: 0,
        oy: 0,

        badge(t, c) {
            const st = document.getElementById('kh-st');
            const dot = document.getElementById('kh-dot');
            if (st) { st.innerText = t; st.style.color = c; }
            if (dot) { dot.style.background = c; dot.style.boxShadow = '0 0 7px ' + c; }
        },

        init() {
            const el = document.createElement('div');
            el.id = 'kh-root';
            el.innerHTML = `
<div id="kh-head">
    <div id="kh-title">
        <span id="kh-fire">🌈</span>
        <span id="kh-name">후 이 hook</span>
        <span id="kh-tag">ANDROID</span>
    </div>
    <div id="kh-right">
        <div id="kh-badge"><span id="kh-dot"></span><span id="kh-st">WAIT</span></div>
        <button id="kh-col">▼</button>
    </div>
</div>
<div id="kh-body">
    <div id="kh-presets">
        ${Object.keys(PRESETS).map(k => `<button class="kp-btn" data-k="${k}">${k}</button>`).join('')}
    </div>
    <div class="kh-sep"></div>
    ${[
        ['sl-pg', 'lb-pg', 'PRE GAIN', '🔊', 0.001, 15000, 1],
        ['sl-dr', 'lb-dr', 'DRIVE', '🔥', 0, 1, 0],
        ['sl-cr', 'lb-cr', 'CRUSH', '💥', 0, 1, 0],
        ['sl-wd', 'lb-wd', 'WIDTH', '🌐', 0, 2, 0],
        ['sl-po', 'lb-po', 'POST GAIN', '⚡', 0.001, 150, 1],
        ['sl-lp', 'lb-lp', 'LOW PASS', '🎛️', 0, 1.36, 0],
    ].map(([sid, lid, name, ico, mn, mx, def]) => `
    <div class="kh-row">
        <div class="kh-rowlabel"><span>${ico}${name}</span><span id="${lid}">${def}${sid === 'sl-pg' || sid === 'sl-po' ? 'x' : '%'}</span></div>
        <input type="range" id="${sid}" min="${mn}" max="${mx}" step="0.01" value="${def}" style="--v:0%">
    </div>`).join('')}
    <div class="kh-sep"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-weight:700;color:#ccc;font-size:13px;">🔇 NOISE GATE</span>
        <span id="gate-indicator" style="background:#555;padding:0 8px;border-radius:4px;font-size:10px;font-weight:bold;color:#000;">OFF</span>
    </div>
    ${[
        ['sl-gt', 'lb-gt', 'THRESHOLD', '🔊', 0, 1, 0.01],
        ['sl-ga', 'lb-ga', 'ATTACK', '⚡', 0, 1, 0.3],
        ['sl-gr', 'lb-gr', 'RELEASE', '⏳', 0, 1, 0.5],
    ].map(([sid, lid, name, ico, mn, mx, def]) => `
    <div class="kh-row">
        <div class="kh-rowlabel"><span>${ico}${name}</span><span id="${lid}">${def}</span></div>
        <input type="range" id="${sid}" min="${mn}" max="${mx}" step="0.01" value="${def}" style="--v:0%">
    </div>`).join('')}
    <div class="kh-sep"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-weight:700;color:#ccc;font-size:13px;">🌊 REVERB</span>
    </div>
    ${[
        ['sl-rv', 'lb-rv', 'MIX', '🔊', 0, 1, 0],
        ['sl-rd', 'lb-rd', 'DECAY', '⏳', 0, 1, 0.5],
    ].map(([sid, lid, name, ico, mn, mx, def]) => `
    <div class="kh-row">
        <div class="kh-rowlabel"><span>${ico}${name}</span><span id="${lid}">${def}</span></div>
        <input type="range" id="${sid}" min="${mn}" max="${mx}" step="0.01" value="${def}" style="--v:0%">
    </div>`).join('')}
    <div class="kh-sep"></div>
    <!-- ─── BOOST MIC ────────────────────────────────── -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;background:#1a0500;padding:4px 8px;border-radius:6px;border:1px solid #ff880055;">
        <span style="font-weight:700;color:#ff8844;font-size:12px;">🚀 BOOST MIC</span>
        <label style="display:flex;align-items:center;gap:6px;color:#fff;font-size:11px;">
            <input type="checkbox" id="chk-boost"> x2 GAIN
        </label>
    </div>
    <div class="kh-sep"></div>
    <div id="kh-mp3-section">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
            <label style="font-size:11px;font-weight:700;color:#fff;">📁 MP3</label>
            <input type="file" id="kh-fileinput" accept="audio/mpeg" style="flex:1;font-size:10px;background:#1a0800;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:3px;">
            <label style="font-size:11px;color:#fff;display:flex;align-items:center;gap:4px;">
                <input type="checkbox" id="chk-loop" checked> 🔁 Loop
            </label>
        </div>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
            <button id="kh-playbtn" style="background:#1a0800;border:1px solid rgba(255,255,255,0.3);color:#fff;border-radius:4px;padding:2px 10px;font-weight:700;font-size:12px;cursor:pointer;">▶ PLAY</button>
            <input type="range" id="kh-progress" min="0" max="100" value="0" style="flex:1;height:4px;background:#2a0d00;-webkit-appearance:none;border-radius:2px;">
            <span id="kh-time" style="font-family:'Share Tech Mono',monospace;font-size:10px;color:#fff;min-width:80px;text-align:right;">00:00 / 00:00</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:10px;color:#fff;">🔊</label>
            <input type="range" id="sl-mp3vol" min="0" max="1" step="0.01" value="1" style="flex:1;height:4px;background:#2a0d00;-webkit-appearance:none;border-radius:2px;">
            <span id="lb-mp3vol" style="font-size:10px;color:#fff;min-width:30px;">100%</span>
            <label style="font-size:10px;color:#fff;display:flex;align-items:center;gap:4px;">
                <input type="checkbox" id="chk-mp3mute"> MUTE
            </label>
        </div>
    </div>
    <div class="kh-sep"></div>
    <button id="kh-rst">↺ RESET</button>
</div>`;
            document.body.appendChild(el);
            this.el = el;
            this.css();
            this.events();
            this.badge('WAIT', '#888');

            if (isAndroid) {
                this.badge('ANDROID MODE', '#ff8800');
            }
            syncUI();
        },

        events() {
            document.getElementById('kh-col').onclick = () => {
                this.collapsed = !this.collapsed;
                document.getElementById('kh-body').style.display = this.collapsed ? 'none' : 'block';
                document.getElementById('kh-col').innerText = this.collapsed ? '▲' : '▼';
            };

            const sliderMap = [
                ['sl-pg', 'preGain'],
                ['sl-dr', 'drive'],
                ['sl-cr', 'crush'],
                ['sl-wd', 'width'],
                ['sl-po', 'postGain'],
                ['sl-lp', 'lowPass'],
                ['sl-gt', 'gateThreshold'],
                ['sl-ga', 'gateAttack'],
                ['sl-gr', 'gateRelease'],
                ['sl-rv', 'reverbMix'],
                ['sl-rd', 'reverbDecay'],
                ['sl-mp3vol', 'mp3Volume'],
            ];
            sliderMap.forEach(([sid, param]) => {
                const sl = document.getElementById(sid);
                if (!sl) return;
                sl.oninput = () => {
                    const val = parseFloat(sl.value);
                    P[param] = val;
                    if (param === 'mp3Volume') {
                        Core.setMP3Volume(val);
                    }
                    syncUI();
                };
            });

            document.querySelectorAll('.kp-btn').forEach(b =>
                b.onclick = () => applyPreset(b.dataset.k)
            );

            document.getElementById('kh-rst').onclick = () => {
                applyPreset('CLEAN');
                document.querySelectorAll('.kp-btn').forEach(b => b.classList.remove('kp-on'));
            };

            document.getElementById('kh-fileinput').onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    await Core.loadAndPlayMP3(ev.target.result);
                };
                reader.readAsArrayBuffer(file);
                e.target.value = '';
            };

            document.getElementById('kh-playbtn').onclick = () => {
                if (Core.isPlaying) Core.stopMP3();
                else alert('Chọn file MP3 trước.');
            };

            document.getElementById('chk-mp3mute').onchange = (e) => {
                Core.setMP3Mute(e.target.checked);
                syncUI();
            };

            document.getElementById('chk-loop').onchange = (e) => {
                const enabled = e.target.checked;
                P.loopEnabled = enabled;
                Core.setLoop(enabled);
                syncUI();
            };

            document.getElementById('chk-boost').onchange = (e) => {
                const enabled = e.target.checked;
                Core.toggleBoost(enabled);
                syncUI();
            };

            const head = document.getElementById('kh-head');
            head.addEventListener('touchstart', e => {
                const t = e.touches[0];
                const r = this.el.getBoundingClientRect();
                this.dragging = true;
                this.ox = t.clientX - r.left;
                this.oy = t.clientY - r.top;
            }, { passive: true });
            document.addEventListener('touchmove', e => {
                if (!this.dragging) return;
                const t = e.touches[0];
                this.el.style.left = (t.clientX - this.ox) + 'px';
                this.el.style.top = (t.clientY - this.oy) + 'px';
                this.el.style.right = 'auto';
            }, { passive: true });
            document.addEventListener('touchend', () => { this.dragging = false; });
            head.addEventListener('mousedown', e => {
                const r = this.el.getBoundingClientRect();
                this.dragging = true;
                this.ox = e.clientX - r.left;
                this.oy = e.clientY - r.top;
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!this.dragging) return;
                this.el.style.left = (e.clientX - this.ox) + 'px';
                this.el.style.top = (e.clientY - this.oy) + 'px';
                this.el.style.right = 'auto';
            });
            document.addEventListener('mouseup', () => { this.dragging = false; });
        },

        css() {
            const s = document.createElement('style');
            s.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Share+Tech+Mono&display=swap');
#kh-root {
    position:fixed; top:55px; right:14px; width:290px;
    background:linear-gradient(160deg, #0a0000 0%, #1a0000 100%);
    border: 2.5px solid transparent;
    border-image: linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff) 1;
    border-image-slice: 1;
    border-radius: 14px;
    z-index:2147483647;
    box-shadow: 0 0 40px rgba(255,0,0,0.4), 0 0 80px rgba(255,165,0,0.3), 0 0 120px rgba(255,255,0,0.2);
    font-family:'Rajdhani',sans-serif; color:#fff;
    backdrop-filter:blur(12px); user-select:none; touch-action:none;
    overflow:hidden; max-height:calc(100vh - 100px);
    display:flex; flex-direction:column;
}
#kh-head {
    display:flex; justify-content:space-between; align-items:center;
    padding:10px 14px 9px; cursor:grab;
    background:linear-gradient(90deg, #ff000033, #ff7f0033, #ffff0033, #00ff0033, #0000ff33, #4b008233, #8b00ff33);
    border-bottom: 1.5px solid rgba(255,255,255,0.2);
    flex-shrink:0;
}
#kh-head:active{cursor:grabbing;}
#kh-title { display:flex; align-items:center; gap:6px; }
#kh-fire { font-size:16px; filter:drop-shadow(0 0 6px #ff0000); }
#kh-name {
    font-size:15px; font-weight:700; letter-spacing:2px;
    background: linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: none;
}
#kh-tag {
    font-size:9px; background: linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff);
    color:#000; padding:1px 5px; border-radius:4px; font-weight:700;
}
#kh-right { display:flex; align-items:center; gap:8px; }
#kh-badge {
    display:flex; align-items:center; gap:5px;
    background:#1a0000; padding:2px 8px; border-radius:20px;
    border: 1px solid rgba(255,255,255,0.2);
}
#kh-dot { width:7px; height:7px; border-radius:50%; background:#888; transition:all .3s; }
#kh-st  { font-size:9px; color:#888; font-family:'Share Tech Mono',monospace; letter-spacing:1px; }
#kh-col {
    background:none; border:1px solid rgba(255,255,255,0.3); color:#fff;
    border-radius:5px; width:22px; height:22px; font-size:11px;
    cursor:pointer; padding:0; transition:all .15s;
}
#kh-col:hover { background:rgba(255,255,255,0.1); }
#kh-body {
    padding:12px 14px;
    overflow-y:auto; flex:1;
}
#kh-presets { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:10px; }
.kp-btn {
    flex:1 1 auto; padding:5px 6px;
    font-family:'Rajdhani',sans-serif; font-size:10px; font-weight:700;
    background:#1a0500; border:1px solid rgba(255,255,255,0.2); color:#fff;
    border-radius:6px; cursor:pointer; letter-spacing:.5px;
    transition:all .15s; white-space:nowrap;
}
.kp-btn:hover { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.6); }
.kp-btn.kp-on {
    background: linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff);
    color:#000; border-color:#fff; box-shadow:0 0 20px rgba(255,255,255,0.4);
}
.kh-sep { height:1px; background:linear-gradient(90deg,transparent, #fff, transparent); margin:8px 0; opacity:0.2; }
.kh-row { margin-bottom:8px; }
.kh-rowlabel {
    display:flex; justify-content:space-between;
    font-size:11px; font-weight:700; color:#ccc;
    margin-bottom:3px; letter-spacing:.5px;
}
.kh-rowlabel span:last-child { color:#fff; font-family:'Share Tech Mono',monospace; font-size:11px; }
input[type=range] {
    -webkit-appearance:none; width:100%; height:4px;
    background:linear-gradient(90deg, #ff0000 var(--v,0%), #2a0d00 var(--v,0%));
    border-radius:3px; outline:none;
}
input[type=range]::-webkit-slider-thumb {
    -webkit-appearance:none; width:14px; height:14px;
    background:radial-gradient(circle, #fff, #ffaa00);
    border-radius:50%; cursor:pointer;
    border:1.5px solid #fff; box-shadow:0 0 12px rgba(255,255,255,0.6);
}
#kh-rst {
    width:100%; padding:8px; margin-top:2px;
    background:transparent; border:1px solid rgba(255,255,255,0.2);
    color:#fff; font-family:'Rajdhani',sans-serif;
    font-size:13px; font-weight:700; border-radius:7px;
    cursor:pointer; letter-spacing:1px; transition:all .15s;
}
#kh-rst:hover { background:rgba(255,255,255,0.1); }
`;
            document.head.appendChild(s);
        }
    };

    UI.init();
})();