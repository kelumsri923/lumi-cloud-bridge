const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MQTT Configuration (HiveMQ Cloud)
const mqttOptions = {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
    port: 8883,
    protocol: 'mqtts'
};

const DEFAULT_DEVICE_ID = 'lumi_001';

// Connect to MQTT Broker
let mqttClient = null;

function connectMQTT() {
    mqttClient = mqtt.connect(`mqtts://${process.env.MQTT_HOST}`, mqttOptions);
    
    mqttClient.on('connect', () => {
        console.log('✅ MQTT Connected to HiveMQ Cloud');
    });
    
    mqttClient.on('error', (err) => {
        console.error('❌ MQTT Error:', err.message);
    });
}

// Load environment variables and connect
if (process.env.MQTT_HOST && process.env.MQTT_USER && process.env.MQTT_PASS) {
    connectMQTT();
} else {
    console.log('⚠️ MQTT credentials not set. Running in test mode.');
}

// Store device states (in memory for demo)
let deviceStates = {
    [DEFAULT_DEVICE_ID]: {
        relays: [false, false, false, false],
        led: { r: 0, g: 0, b: 0 }
    }
};

// ========== API ENDPOINTS ==========

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        mqtt: mqttClient ? mqttClient.connected : false,
        timestamp: new Date().toISOString()
    });
});

// Control Relay
app.post('/api/control/relay', (req, res) => {
    const { relayId, state, deviceId = DEFAULT_DEVICE_ID } = req.body;
    
    if (!relayId || state === undefined) {
        return res.status(400).json({ error: 'relayId and state required' });
    }
    
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT not connected' });
    }
    
    const topic = `lumi/${deviceId}/relay/${relayId}`;
    const message = state ? 'ON' : 'OFF';
    
    mqttClient.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to send command' });
        }
        
        if (deviceStates[deviceId]) {
            deviceStates[deviceId].relays[relayId - 1] = state;
        }
        
        res.json({ success: true, message: `Relay ${relayId} ${message}` });
    });
});

// Control LEDs - All LEDs
app.post('/api/control/led/all', (req, res) => {
    const { r, g, b, deviceId = DEFAULT_DEVICE_ID } = req.body;
    
    if (r === undefined || g === undefined || b === undefined) {
        return res.status(400).json({ error: 'r, g, b required' });
    }
    
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT not connected' });
    }
    
    const topic = `lumi/${deviceId}/led/all`;
    const message = JSON.stringify({ r, g, b });
    
    mqttClient.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to send command' });
        }
        
        if (deviceStates[deviceId]) {
            deviceStates[deviceId].led = { r, g, b };
        }
        
        res.json({ success: true });
    });
});

// Control LEDs - Single LED
app.post('/api/control/led/single', (req, res) => {
    const { led, r, g, b, deviceId = DEFAULT_DEVICE_ID } = req.body;
    
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT not connected' });
    }
    
    const topic = `lumi/${deviceId}/led/single`;
    const message = JSON.stringify({ led, r, g, b });
    
    mqttClient.publish(topic, message, { qos: 1 });
    res.json({ success: true });
});

// Control LED Pattern
app.post('/api/control/led/pattern', (req, res) => {
    const { pattern, deviceId = DEFAULT_DEVICE_ID } = req.body;
    
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT not connected' });
    }
    
    const topic = `lumi/${deviceId}/led/pattern`;
    mqttClient.publish(topic, pattern.toString(), { qos: 1 });
    res.json({ success: true });
});

// Control LED Brightness
app.post('/api/control/led/brightness', (req, res) => {
    const { brightness, deviceId = DEFAULT_DEVICE_ID } = req.body;
    
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT not connected' });
    }
    
    const topic = `lumi/${deviceId}/led/brightness`;
    mqttClient.publish(topic, brightness.toString(), { qos: 1 });
    res.json({ success: true });
});

// Get Device Status
app.get('/api/device/:deviceId/status', (req, res) => {
    const { deviceId } = req.params;
    const status = deviceStates[deviceId] || { relays: [false, false, false, false], led: { r: 0, g: 0, b: 0 } };
    res.json(status);
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`   Health check: http://localhost:${port}/api/health`);
});