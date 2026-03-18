/**
 * Pioneer Amplifier Network Control
 * Communicates with Pioneer AVR via HTTP POST/GET to EventHandler.asp / StatusHandler.asp
 */

(function () {
    'use strict';

    const APP_VERSION = '0.2.2';
    const DEFAULT_IP = '192.168.68.60';
    const DEFAULT_APP_NAME = 'Rix Pioneer Amp Control';
    const STATUS_POLL_INTERVAL = 2000; // ms
    const COMMAND_COOLDOWN = 150; // ms between rapid commands

    let ampDirectIp = localStorage.getItem('pioneer_amp_direct_ip') || localStorage.getItem('pioneer_amp_ip') || '';
    let ampProxy    = localStorage.getItem('pioneer_amp_proxy') || '';
    // Effective request target: proxy if set, otherwise direct amp IP
    let ampIp = ampProxy || ampDirectIp;
    let appName = localStorage.getItem('pioneer_app_name') || DEFAULT_APP_NAME;
    let statusTimer = null;
    let connected = false;
    let lastCommandTime = 0;

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
            { cmd: 'Z2F25', name: 'BD' },
            { cmd: 'Z2F04', name: 'DVD' },
            { cmd: 'Z2F06', name: 'SAT/CBL' },
            { cmd: 'Z2F05', name: 'TV' },
            { cmd: 'Z2F17', name: 'iPod/USB' },
            { cmd: 'Z2F01', name: 'CD' },
            { cmd: 'Z2F02', name: 'Tuner' },
            { cmd: 'Z2F33', name: 'BT Audio' },
            { cmd: 'Z2F26', name: 'Network' }
        ],
        hd: [
            { cmd: 'ZEA25', name: 'BD' },
            { cmd: 'ZEA04', name: 'DVD' },
            { cmd: 'ZEA06', name: 'SAT/CBL' },
            { cmd: 'ZEA05', name: 'TV' },
            { cmd: 'ZEA17', name: 'iPod/USB' },
            { cmd: 'ZEA01', name: 'CD' },
            { cmd: 'ZEA02', name: 'Tuner' },
            { cmd: 'ZEA33', name: 'BT Audio' },
            { cmd: 'ZEA26', name: 'Network' }
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
        mainMute: $('#main-mute'),
        mainListeningMode: $('#main-listening-mode'),
        z2Power: $('#z2-power'),
        z2Volume: $('#z2-volume'),
        hdPower: $('#hd-power'),
        hdVolume: $('#hd-volume'),
    };

    // ----- Network layer -----

    function sendCommand(cmd) {
        const now = Date.now();
        if (now - lastCommandTime < COMMAND_COOLDOWN) {
            setTimeout(() => sendCommand(cmd), COMMAND_COOLDOWN);
            return;
        }
        lastCommandTime = now;

        const url = 'http://' + ampIp + '/EventHandler.asp';
        const body = 'WebToHostItem=' + cmd;

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache'
            },
            body: body
        }).catch(function () {
            // Silently fail — status polling will detect disconnection
        });
    }

    function pollStatus() {
        const url = 'http://' + ampIp + '/StatusHandler.asp';

        fetch(url, {
            method: 'GET',
            headers: {
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache',
                'If-Modified-Since': 'Thu, 01 Jun 1970 00:00:00 GMT'
            }
        })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.text();
            })
            .then(function (text) {
                setConnected(true);
                try {
                    // The amp returns JSON (possibly with quirks)
                    var data = JSON.parse(text);
                    updateUI(data);
                } catch (e) {
                    // Try eval-style parse as fallback (the original code uses eval)
                    try {
                        var data = (new Function('return (' + text + ')'))();
                        updateUI(data);
                    } catch (e2) {
                        console.warn('Could not parse status response:', e2);
                    }
                }
            })
            .catch(function () {
                setConnected(false);
            });
    }

    // Kick off status polling (mirrors the original: send KOF, CLRLC, then ?AST, ?RGC)
    function startPolling() {
        stopPolling();
        // Initial handshake
        sendCommand('KOF');
        sendCommand('CLRLC');
        setTimeout(function () {
            sendCommand('?AST');
            sendCommand('?RGC');
            setTimeout(function () {
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
                updateVolume(els.mainVolume, mz.V, mz.M);
                updateMuteButton(els.mainMute, mz.M);
                updateInputHighlight('main-inputs', mz.F);
                toggleZoneBody('main-zone', mz.P);
            }

            // Zone 2
            if (data.Z[1] && data.Z[1].Z2) {
                var z2 = data.Z[1].Z2;
                updateZonePower(els.z2Power, z2.P);
                updateVolume(els.z2Volume, z2.V, z2.M);
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
                    updateVolume(els.hdVolume, hdData.V, hdData.M);
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

    function updateVolume(el, vol, mute) {
        // Skip update while the user is editing this element
        if (el._editing) return;
        if (mute === 1) {
            el.textContent = 'MUTED';
        } else if (vol === 0 || vol === '000') {
            el.textContent = '---';
        } else {
            var db = (parseInt(vol, 10) - 161) / 2;
            el.textContent = db + ' dB';
        }
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

    function makeVolumeEditable(span, zone) {
        span.classList.add('vol-editable');
        span.title = 'Click to set volume directly';

        span.addEventListener('click', function () {
            if (span._editing) return;
            span._editing = true;

            // Pull numeric part from current display (e.g. "-30 dB" → -30)
            var match = span.textContent.match(/(-?\d+\.?\d*)/);
            var currentDb = match ? parseFloat(match[1]) : 0;

            var input = document.createElement('input');
            input.type = 'number';
            input.step = '0.5';
            input.min = '-80';
            input.max = '12';
            input.value = currentDb;
            input.className = 'volume-edit-input';

            span.parentNode.insertBefore(input, span);
            span.style.display = 'none';
            input.focus();
            input.select();

            function commit() {
                var val = parseFloat(input.value);
                if (!isNaN(val)) setVolumeByDb(zone, val);
                input.remove();
                span.style.display = '';
                span._editing = false;
            }

            input.addEventListener('blur', commit);
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter')  { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { input.remove(); span.style.display = ''; span._editing = false; }
            });
        });
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

        ampDirectIp = ip;
        ampProxy    = els.proxyInput.value.trim();
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

        // Volume & mute buttons (via data-cmd)
        $$('.btn-vol, .btn-mute').forEach(function (btn) {
            if (btn.dataset.cmd) {
                btn.addEventListener('click', function () {
                    sendCommand(btn.dataset.cmd);
                });
            }
        });

        // Editable volume displays
        makeVolumeEditable(els.mainVolume, 'main');
        makeVolumeEditable(els.z2Volume,   'z2');
        makeVolumeEditable(els.hdVolume,   'hd');

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

        // Long-press for volume buttons (repeat while held)
        $$('.btn-vol').forEach(function (btn) {
            var intervalId = null;
            btn.addEventListener('mousedown', function () {
                intervalId = setInterval(function () {
                    sendCommand(btn.dataset.cmd);
                }, 250);
            });
            btn.addEventListener('mouseup', function () { clearInterval(intervalId); });
            btn.addEventListener('mouseleave', function () { clearInterval(intervalId); });
            btn.addEventListener('touchstart', function (e) {
                e.preventDefault();
                sendCommand(btn.dataset.cmd);
                intervalId = setInterval(function () {
                    sendCommand(btn.dataset.cmd);
                }, 250);
            }, { passive: false });
            btn.addEventListener('touchend', function () { clearInterval(intervalId); });
            btn.addEventListener('touchcancel', function () { clearInterval(intervalId); });
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

        // Auto-connect when served via HTTP (e.g. from NAS or local proxy).
        // The page origin IS the proxy, so use window.location.host as the
        // effective amp address — no setup needed for family members.
        var servedViaHttp = window.location.protocol === 'http:' && window.location.hostname !== '';
        if (servedViaHttp && !ampDirectIp) {
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
    }

    // Cleanup on page unload (mirror original behavior)
    window.addEventListener('beforeunload', function () {
        sendCommand('KOF');
        sendCommand('CLRLC');
        stopPolling();
    });

    // Fetch sources.md for default input configuration, then initialise.
    // Works when served via proxy/NAS; silently skipped when opened as file://.
    document.addEventListener('DOMContentLoaded', function () {
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
