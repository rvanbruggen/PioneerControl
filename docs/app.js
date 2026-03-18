/**
 * Pioneer Amplifier Network Control
 * Communicates with Pioneer AVR via HTTP POST/GET to EventHandler.asp / StatusHandler.asp
 */

(function () {
    'use strict';

    const APP_VERSION = '0.1.0';
    const DEFAULT_IP = '192.168.68.60';
    const STATUS_POLL_INTERVAL = 2000; // ms
    const COMMAND_COOLDOWN = 150; // ms between rapid commands

    let ampIp = localStorage.getItem('pioneer_amp_ip') || '';
    let statusTimer = null;
    let connected = false;
    let lastCommandTime = 0;

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

    // ----- DOM references -----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        setupOverlay: $('#setup-overlay'),
        app: $('#app'),
        ipInput: $('#ip-input'),
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
        els.connectionStatus.title = state ? 'Connected to ' + ampIp : 'Disconnected';
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
        if (mute === 1) {
            el.textContent = 'MUTED';
        } else if (vol === 0 || vol === '000') {
            el.textContent = '---';
        } else {
            var db = (parseInt(vol, 10) - 161) / 2;
            el.textContent = db + ' dB';
        }
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

    function connectToAmp() {
        var ip = els.ipInput.value.trim();
        if (!ip) return;

        ampIp = ip;
        localStorage.setItem('pioneer_amp_ip', ampIp);

        els.setupOverlay.classList.add('hidden');
        els.app.classList.remove('hidden');

        startPolling();
    }

    function showSetup() {
        stopPolling();
        els.ipInput.value = ampIp || DEFAULT_IP;
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

        // Input select buttons
        $$('.btn-input').forEach(function (btn) {
            if (btn.dataset.cmd) {
                btn.addEventListener('click', function () {
                    sendCommand(btn.dataset.cmd);
                });
            }
        });

        // Collapse toggles for zone 2 and HD zone
        $$('.btn-collapse').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var card = btn.closest('.zone-card');
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

        // Check if we have a saved IP
        if (ampIp) {
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

    document.addEventListener('DOMContentLoaded', init);
})();
