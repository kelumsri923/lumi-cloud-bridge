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

// ================= API ENDPOINTS =================

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Lumi Cloud Bridge API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: '/api/health',
            controlRelay: '/api/control/relay',
            controlLED: '/api/control/led/all',
            deviceStatus: '/api/device/:deviceId/status'
        }
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        mqtt: mqttClient ? mqttClient.connected : false,
        timestamp: new Date().toISOString(),
        port: PORT
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
        
        res.json({ success: true });
    });
});

// Get Device Status
app.get('/api/device/:deviceId/status', (req, res) => {
    const { deviceId } = req.params;
    const status = deviceStates[deviceId] || { 
        relays: [false, false, false, false], 
        led: { r: 0, g: 0, b: 0 }
    };
    res.json({
        ...status,
        deviceId,
        mqttConnected: mqttClient ? mqttClient.connected : false
    });
});

// ================= START SERVER =================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Lumi Cloud Bridge Server Running!`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
});

// ================= KEEP ALIVE (Prevent Container from Stopping) =================
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