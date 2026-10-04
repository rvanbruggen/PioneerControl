/**
 * Pioneer Amplifier Network Control
 * Communicates with Pioneer AVR via HTTP POST/GET to EventHandler.asp / StatusHandler.asp
 */

(function () {
    'use strict';

    const APP_VERSION = '0.12.0';
    const DEFAULT_IP = '192.168.68.60';
    const DEFAULT_APP_NAME = 'Rix Pioneer Amp Control';
    const STATUS_POLL_INTERVAL = 2000; // ms
    const COMMAND_COOLDOWN = 150; // ms between rapid commands
    const REQUEST_TIMEOUT = 5000; // ms before a request to the proxy/amp is aborted
    // Volume sliders: VOL_LEVELS ticks spanning VOL_MIN_DB..VOL_MAX_DB (4.6 dB per tick)
    const VOL_LEVELS = 20;
    const VOL_MIN_DB = -80;
    const VOL_MAX_DB = 12;

    // Strip any protocol prefix (http:// or https://) — we store only host:port.
    function stripProtocol(addr) {
        return addr.replace(/^https?:\/\//i, '');
    }

    let ampDirectIp = stripProtocol(localStorage.getItem('pioneer_amp_direct_ip') || localStorage.getItem('pioneer_amp_ip') || '');
    let ampProxy    = stripProtocol(localStorage.getItem('pioneer_amp_proxy') || '');
    // Effective request target: proxy if set, otherwise direct amp IP
    let ampIp = ampProxy || ampDirectIp;
    let appName = localStorage.getItem('pioneer_app_name') || DEFAULT_APP_NAME;
    let statusTimer = null;
    let pollGeneration = 0;   // incremented by stopPolling() to cancel pending startPolling() chains
    let pollInFlight = false;
    let connected = false;
    let lastCommandTime = 0;

    // Last known raw volume codes per zone — used for step-based zone 2 / HD control
    var currentVolCode = { main: null, z2: null, hd: null };

    // Default input sources loaded from sources.md (null = fall back to all inputs)
    let defaultSources = null;

    // ----- Input function code to name mapping -----
    const INPUT_MAP = {
        0: 'Phono',
        1: 'CD',
        2: 'Tuner',
        4: 'DVD',
        5: 'TV',
        6: 'SAT/CBL',
        10: 'Video',
        12: 'Multi CH',
        13: 'USB-DAC',
        15: 'DVR/BDR',
        17: 'iPod/USB',
        19: 'HDMI 1',
        20: 'HDMI 2',
        21: 'HDMI 3',
        22: 'HDMI 4',
        23: 'HDMI 5',
        24: 'HDMI 6',
        25: 'BD',
        26: 'Network',
        31: 'HDMI',
        33: 'BT Audio',
        34: 'HDMI 7',
        38: 'Internet Radio',
        41: 'Pandora',
        44: 'Media Server',
        45: 'Favorites',
        48: 'MHL',
        53: 'USB-DAC',
        57: 'Spotify'
    };

    // ----- Listening mode code to name mapping (from com_value.js) -----
    const LISTENING_MODE_MAP = {
        '0101': 'PLIIx Movie', '0102': 'PLII Movie', '0103': 'PLIIx Music',
        '0104': 'PLII Music', '0105': 'PLIIx Game', '0106': 'PLII Game',
        '0107': 'Pro Logic', '010c': 'Straight Decode', '010d': 'PLIIz Height',
        '010e': 'Wide Surr Movie', '010f': 'Wide Surr Music', '0110': 'Stereo',
        '0111': 'Neo:X Cinema', '0112': 'Neo:X Music', '0113': 'Neo:X Game',
        '0117': 'Surround',
        '0201': 'Action', '0202': 'Drama', '0208': 'Advanced Game',
        '0209': 'Sports', '020a': 'Classical', '020b': 'Rock/Pop',
        '020d': 'Ext. Stereo', '020e': 'Phones Surr', '020f': 'F.S. Surround',
        '0211': 'Retriever Air', '0212': 'ECO Mode 1', '0213': 'ECO Mode 2',
        '0401': 'Stereo', '0881': 'Optimum', '0e01': 'HDMI Through',
        '0f01': 'Multi CH In'
    };

    // ----- All available inputs per zone -----
    const ZONE_INPUTS = {
        main: [
            { cmd: '25FN', name: 'BD' },
            { cmd: '04FN', name: 'DVD' },
            { cmd: '06FN', name: 'SAT/CBL' },
            { cmd: '05FN', name: 'TV' },
            { cmd: '17FN', name: 'iPod/USB' },
            { cmd: '01FN', name: 'CD' },
            { cmd: '02FN', name: 'Tuner' },
            { cmd: '33FN', name: 'BT Audio' },
            { cmd: '26FN', name: 'Network' },
            { cmd: '38FN', name: 'Internet Radio' },
            { cmd: '44FN', name: 'Media Server' },
            { cmd: '57FN', name: 'Spotify' },
            { cmd: '19FN', name: 'HDMI 1' },
            { cmd: '20FN', name: 'HDMI 2' },
            { cmd: '21FN', name: 'HDMI 3' },
            { cmd: '22FN', name: 'HDMI 4' },
            { cmd: '23FN', name: 'HDMI 5' },
            { cmd: '24FN', name: 'HDMI 6' },
            { cmd: '34FN', name: 'HDMI 7' },
            { cmd: '00FN', name: 'Phono' }
        ],
        z2: [
            { cmd: '25ZS', name: 'BD' },
            { cmd: '04ZS', name: 'DVD' },
            { cmd: '06ZS', name: 'SAT/CBL' },
            { cmd: '05ZS', name: 'TV' },
            { cmd: '17ZS', name: 'iPod/USB' },
            { cmd: '01ZS', name: 'CD' },
            { cmd: '02ZS', name: 'Tuner' },
            { cmd: '33ZS', name: 'BT Audio' },
            { cmd: '26ZS', name: 'Network' }
        ],
        hd: [
            { cmd: '25ZEA', name: 'BD' },
            { cmd: '04ZEA', name: 'DVD' },
            { cmd: '06ZEA', name: 'SAT/CBL' },
            { cmd: '05ZEA', name: 'TV' },
            { cmd: '17ZEA', name: 'iPod/USB' },
            { cmd: '01ZEA', name: 'CD' },
            { cmd: '02ZEA', name: 'Tuner' },
            { cmd: '33ZEA', name: 'BT Audio' },
            { cmd: '26ZEA', name: 'Network' }
        ]
    };

    // ----- DOM references -----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        setupOverlay: $('#setup-overlay'),
        app: $('#app'),
        appTitle: $('#app-title'),
        setupTitle: $('#setup-title'),
        nameInput: $('#name-input'),
        ipInput: $('#ip-input'),
        proxyInput: $('#proxy-input'),
        ipSaveBtn: $('#ip-save-btn'),
        settingsBtn: $('#settings-btn'),
        connectionStatus: $('#connection-status'),
        mainPower: $('#main-power'),
        mainVolume: $('#main-volume'),
        mainVolSlider: $('#main-vol-slider'),
        mainMute: $('#main-mute'),
        mainListeningMode: $('#main-listening-mode'),
        z2Power: $('#z2-power'),
        z2Volume: $('#z2-volume'),
        z2VolSlider: $('#z2-vol-slider'),
        hdPower: $('#hd-power'),
        hdVolume: $('#hd-volume'),
        hdVolSlider: $('#hd-vol-slider'),
    };

    // ----- Network layer -----

    // Build a URL to the proxy/amp.  When ampIp matches the page's own origin
    // (i.e. the page IS being served by the proxy) we use a relative path so
    // the request automatically inherits the page protocol (http: or https:).
    // This prevents mixed-content errors when the proxy is serving over HTTPS.
    // Direct amp connections always use plain http: — the amp only speaks HTTP.
    function ampUrl(path) {
        if (ampIp === window.location.host) {
            return path;
        }
        return 'http://' + ampIp + path;
    }

    // fetch() with a timeout, resolving to the response body text.
    // Without a timeout, requests to an unreachable proxy/amp hang until the OS
    // TCP timeout (minutes). New polls keep piling up and fill the browser's
    // per-origin connection limit, so the app stays disconnected long after the
    // proxy is back.
    function ampFetch(path, options) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = null;
        if (controller) {
            options.signal = controller.signal;
            timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);
        }
        return fetch(ampUrl(path), options)
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.text();
            })
            .then(function (text) {
                clearTimeout(timer);
                return text;
            }, function (err) {
                clearTimeout(timer);
                throw err;
            });
    }

    function postCommand(cmd, keepalive) {
        return ampFetch('/EventHandler.asp', {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache',
                'If-Modified-Since': 'Thu, 1 Jan 1970 00:00:00 GMT'
            },
            body: 'WebToHostItem=' + cmd,
            // keepalive lets the request outlive the page (used on unload)
            keepalive: !!keepalive
        }).catch(function () {
            // Silently fail — status polling will detect disconnection
        });
    }

    function sendCommand(cmd) {
        const now = Date.now();
        if (now - lastCommandTime < COMMAND_COOLDOWN) {
            setTimeout(() => sendCommand(cmd), COMMAND_COOLDOWN);
            return;
        }
        lastCommandTime = now;
        postCommand(cmd);
    }

    // Send N up/down volume step commands for zones that lack direct-set support
    // (Zone 2, HD Zone). Steps are sent one at a time — each waits for the
    // previous request to finish — so none get dropped on the way to the amp.
    var STEP_CMDS = { z2: { up: 'ZU', down: 'ZD' }, hd: { up: 'HZU', down: 'HZD' } };
    var STEP_GAP = 20;          // ms pause between completed step requests
    var PROBE_STEPS = 4;        // steps sent when the current volume is unknown (2 dB)
    var PENDING_TTL = 10000;    // ms to keep an unfinished target alive
    var stepGeneration = { z2: 0, hd: 0 };
    var stepsRunning = { z2: false, hd: false };
    // Target volume code still to reach once the amp reports a real volume
    var pendingTarget = { z2: null, hd: null };

    function setVolumeBySteps(zone, targetCode, slider) {
        var target = Math.max(1, Math.min(185, Math.round(targetCode)));
        var current = currentVolCode[zone];
        if (!current || current <= 0) {
            // Volume unknown (the amp reported 0 / "---"). Stepping all the way
            // from an assumed 0 could make it very loud if that report was wrong,
            // so nudge a few steps in the requested direction; the amp then
            // reports its real volume and the rest follows (see resumePendingSteps).
            pendingTarget[zone] = { code: target, until: Date.now() + PENDING_TTL, slider: slider };
            runSteps(zone, target > 1 ? STEP_CMDS[zone].up : STEP_CMDS[zone].down, PROBE_STEPS, 0, slider);
            return;
        }
        pendingTarget[zone] = null;
        var delta = target - current;
        if (delta === 0) return;
        var steps = Math.min(Math.abs(delta), 90); // cap at 90 steps (45 dB)
        runSteps(zone, delta > 0 ? STEP_CMDS[zone].up : STEP_CMDS[zone].down, steps, delta > 0 ? 1 : -1, slider);
    }

    // Finish a move that started while the volume was unknown, once a real
    // volume has been reported.
    function resumePendingSteps(zone) {
        var p = pendingTarget[zone];
        if (!p || stepsRunning[zone]) return;
        if (Date.now() > p.until) { pendingTarget[zone] = null; return; }
        if (!currentVolCode[zone]) return;
        setVolumeBySteps(zone, p.code, p.slider);
    }

    // dir: +1 / -1 tracks the expected volume locally while stepping, 0 = don't track
    function runSteps(zone, cmd, steps, dir, slider) {
        var gen = ++stepGeneration[zone];   // a new move cancels one still running
        stepsRunning[zone] = true;
        function next(i) {
            if (gen !== stepGeneration[zone]) return;
            if (i >= steps) {
                stepsRunning[zone] = false;
                // Let the amp settle before polls may move the slider again
                if (slider) slider._settledUntil = Date.now() + 1000;
                return;
            }
            if (slider) slider._settledUntil = Date.now() + REQUEST_TIMEOUT + 1000;
            postCommand(cmd).then(function () {
                if (dir && currentVolCode[zone]) {
                    currentVolCode[zone] = Math.max(1, Math.min(185, currentVolCode[zone] + dir));
                }
                setTimeout(function () { next(i + 1); }, STEP_GAP);
            });
        }
        next(0);
    }

    function pollStatus() {
        // Don't stack polls while a previous one is still waiting for the amp
        if (pollInFlight) return;
        pollInFlight = true;

        ampFetch('/StatusHandler.asp', {
            method: 'GET',
            headers: {
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache',
                'If-Modified-Since': 'Thu, 01 Jun 1970 00:00:00 GMT'
            }
        })
            .then(function (text) {
                pollInFlight = false;
                var data;
                try {
                    // The amp returns JSON (possibly with quirks)
                    data = JSON.parse(text);
                } catch (e) {
                    // Try eval-style parse as fallback (the original code uses eval)
                    try {
                        data = (new Function('return (' + text + ')'))();
                    } catch (e2) {
                        console.warn('Could not parse status response:', e2);
                    }
                }
                // Only report connected for a real status response — a proxy
                // error page with HTTP 200 must not show a green dot.
                if (data && typeof data === 'object') {
                    setConnected(true);
                    updateUI(data);
                } else {
                    setConnected(false);
                }
            })
            .catch(function () {
                pollInFlight = false;
                setConnected(false);
            });
    }

    // Kick off status polling (mirrors the original: send KOF, CLRLC, then ?AST, ?RGC)
    function startPolling() {
        stopPolling();
        // The handshake below creates the interval after nested timeouts. If
        // polling is stopped or restarted in the meantime, the stale chain must
        // not create an interval of its own (it would be orphaned forever).
        var generation = pollGeneration;
        // Initial handshake
        sendCommand('KOF');
        sendCommand('CLRLC');
        setTimeout(function () {
            if (generation !== pollGeneration) return;
            sendCommand('?AST');
            sendCommand('?RGC');
            setTimeout(function () {
                if (generation !== pollGeneration) return;
                pollStatus();
                statusTimer = setInterval(function () {
                    sendCommand('?AST');
                    sendCommand('?RGC');
                    setTimeout(pollStatus, 300);
                }, STATUS_POLL_INTERVAL);
            }, 300);
        }, 200);
    }

    function stopPolling() {
        pollGeneration++;
        if (statusTimer) {
            clearInterval(statusTimer);
            statusTimer = null;
        }
    }

    // ----- UI update from status data -----

    function setConnected(state) {
        connected = state;
        els.connectionStatus.className = 'status-dot ' + (state ? 'connected' : 'disconnected');
        if (state) {
            els.connectionStatus.title = ampProxy
                ? 'Connected via proxy ' + ampProxy + ' → amp ' + ampDirectIp
                : 'Connected directly to ' + ampDirectIp;
        } else {
            els.connectionStatus.title = 'Disconnected';
        }
    }

    function updateUI(data) {
        // Model info
        if (data.MN) {
            document.title = 'Pioneer ' + data.MN.split('/')[0];
        }

        // Listening mode
        if (data.L) {
            var mode = LISTENING_MODE_MAP[data.L] || data.L;
            els.mainListeningMode.textContent = mode;
        }

        // Zones
        if (data.Z && data.Z.length > 0) {
            // Main Zone
            if (data.Z[0] && data.Z[0].MZ) {
                var mz = data.Z[0].MZ;
                updateZonePower(els.mainPower, mz.P);
                updateVolume(els.mainVolume, els.mainVolSlider, mz.V, mz.M);
                updateMuteButton(els.mainMute, mz.M);
                updateInputHighlight('main-inputs', mz.F);
                toggleZoneBody('main-zone', mz.P);
            }

            // Zone 2
            if (data.Z[1] && data.Z[1].Z2) {
                var z2 = data.Z[1].Z2;
                updateZonePower(els.z2Power, z2.P);
                updateStepZoneVolume('z2', els.z2Volume, els.z2VolSlider, z2);
                updateInputHighlight('z2-inputs', z2.F);
                toggleZoneBody('zone2', z2.P);
            }

            // HD Zone (could be at index 2 or 3)
            var hdData = null;
            for (var i = 2; i < data.Z.length; i++) {
                if (data.Z[i] && data.Z[i].HZ) {
                    hdData = data.Z[i].HZ;
                    break;
                }
            }
            if (hdData) {
                updateZonePower(els.hdPower, hdData.P);
                if (hdData.V === -1) {
                    $('#hd-vol-section').style.display = 'none';
                } else {
                    $('#hd-vol-section').style.display = '';
                    updateStepZoneVolume('hd', els.hdVolume, els.hdVolSlider, hdData);
                }
                updateInputHighlight('hd-inputs', hdData.F);
                toggleZoneBody('hdzone', hdData.P);
            }

            // Zone 3 — show/hide
            var hasZ3 = false;
            for (var i = 2; i < data.Z.length; i++) {
                if (data.Z[i] && data.Z[i].Z3) {
                    hasZ3 = true;
                    break;
                }
            }
            // Zone 3 section not in HTML for now — can add later
        }
    }

    function updateZonePower(btn, powerState) {
        if (powerState === 1) {
            btn.classList.add('on');
            btn.classList.remove('off');
        } else {
            btn.classList.remove('on');
            btn.classList.add('off');
        }
    }

    function toggleZoneBody(zoneId, powerState) {
        var card = $('#' + zoneId);
        var body = card.querySelector('.zone-body');
        if (powerState === 1) {
            body.classList.remove('dimmed');
        } else {
            body.classList.add('dimmed');
        }
    }

    function setSliderFill(slider, level) {
        slider.value = level;
        slider.style.setProperty('--fill', (level / VOL_LEVELS * 100) + '%');
    }

    // Volume update for the step-controlled zones (Zone 2, HD Zone).
    function updateStepZoneVolume(zone, el, slider, zd) {
        var vol = parseInt(zd.V, 10);
        if (vol > 0 && zd.M !== 1) {
            // Don't overwrite the locally tracked value while steps are in flight
            if (!stepsRunning[zone]) currentVolCode[zone] = vol;
            resumePendingSteps(zone);
        } else if (vol === 0 && zd.P === 1 && zd.M !== 1 && currentVolCode[zone]) {
            // The amp sometimes reports 0 ("---") for a zone that is on and
            // playing. Keep showing the last real volume instead of a bogus 0.
            return;
        }
        updateVolume(el, slider, zd.V, zd.M);
    }

    function updateVolume(el, slider, vol, mute) {
        // Skip update while the user is dragging, or while steps are still in-flight
        if (slider && slider._dragging) return;
        if (slider && slider._settledUntil && Date.now() < slider._settledUntil) return;
        if (mute === 1) {
            el.textContent = 'MUTED';
        } else if (vol === 0 || vol === '000') {
            el.textContent = '---';
            if (slider) setSliderFill(slider, 0);
        } else {
            var db = (parseInt(vol, 10) - 161) / 2;
            el.textContent = db + ' dB';
            if (slider) {
                setSliderFill(slider, dbToLevel(db));
            }
        }
    }

    // Slider level (0..VOL_LEVELS) <-> dB
    function levelToDb(level) {
        var db = VOL_MIN_DB + (level / VOL_LEVELS) * (VOL_MAX_DB - VOL_MIN_DB);
        return Math.round(db * 2) / 2;   // amp works in 0.5 dB steps
    }

    function dbToLevel(db) {
        var level = Math.round((db - VOL_MIN_DB) / (VOL_MAX_DB - VOL_MIN_DB) * VOL_LEVELS);
        return Math.max(0, Math.min(VOL_LEVELS, level));
    }

    var VOL_SUFFIX = { main: 'VL', z2: 'ZV', hd: 'HZV' };

    function setVolumeByDb(zone, db) {
        var suffix = VOL_SUFFIX[zone];
        if (!suffix) return;
        var clamped = Math.max(-80, Math.min(12, db));
        var volCode = Math.round(clamped * 2 + 161);
        volCode = Math.max(0, Math.min(185, volCode));
        sendCommand(String(volCode).padStart(3, '0') + suffix);
    }

    function updateMuteButton(btn, mute) {
        if (mute === 1) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }

    function updateInputHighlight(containerId, funcCode) {
        var container = $('#' + containerId);
        if (!container) return;
        var buttons = container.querySelectorAll('.btn-input');
        var inputName = INPUT_MAP[funcCode] || '';
        buttons.forEach(function (btn) {
            if (btn.textContent === inputName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // ----- Event handlers -----

    function handlePowerToggle(btn) {
        var isOn = btn.classList.contains('on');
        var cmd = isOn ? btn.dataset.cmdOff : btn.dataset.cmdOn;
        sendCommand(cmd);
    }

    function handleCollapseToggle(card) {
        card.classList.toggle('collapsed');
    }

    // Parse sources.md into { main: ['BD','TV',...], z2: [...], hd: [...] }
    function parseSourcesMd(text) {
        var result = {};
        var zoneMap = { 'Main Zone': 'main', 'Zone 2': 'z2', 'HD Zone': 'hd' };
        var currentZone = null;
        text.split('\n').forEach(function (line) {
            var heading = line.match(/^##\s+(.+)/);
            if (heading) {
                currentZone = zoneMap[heading[1].trim()] || null;
            } else if (currentZone && line.trim() && !line.trim().startsWith('#')) {
                var names = line.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                if (names.length) {
                    result[currentZone] = (result[currentZone] || []).concat(names);
                }
            }
        });
        return result;
    }

    function loadEnabledInputs(zone) {
        var stored = localStorage.getItem('pioneer_inputs_' + zone);
        if (stored) {
            try { return JSON.parse(stored); } catch (e) {}
        }
        // Use defaults from sources.md if it was loaded successfully
        if (defaultSources && defaultSources[zone]) {
            var names = defaultSources[zone];
            return ZONE_INPUTS[zone]
                .filter(function (i) { return names.indexOf(i.name) !== -1; })
                .map(function (i) { return i.cmd; });
        }
        // Fall back to showing all inputs
        return ZONE_INPUTS[zone].map(function (i) { return i.cmd; });
    }

    function renderInputButtons(zone) {
        var ids = { main: 'main-inputs', z2: 'z2-inputs', hd: 'hd-inputs' };
        var container = $('#' + ids[zone]);
        if (!container) return;
        var enabled = loadEnabledInputs(zone);
        container.innerHTML = '';
        ZONE_INPUTS[zone].forEach(function (input) {
            if (enabled.indexOf(input.cmd) === -1) return;
            var btn = document.createElement('button');
            btn.className = 'btn btn-input';
            btn.dataset.cmd = input.cmd;
            btn.textContent = input.name;
            btn.addEventListener('click', function () { sendCommand(input.cmd); });
            container.appendChild(btn);
        });
    }

    function renderInputCheckboxes(zone, containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var enabled = loadEnabledInputs(zone);
        container.innerHTML = '';
        ZONE_INPUTS[zone].forEach(function (input) {
            var label = document.createElement('label');
            label.className = 'input-checkbox';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = input.cmd;
            cb.checked = enabled.indexOf(input.cmd) !== -1;
            label.appendChild(cb);
            label.appendChild(document.createTextNode('\u00a0' + input.name));
            container.appendChild(label);
        });
    }

    function saveEnabledInputs(zone, containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var checked = [];
        container.querySelectorAll('input[type=checkbox]:checked').forEach(function (cb) {
            checked.push(cb.value);
        });
        localStorage.setItem('pioneer_inputs_' + zone, JSON.stringify(checked));
    }

    function applyName() {
        document.title = appName;
        els.appTitle.textContent = appName;
        els.setupTitle.textContent = appName;
    }

    function connectToAmp() {
        var ip = els.ipInput.value.trim();
        if (!ip) return;

        ampDirectIp = stripProtocol(ip);
        ampProxy    = stripProtocol(els.proxyInput.value.trim());
        ampIp       = ampProxy || ampDirectIp;
        localStorage.setItem('pioneer_amp_direct_ip', ampDirectIp);
        localStorage.setItem('pioneer_amp_proxy',     ampProxy);

        var name = els.nameInput.value.trim();
        appName = name || DEFAULT_APP_NAME;
        localStorage.setItem('pioneer_app_name', appName);
        applyName();

        saveEnabledInputs('main', 'main-input-checkboxes');
        saveEnabledInputs('z2',   'z2-input-checkboxes');
        saveEnabledInputs('hd',   'hd-input-checkboxes');
        renderInputButtons('main');
        renderInputButtons('z2');
        renderInputButtons('hd');

        els.setupOverlay.classList.add('hidden');
        els.app.classList.remove('hidden');

        startPolling();
    }

    function showSetup() {
        stopPolling();
        els.nameInput.value = appName;
        els.ipInput.value = ampDirectIp || DEFAULT_IP;
        els.proxyInput.value = ampProxy;
        renderInputCheckboxes('main', 'main-input-checkboxes');
        renderInputCheckboxes('z2',   'z2-input-checkboxes');
        renderInputCheckboxes('hd',   'hd-input-checkboxes');
        els.setupOverlay.classList.remove('hidden');
        els.app.classList.add('hidden');
    }

    // ----- Init -----

    function init() {
        // Set version in footer
        var versionEl = document.getElementById('app-version');
        if (versionEl) versionEl.textContent = APP_VERSION;

        // Setup screen
        els.ipSaveBtn.addEventListener('click', connectToAmp);
        els.ipInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') connectToAmp();
        });
        els.settingsBtn.addEventListener('click', showSetup);

        // Power buttons
        $$('.btn-power').forEach(function (btn) {
            btn.addEventListener('click', function () {
                handlePowerToggle(btn);
            });
        });

        // Mute buttons (via data-cmd)
        $$('.btn-mute').forEach(function (btn) {
            if (btn.dataset.cmd) {
                btn.addEventListener('click', function () {
                    sendCommand(btn.dataset.cmd);
                });
            }
        });

        // Volume sliders
        var sliderConfigs = [
            { slider: els.mainVolSlider, label: els.mainVolume, zone: 'main' },
            { slider: els.z2VolSlider,   label: els.z2Volume,   zone: 'z2' },
            { slider: els.hdVolSlider,   label: els.hdVolume,   zone: 'hd' }
        ];
        sliderConfigs.forEach(function (cfg) {
            if (!cfg.slider) return;
            // Mark as dragging on pointer-down so poll updates are suppressed
            cfg.slider.addEventListener('mousedown',  function () { cfg.slider._dragging = true; });
            cfg.slider.addEventListener('touchstart', function () { cfg.slider._dragging = true; }, { passive: true });
            // Also keep _dragging true during active input events (covers cases where
            // mousedown fired on a parent but the slider already has focus)
            cfg.slider.addEventListener('input', function () {
                cfg.slider._dragging = true;
                cfg.slider.style.setProperty('--fill', (cfg.slider.value / VOL_LEVELS * 100) + '%');
                cfg.label.textContent = levelToDb(parseInt(cfg.slider.value, 10)) + ' dB';
            });
            function commitSlider() {
                if (!cfg.slider._dragging) return;
                cfg.slider._dragging = false;
                var db = levelToDb(parseInt(cfg.slider.value, 10));
                if (cfg.zone === 'main') {
                    cfg.slider._settledUntil = Date.now() + 1000;
                    setVolumeByDb('main', db);
                } else {
                    setVolumeBySteps(cfg.zone, db * 2 + 161, cfg.slider);
                }
            }
            // 'change' is the reliable commit event for <input type=range> — fires on
            // release regardless of where the pointer ended up (unlike 'mouseup' which
            // only fires if the pointer is still over the element).
            cfg.slider.addEventListener('change',     commitSlider);
            cfg.slider.addEventListener('touchend',   commitSlider);
            cfg.slider.addEventListener('touchcancel', function () { cfg.slider._dragging = false; });
        });

        // Input select buttons (generated dynamically)
        renderInputButtons('main');
        renderInputButtons('z2');
        renderInputButtons('hd');

        // Collapse toggles — collapse button and zone title h2 both toggle
        $$('.btn-collapse').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var card = btn.closest('.zone-card');
                handleCollapseToggle(card);
            });
        });
        $$('.zone-header h2').forEach(function (h2) {
            h2.addEventListener('click', function () {
                var card = h2.closest('.zone-card');
                handleCollapseToggle(card);
            });
        });

        // Disconnect button
        $('#disconnect-btn').addEventListener('click', function () {
            sendCommand('KOF');
            sendCommand('CLRLC');
            stopPolling();
            setConnected(false);
            showSetup();
        });

        // Apply saved name
        applyName();

        // Auto-connect when served via the proxy (HTTP or HTTPS, not file://).
        // The page origin IS the proxy, so use window.location.host as the
        // effective amp address — no setup needed for family members.
        var servedViaProxy = (window.location.protocol === 'http:' || window.location.protocol === 'https:') && window.location.hostname !== '';
        if (servedViaProxy && !ampDirectIp) {
            ampDirectIp = window.location.host;
            ampProxy    = '';
            ampIp       = ampDirectIp;
        }

        if (ampDirectIp) {
            els.setupOverlay.classList.add('hidden');
            els.app.classList.remove('hidden');
            startPolling();
        } else {
            els.ipInput.value = DEFAULT_IP;
            showSetup();
        }

        // Phones throttle or suspend timers while the screen is locked or the
        // tab is in the background. Pause polling while hidden and restart it
        // (with a fresh handshake) when the page becomes visible again.
        document.addEventListener('visibilitychange', function () {
            if (els.app.classList.contains('hidden')) return; // setup screen is open
            if (document.hidden) {
                stopPolling();
            } else {
                startPolling();
            }
        });
    }

    // Cleanup on page unload (mirror original behavior).
    // Bypass the cooldown queue (its setTimeout never runs during unload) and
    // use keepalive so the browser doesn't cancel the requests.
    window.addEventListener('beforeunload', function () {
        stopPolling();
        postCommand('KOF', true);
        postCommand('CLRLC', true);
    });

    // Fetch sources.md for default input configuration, then initialise.
    // Works when served via proxy/NAS; silently skipped when opened as file://.
    document.addEventListener('DOMContentLoaded', function () {
        // Register service worker for PWA / offline support
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function () {
                // SW registration failure is non-fatal — app works fine without it
            });
        }

        fetch('sources.md')
            .then(function (r) { return r.ok ? r.text() : null; })
            .then(function (text) {
                if (text) {
                    var parsed = parseSourcesMd(text);
                    if (Object.keys(parsed).length) defaultSources = parsed;
                }
                init();
            })
            .catch(function () {
                // File not reachable (e.g. opened directly from filesystem) — no problem
                init();
            });
    });
})();
