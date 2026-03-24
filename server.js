const express = require('express');
const mqtt = require('mqtt');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ================= CONFIGURATION =================
const PORT = process.env.PORT || 8080;
const DEFAULT_DEVICE_ID = 'lumi_001';

// ================= MIDDLEWARE =================
app.use(cors());
app.use(express.json());

// ================= MQTT CONFIGURATION =================
let mqttClient = null;

function connectMQTT() {
    if (!process.env.MQTT_HOST || !process.env.MQTT_USER || !process.env.MQTT_PASS) {
        console.log('⚠️ MQTT credentials not set. Running in test mode.');
        return;
    }

    const mqttOptions = {
        username: process.env.MQTT_USER,
        password: process.env.MQTT_PASS,
        port: 8883,
        protocol: 'mqtts'
    };

    mqttClient = mqtt.connect(`mqtts://${process.env.MQTT_HOST}`, mqttOptions);
    
    mqttClient.on('connect', () => {
        console.log('✅ MQTT Connected to HiveMQ Cloud');
    });
    
    mqttClient.on('error', (err) => {
        console.error('❌ MQTT Error:', err.message);
    });
    
    mqttClient.on('reconnect', () => {
        console.log('🔄 MQTT Reconnecting...');
    });
}

connectMQTT();

// ================= DEVICE STATE STORAGE =================
let deviceStates = {
    [DEFAULT_DEVICE_ID]: {
        relays: [false, false, false, false],
        led: { r: 0, g: 0, b: 0 }
    }
};

// ================= ROOT ENDPOINT =================
app.get('/', (req, res) => {
    res.json({
        name: 'Lumi Cloud Bridge API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            root: '/',
            health: '/api/health',
            controlRelay: '/api/control/relay',
            controlLED: '/api/control/led/all',
            controlSingleLED: '/api/control/led/single',
            controlPattern: '/api/control/led/pattern',
            controlBrightness: '/api/control/led/brightness',
            deviceStatus: '/api/device/:deviceId/status',
            devices: '/api/devices'
        },
        mqtt: {
            connected: mqttClient ? mqttClient.connected : false,
            broker: process.env.MQTT_HOST || 'not configured'
        },
        documentation: {
            method: 'POST',
            relay: '{"relayId":1,"state":true,"deviceId":"lumi_001"}',
            led: '{"r":255,"g":0,"b":0,"deviceId":"lumi_001"}'
        }
    });
});

// ================= API ENDPOINTS =================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        mqtt: mqttClient ? mqttClient.connected : false,
        timestamp: new Date().toISOString(),
        port: PORT,
        uptime: process.uptime()
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
        
        if (!deviceStates[deviceId]) {
            deviceStates[deviceId] = { relays: [false, false, false, false], led: { r: 0, g: 0, b: 0 } };
        }
        deviceStates[deviceId].relays[relayId - 1] = state;
        
        res.json({ success: true, message: `Relay ${relayId} ${message}` });
    });
});

// Control All LEDs
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
        
        if (!deviceStates[deviceId]) {
            deviceStates[deviceId] = { relays: [false, false, false, false], led: { r: 0, g: 0, b: 0 } };
        }
        deviceStates[deviceId].led = { r, g, b };
        
        res.json({ success: true, message: `LED set to RGB(${r},${g},${b})` });
    });
});

// Control Single LED
app.post('/api/control/led/single', (req, res) => {
    const { led, r, g, b, deviceId = DEFAULT_DEVICE_ID } = req.body;
    
    if (led === undefined || r === undefined || g === undefined || b === undefined) {
        return res.status(400).json({ error: 'led, r, g, b required' });
    }
    
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT not connected' });
    }
    
    const topic = `lumi/${deviceId}/led/single`;
    const message = JSON.stringify({ led, r, g, b });
    
    mqttClient.publish(topic, message, { qos: 1 });
    res.json({ success: true, message: `LED ${led} set to RGB(${r},${g},${b})` });
});

// Control LED Pattern
app.post('/api/control/led/pattern', (req, res) => {
    const { pattern, deviceId = DEFAULT_DEVICE_ID } = req.body;
    
    if (pattern === undefined) {
        return res.status(400).json({ error: 'pattern required' });
    }
    
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT not connected' });
    }
    
    const topic = `lumi/${deviceId}/led/pattern`;
    mqttClient.publish(topic, pattern.toString(), { qos: 1 });
    res.json({ success: true, message: `Pattern ${pattern} activated` });
});

// Control LED Brightness
app.post('/api/control/led/brightness', (req, res) => {
    const { brightness, deviceId = DEFAULT_DEVICE_ID } = req.body;
    
    if (brightness === undefined || brightness < 0 || brightness > 255) {
        return res.status(400).json({ error: 'brightness required (0-255)' });
    }
    
    if (!mqttClient || !mqttClient.connected) {
        return res.status(503).json({ error: 'MQTT not connected' });
    }
    
    const topic = `lumi/${deviceId}/led/brightness`;
    mqttClient.publish(topic, brightness.toString(), { qos: 1 });
    res.json({ success: true, message: `Brightness set to ${brightness}` });
});

// Get Device Status
app.get('/api/device/:deviceId/status', (req, res) => {
    const { deviceId } = req.params;
    const status = deviceStates[deviceId] || { 
        relays: [false, false, false, false], 
        led: { r: 0, g: 0, b: 0 }
    };
    res.json({
        deviceId: deviceId,
        relays: status.relays,
        led: status.led,
        mqttConnected: mqttClient ? mqttClient.connected : false,
        timestamp: new Date().toISOString()
    });
});

// Get all devices
app.get('/api/devices', (req, res) => {
    const devices = Object.keys(deviceStates).map(deviceId => ({
        deviceId: deviceId,
        relays: deviceStates[deviceId].relays,
        led: deviceStates[deviceId].led
    }));
    res.json({ 
        devices: devices,
        count: devices.length,
        timestamp: new Date().toISOString()
    });
});

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.path}`,
        availableEndpoints: {
            root: '/',
            health: '/api/health',
            controlRelay: 'POST /api/control/relay',
            controlLED: 'POST /api/control/led/all',
            deviceStatus: 'GET /api/device/:deviceId/status',
            devices: 'GET /api/devices'
        }
    });
});

// ================= START SERVER =================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Lumi Cloud Bridge Server Running!`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Listening on: 0.0.0.0:${PORT}`);
    console.log(`   Root: http://0.0.0.0:${PORT}/`);
    console.log(`   Health: http://0.0.0.0:${PORT}/api/health`);
});

// ================= KEEP ALIVE =================
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    if (mqttClient) mqttClient.end();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    if (mqttClient) mqttClient.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

// Keep-alive ping every 30 seconds
setInterval(() => {
    console.log('💓 Server alive');
}, 30000);