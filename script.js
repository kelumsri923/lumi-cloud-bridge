// ================= CONFIGURATION =================
const API_URL = 'https://lumi-cloud-bridge-production.up.railway.app/api';
const DEVICE_ID = 'lumi_001';

// ================= DOM ELEMENTS =================
const mqttStatusEl = document.getElementById('mqttStatus');
const apiStatusEl = document.getElementById('apiStatus');
const ledPreview = document.getElementById('ledPreview');
const redSlider = document.getElementById('red');
const greenSlider = document.getElementById('green');
const blueSlider = document.getElementById('blue');
const redVal = document.getElementById('redVal');
const greenVal = document.getElementById('greenVal');
const blueVal = document.getElementById('blueVal');
const setColorBtn = document.getElementById('setColor');

// ================= API FUNCTIONS =================

// Check API Health
async function checkHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        
        apiStatusEl.innerHTML = data.status === 'ok' ? 
            '<span class="online">✅ Online</span>' : 
            '<span class="offline">❌ Offline</span>';
        
        mqttStatusEl.innerHTML = data.mqtt ? 
            '<span class="online">✅ Connected</span>' : 
            '<span class="offline">❌ Disconnected</span>';
        
        return data;
    } catch(e) {
        apiStatusEl.innerHTML = '<span class="offline">❌ Error</span>';
        mqttStatusEl.innerHTML = '<span class="offline">❌ Unknown</span>';
        console.error('Health check error:', e);
        return null;
    }
}

// Control Relay
async function controlRelay(relayId, state) {
    try {
        const response = await fetch(`${API_URL}/control/relay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relayId, state, deviceId: DEVICE_ID })
        });
        
        const data = await response.json();
        console.log(`Relay ${relayId} ${state ? 'ON' : 'OFF'}:`, data);
        
        if (response.ok) {
            // Visual feedback
            const btnOn = document.getElementById(`relay${relayId}_on`);
            const btnOff = document.getElementById(`relay${relayId}_off`);
            if (state) {
                btnOn.style.opacity = '0.7';
                btnOff.style.opacity = '1';
            } else {
                btnOn.style.opacity = '1';
                btnOff.style.opacity = '0.7';
            }
        }
    } catch(e) {
        console.error(`Error controlling relay ${relayId}:`, e);
        alert(`Failed to control relay ${relayId}. Check connection.`);
    }
}

// Control LED
async function setLED(r, g, b) {
    try {
        const response = await fetch(`${API_URL}/control/led/all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ r, g, b, deviceId: DEVICE_ID })
        });
        
        if (response.ok) {
            ledPreview.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            console.log(`LED set to RGB(${r},${g},${b})`);
        } else {
            console.error('LED control failed');
        }
    } catch(e) {
        console.error('Error setting LED:', e);
        alert('Failed to set LED color. Check connection.');
    }
}

// Get Device Status
async function getDeviceStatus() {
    try {
        const response = await fetch(`${API_URL}/device/${DEVICE_ID}/status`);
        const data = await response.json();
        
        if (data && data.relays) {
            for (let i = 0; i < data.relays.length; i++) {
                const btnOn = document.getElementById(`relay${i+1}_on`);
                const btnOff = document.getElementById(`relay${i+1}_off`);
                if (btnOn && btnOff) {
                    if (data.relays[i]) {
                        btnOn.style.opacity = '0.7';
                        btnOff.style.opacity = '1';
                    } else {
                        btnOn.style.opacity = '1';
                        btnOff.style.opacity = '0.7';
                    }
                }
            }
        }
        
        if (data && data.led) {
            ledPreview.style.backgroundColor = `rgb(${data.led.r}, ${data.led.g}, ${data.led.b})`;
            redSlider.value = data.led.r;
            greenSlider.value = data.led.g;
            blueSlider.value = data.led.b;
            redVal.innerText = data.led.r;
            greenVal.innerText = data.led.g;
            blueVal.innerText = data.led.b;
        }
    } catch(e) {
        console.error('Error getting device status:', e);
    }
}

// ================= CREATE RELAY BUTTONS =================
function createRelayButtons() {
    const container = document.getElementById('relays');
    container.innerHTML = '';
    
    for(let i = 1; i <= 4; i++) {
        const relayDiv = document.createElement('div');
        relayDiv.className = 'relay-group';
        
        const label = document.createElement('span');
        label.className = 'relay-label';
        label.innerText = `Relay ${i}:`;
        
        const btnOn = document.createElement('button');
        btnOn.id = `relay${i}_on`;
        btnOn.innerText = 'ON';
        btnOn.className = 'btn btn-on';
        btnOn.onclick = () => controlRelay(i, true);
        
        const btnOff = document.createElement('button');
        btnOff.id = `relay${i}_off`;
        btnOff.innerText = 'OFF';
        btnOff.className = 'btn btn-off';
        btnOff.onclick = () => controlRelay(i, false);
        
        relayDiv.appendChild(label);
        relayDiv.appendChild(btnOn);
        relayDiv.appendChild(btnOff);
        container.appendChild(relayDiv);
    }
}

// ================= SLIDER EVENT LISTENERS =================
redSlider.addEventListener('input', () => {
    redVal.innerText = redSlider.value;
});

greenSlider.addEventListener('input', () => {
    greenVal.innerText = greenSlider.value;
});

blueSlider.addEventListener('input', () => {
    blueVal.innerText = blueSlider.value;
});

setColorBtn.addEventListener('click', () => {
    const r = parseInt(redSlider.value);
    const g = parseInt(greenSlider.value);
    const b = parseInt(blueSlider.value);
    setLED(r, g, b);
});

// ================= INITIALIZE =================
createRelayButtons();
checkHealth();
getDeviceStatus();

// Auto refresh every 10 seconds
setInterval(() => {
    checkHealth();
    getDeviceStatus();
}, 10000);