const http = require('http');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { OpenAI } = require('openai');
const axios = require('axios');
const { error } = require('winston');
const mysql = require('mysql2/promise');
const WebSocket = require('ws');

require('dotenv').config();

const readline = require('readline');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to prompt for input
function promptInput(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

// Simple logger replacement
const logger = {
    info: (message) => console.log(`[INFO] ${message}`),
    error: (message) => console.error(`[ERROR] ${message}`),
    warn: (message) => console.warn(`[WARN] ${message}`)
};

// MySQL Configuration
const MYSQL_CONFIG = {
    host: process.env.MYSQL_HOST || '94.72.106.77',
    user: process.env.MYSQL_USER || 'ryzon',
    password: process.env.MYSQL_PASSWORD || 'zain0980',
    database: 'ivex',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Message queue system
class MessageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.currentSequence = 2;
    }

    getNextSequence() {
        return this.currentSequence++;
    }

    resetSequence() {
        this.currentSequence = 2;
    }

    async enqueue(messagePayload) {
        return new Promise((resolve, reject) => {
            this.queue.push({ messagePayload, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const { messagePayload, resolve, reject } = this.queue.shift();

            try {
                let parsedMessage;
                let needsSequence = false;

                try {
                    parsedMessage = JSON.parse(messagePayload);
                    needsSequence = parsedMessage.hasOwnProperty('SQ');
                } catch {
                    await this._sendDirectly(messagePayload);
                    resolve();
                    continue;
                }

                if (needsSequence) {
                    parsedMessage.SQ = this.getNextSequence();
                }

                await this._sendDirectly(JSON.stringify(parsedMessage));
                console.log(parsedMessage);
                resolve();
            } catch (error) {
                reject(error);
            }

            await new Promise(r => setTimeout(r, 200));
        }

        this.processing = false;
    }

    async _sendDirectly(message) {
        return new Promise((resolve, reject) => {
            if (!botState.ws || botState.ws.readyState !== WebSocket.OPEN) {
                reject(new Error("WebSocket is not open"));
                return;
            }

            try {
                const base64Message = Buffer.from(message, 'utf8').toString('base64');

                botState.ws.send(base64Message, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }
}

// Create global message queue instance
const messageQueue = new MessageQueue();

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let mysqlPool;
let inClub = false;
let authRequired = false;
let authSocket = null;
let authMessage = null;
let club_code = process.env.CLUB_CODE;
let club_name = process.env.CLUB_NAME;
let my_uid = process.env.BOT_UID;
let bot_ep = process.env.EP;
let bot_key = process.env.KEY;
const PORT = process.env.PORT;
let allowInvites = false;
let membersData = [];
let bannedUserIds = [];
let check_ban_list = false;
const moveable_clubs = ['8937030'];
const ICIC_USAGE_FILE = './icic_usage.json';
const SETTINGS_FILE = './settings.json';
const MEMBERS_FILE = './club_members.json';
const conversationHistory = new Map();

// Load environment variables from token.txt
(async () => {
    if (!bot_ep || !bot_key) {
        const tokenPath = path.resolve('token.txt');

        try {
            await fs.access(tokenPath);
            const base64data = (await fs.readFile(tokenPath, 'utf-8')).trim();
            
            // Check if token.txt is empty
            if (!base64data) {
                console.warn('⚠️ token.txt is empty. Bot will continue without EP/KEY - waiting for authentication.');
            } else {
                const decoded = Buffer.from(base64data, 'base64').toString('utf-8');
                const outer = JSON.parse(decoded);
                const pyData = JSON.parse(outer.PY);

                bot_ep = pyData.EP;
                bot_key = pyData.KEY;

                const envPath = path.resolve('.env');
                let envContent = '';
                try {
                    envContent = await fs.readFile(envPath, 'utf-8');
                } catch {
                    // .env might not exist
                }

                const newLines = [];
                if (!envContent.includes('EP=')) newLines.push(`EP=${bot_ep}`);
                if (!envContent.includes('KEY=')) newLines.push(`KEY=${bot_key}`);

                if (newLines.length > 0) {
                    await fs.appendFile(envPath, '\n' + newLines.join('\n'));
                    console.log('✅ Added EP and KEY to .env');
                }

                process.env.EP = bot_ep;
                process.env.KEY = bot_key;
            }

        } catch (err) {
            console.warn('⚠️ Failed to decode token.txt:', err.message);
            console.warn('⚠️ Bot will continue without EP/KEY - waiting for authentication or token update.');
        }
    }

    console.log('Club Code:', club_code);
    console.log('Club Name:', club_name);
    console.log('BOT UID:', my_uid);
    console.log('Endpoint:', bot_ep || 'Not set');
    console.log('Key:', bot_key || 'Not set');
    console.log('Port:', PORT);
})();

const DEFAULT_SETTINGS = {
    allowAvatars: true,
    banLevel: 10,
    allowGuestIds: false,
    punishments: {
        bannedPatterns: 'ban',
        lowLevel: 'ban',
        noGuestId: 'ban',
        noAvatar: 'kick',
        spamWords: 'kick'
    }
};

// File paths
const CONFIG_FILES = {
    'admins': './admins.txt',
    'spam-words': './spam.txt',
    'banned-patterns': './banned_patterns.txt',
    'exemptions': './exemptions.txt',
    'loyal_members': './loyal_members.txt',
    'settings': './settings.json',
    'bot-config': './bot_configuration.json',
    'tone-templates': './tone_templates.json'
};

const path_users = './users.json';
const spamPath = "./spam.txt";

// Bot state management
let botState = {
    connected: false,
    connecting: false,
    ws: null,
    clubCode: `${club_code}`,
    clubName: `${club_name}`,
    startTime: null,
    stats: {
        messagesProcessed: 0,
        usersKicked: 0,
        spamBlocked: 0
    }
};

// Bot configuration
let botConfig = {
    admins: [],
    spamWords: [],
    bannedPatterns: [],
    settings: null,
    botConfiguration: null,
    toneTemplates: null
};

// Game state variables
let secretNumber = Math.floor(Math.random() * 100) + 1;
let botMic = 0;
let index_idx = 1;
let mics = new Array(10).fill(null);
let onMic = false;
let savedData = {};
let clubAdmins = [];
let pendingRemovals = [];
let pendingBans = [];
let pendingKicks = [];

let openai = new OpenAI({
    apiKey: process.env.OPENAI
});

// Reinitialize OpenAI
function reinitializeOpenAI(apiKey) {
    try {
        openai = new OpenAI({
            apiKey: apiKey
        });
        logger.info('✅ OpenAI client reinitialized with new API key');
        return true;
    } catch (error) {
        logger.error('❌ Failed to reinitialize OpenAI client:', error.message);
        return false;
    }
}

// Initialize MySQL
async function initializeMySQL() {
    let retries = 3;
    let lastError;

    while (retries > 0) {
        try {
            mysqlPool = mysql.createPool(MYSQL_CONFIG);
            const connection = await mysqlPool.getConnection();
            logger.info(`✅ MySQL connected successfully to ${MYSQL_CONFIG.host}`);

            await connection.query(`
                CREATE TABLE IF NOT EXISTS socket_status (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    bot_uid VARCHAR(255) NOT NULL,
                    club_code VARCHAR(255) NOT NULL,
                    club_name VARCHAR(500) NOT NULL,
                    status ENUM('connected', 'disconnected', 'error') NOT NULL,
                    message TEXT,
                    ip_address VARCHAR(45),
                    last_connected DATETIME,
                    last_disconnected DATETIME,
                    last_error DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    connection_count INT DEFAULT 1,
                    disconnection_count INT DEFAULT 0,
                    error_count INT DEFAULT 0,
                    UNIQUE KEY unique_bot_club (bot_uid, club_code),
                    INDEX idx_status (status),
                    INDEX idx_updated_at (updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            await connection.query(`
                CREATE TABLE IF NOT EXISTS socket_status_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    bot_uid VARCHAR(255) NOT NULL,
                    club_code VARCHAR(255) NOT NULL,
                    club_name VARCHAR(500) NOT NULL,
                    status ENUM('connected', 'disconnected', 'error') NOT NULL,
                    message TEXT,
                    ip_address VARCHAR(45),
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_bot_uid (bot_uid),
                    INDEX idx_club_code (club_code),
                    INDEX idx_timestamp (timestamp),
                    INDEX idx_status (status)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            connection.release();
            logger.info('✅ Socket status tables ready');
            return;

        } catch (error) {
            lastError = error;
            retries--;
            logger.error(`❌ MySQL connection attempt failed (${3 - retries}/3):`, error.message);

            if (retries > 0) {
                logger.info(`⏳ Retrying in 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    logger.error('❌ MySQL initialization failed after 3 attempts:', lastError?.message);
    logger.warn('⚠️ Bot will continue without MySQL logging');
    mysqlPool = null;
}

// Log socket status
async function logSocketStatus(status, message = null) {
    if (!mysqlPool) {
        logger.warn('⚠️ MySQL pool not available, skipping status log');
        return;
    }

    try {
        const networkInterfaces = os.networkInterfaces();
        let ipAddress = null;

        for (const interfaceName in networkInterfaces) {
            const addresses = networkInterfaces[interfaceName];
            for (const addr of addresses) {
                if (addr.family === 'IPv4' && !addr.internal) {
                    ipAddress = addr.address;
                    break;
                }
            }
            if (ipAddress) break;
        }

        const now = new Date();
        const uid = my_uid || 'unknown';
        const code = club_code || 'unknown';
        const name = club_name || 'unknown';

        let statusColumn = '';
        let counterIncrement = '';

        switch (status) {
            case 'connected':
                statusColumn = 'last_connected = VALUES(last_connected)';
                counterIncrement = 'connection_count = connection_count + 1';
                break;
            case 'disconnected':
                statusColumn = 'last_disconnected = VALUES(last_disconnected)';
                counterIncrement = 'disconnection_count = disconnection_count + 1';
                break;
            case 'error':
                statusColumn = 'last_error = VALUES(last_error)';
                counterIncrement = 'error_count = error_count + 1';
                break;
        }

        await mysqlPool.query(`
            INSERT INTO socket_status 
            (bot_uid, club_code, club_name, status, message, ip_address, last_${status}, ${status === 'connected' ? 'connection_count' : status === 'disconnected' ? 'disconnection_count' : 'error_count'}) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
                club_name = VALUES(club_name),
                status = VALUES(status),
                message = VALUES(message),
                ip_address = VALUES(ip_address),
                ${statusColumn},
                ${counterIncrement}
        `, [uid, code, name, status, message, ipAddress, now]);

        await mysqlPool.query(`
            INSERT INTO socket_status_history 
            (bot_uid, club_code, club_name, status, message, ip_address) 
            VALUES (?, ?, ?, ?, ?, ?)
        `, [uid, code, name, status, message, ipAddress]);

        logger.info(`📊 Socket status updated: ${status} for club "${name}" (${code})`);
    } catch (error) {
        logger.error('❌ Failed to log socket status:', error.message);
    }
}

// Utility functions
async function loadIcicUsage() {
    try {
        const data = await fs.readFile(ICIC_USAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            const defaultUsage = {
                lastUsed: null,
                usedBy: null,
                count: 0
            };
            await fs.writeFile(ICIC_USAGE_FILE, JSON.stringify(defaultUsage, null, 2), 'utf8');
            return defaultUsage;
        }
        logger.error('Error loading icic usage:', error.message);
        return { lastUsed: null, usedBy: null, count: 0 };
    }
}

async function updateIcicUsage(userId) {
    try {
        const usage = {
            lastUsed: new Date().toISOString(),
            usedBy: userId,
            count: (await loadIcicUsage()).count + 1,
            timestamp: Date.now()
        };
        await fs.writeFile(ICIC_USAGE_FILE, JSON.stringify(usage, null, 2), 'utf8');
        return true;
    } catch (error) {
        logger.error('Error updating icic usage:', error.message);
        return false;
    }
}

function extractBase64FromChunk(frame) {
    try {
        const lengthByte = frame[1] & 127; // Extract payload length (without mask bit)
        let payloadOffset = 2;

        if (lengthByte === 126) {
            payloadOffset = 4;
        } else if (lengthByte === 127) {
            payloadOffset = 10;
        }

        const payload = frame.slice(payloadOffset);
        return payload.toString()
    } catch (err) {
        console.error('Error extracting base64:', err);
        return null;
    }
}


function isToday(dateString) {
    if (!dateString) return false;
    const lastUsed = new Date(dateString);
    const today = new Date();
    return lastUsed.getFullYear() === today.getFullYear() &&
        lastUsed.getMonth() === today.getMonth() &&
        lastUsed.getDate() === today.getDate();
}

function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
}

async function saveClubMembers(jsonMessage) {
    try {
        if (jsonMessage?.PY?.ML !== undefined) {
            const jsonString = JSON.stringify(jsonMessage.PY.ML, null, 2);
            await fs.writeFile(MEMBERS_FILE, jsonString, 'utf8');
            console.log('Club members saved successfully!');
        } else {
            console.log('ML property not found in jsonMessage.PY');
        }
    } catch (error) {
        console.error('Error saving club members:', error);
    }
}

async function saveGifterList(jsonMessage) {
    try {
        if (!jsonMessage?.PY?.CTP) {
            console.log('⚠️ No CTP property found in jsonMessage.PY');
            return;
        }

        let existingData = [];
        try {
            const fileContent = await fs.readFile("gifters_club_data.json", 'utf8');
            existingData = JSON.parse(fileContent);
            if (!Array.isArray(existingData)) existingData = [];
        } catch {
            existingData = [];
        }

        const existingGCs = new Set(existingData.map(item => item.CID));
        const newEntries = jsonMessage.PY.CTP.filter(item => !existingGCs.has(item.CID));

        if (newEntries.length === 0) {
            console.log('ℹ️ No new unique CTP entries to add.');
            return;
        }

        const updatedData = [...existingData, ...newEntries];
        const jsonString = JSON.stringify(updatedData, null, 2);
        await fs.writeFile("gifters_club_data.json", jsonString, 'utf8');
        console.log(`✅ Added ${newEntries.length} new entries. Total: ${updatedData.length}`);
    } catch (error) {
        console.error('❌ Error saving gifter list:', error);
    }
}

async function createDefaultSettings() {
    const defaultSettings = {
        allowAvatars: true,
        banLevel: 10,
        allowGuestIds: false,
        punishments: {
            bannedPatterns: 'ban',
            lowLevel: 'ban',
            noGuestId: 'ban',
            noAvatar: 'kick',
            spamWords: 'kick'
        },
        createdAt: new Date().toISOString()
    };

    try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf8');
        logger.info('Created default settings.json file');
        return defaultSettings;
    } catch (error) {
        logger.error('Error creating default settings.json:', error.message);
        return null;
    }
}

function formatWelcomeMessage(userName) {
    const welcomeTemplate = botConfig.botConfiguration?.welcomeMessage || '✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️';
    return welcomeTemplate.replace('{name}', userName);
}

async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        const settings = JSON.parse(data);
        logger.info('Settings loaded from settings.json');
        return settings;
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('No settings.json found, creating default file');
            return await createDefaultSettings();
        } else {
            logger.error('Error reading settings.json:', error.message);
            return await createDefaultSettings();
        }
    }
}

// ====================
// API ENDPOINTS
// ====================

// Get token.txt content for Windows app
app.get('/api/jack/get-token', async (req, res) => {
    try {
        const tokenPath = path.join(__dirname, 'token.txt');
        const tokenContent = await fs.readFile(tokenPath, 'utf8');
        res.json({ success: true, token: tokenContent.trim() });
    } catch (error) {
        res.json({ success: false, message: 'Token file not found' });
    }
});

// Get authMessage for Windows app
app.get('/api/jack/get-auth-message', (req, res) => {
    if (authMessage) {
        res.json({ success: true, authMessage: authMessage });
    } else {
        res.json({ success: false, message: 'Auth message not available yet' });
    }
});

app.post('/api/jack/update-token', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.json({
                success: false,
                message: 'Token is required'
            });
        }

        logger.info('🔄 Token update requested');

        // Validate token before saving
        try {
            const decoded = Buffer.from(token.trim(), 'base64').toString('utf-8');
            const outer = JSON.parse(decoded);
            const pyData = JSON.parse(outer.PY);

            if (!pyData.EP || !pyData.KEY) {
                throw new Error('Missing EP or KEY');
            }
            logger.info('✅ Token validated - contains EP and KEY');
        } catch (validationErr) {
            logger.error('❌ Token validation failed:', validationErr.message);
            return res.json({
                success: false,
                message: 'Invalid token format. Token must be valid base64 with EP and KEY.'
            });
        }

        // Write new token to token.txt
        await fs.writeFile('token.txt', token, 'utf8');
        logger.info('✅ token.txt updated');

        // Remove EP and KEY from .env file
        try {
            const envPath = '.env';
            const envContent = await fs.readFile(envPath, 'utf8');
            const lines = envContent.split('\n');
            const filteredLines = lines.filter(line => {
                const trimmed = line.trim();
                return !trimmed.startsWith('EP=') && !trimmed.startsWith('KEY=');
            });
            await fs.writeFile(envPath, filteredLines.join('\n'), 'utf8');
            logger.info('✅ EP and KEY removed from .env file');
        } catch (envError) {
            logger.warn('⚠️ Could not update .env file:', envError.message);
        }

        // Remove EP and KEY from runtime environment
        delete process.env.EP;
        delete process.env.KEY;
        bot_ep = undefined;
        bot_key = undefined;
        logger.info('🗑️ EP and KEY removed from environment');

        res.json({
            success: true,
            message: 'Token updated, EP and KEY removed from .env. Restarting...'
        });

        // Restart the process after response is sent
        setTimeout(() => {
            logger.info('🔄 Executing process.exit(0) for PM2 restart');
            process.exit(0);
        }, 1000);

    } catch (error) {
        logger.error('❌ Error updating token:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/jack/auth-status', (req, res) => {
    res.json({
        success: true,
        authRequired: authRequired,
        connected: botState.connected,
        authMessage: authMessage
    });
});

app.get('/api/jack/tone-templates', async (req, res) => {
    try {
        const data = await fs.readFile('./tone_templates.json', 'utf8');
        const templates = JSON.parse(data);
        const toneList = Object.keys(templates.tones || {});

        res.json({
            success: true,
            data: {
                tones: toneList,
                templates: templates.tones
            }
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.json({
                success: true,
                data: {
                    tones: ["upbeat", "sarcastic", "wise", "energetic", "chill", "phuppo", "gangster", "party"],
                    templates: {}
                }
            });
        } else {
            res.json({
                success: false,
                message: error.message
            });
        }
    }
});

app.get('/api/jack/tone-templates/:toneName', async (req, res) => {
    try {
        const { toneName } = req.params;
        const data = await fs.readFile('./tone_templates.json', 'utf8');
        const templates = JSON.parse(data);

        if (templates.tones[toneName]) {
            res.json({
                success: true,
                data: {
                    name: toneName,
                    template: templates.tones[toneName]
                }
            });
        } else {
            res.json({
                success: false,
                message: 'Tone not found'
            });
        }
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/jack/update-openai-key', async (req, res) => {
    try {
        const { apiKey } = req.body;

        if (!apiKey || typeof apiKey !== 'string') {
            return res.json({
                success: false,
                message: 'API key is required'
            });
        }

        if (!apiKey.startsWith('sk-')) {
            return res.json({
                success: false,
                message: 'Invalid OpenAI API key format. Key should start with "sk-"'
            });
        }

        const envPath = path.resolve('.env');
        let envContent = '';
        try {
            envContent = await fs.readFile(envPath, 'utf-8');
        } catch (err) {
            return res.json({
                success: false,
                message: '.env file not found'
            });
        }

        const lines = envContent.split('\n');
        let keyFound = false;

        const updatedLines = lines.map(line => {
            if (line.trim().startsWith('OPENAI=')) {
                keyFound = true;
                return `OPENAI=${apiKey}`;
            }
            return line;
        });

        if (!keyFound) {
            updatedLines.push(`OPENAI=${apiKey}`);
        }

        await fs.writeFile(envPath, updatedLines.join('\n'), 'utf-8');
        process.env.OPENAI = apiKey;

        const reinitialized = reinitializeOpenAI(apiKey);

        if (!reinitialized) {
            return res.json({
                success: false,
                message: 'API key saved to .env but failed to reinitialize OpenAI client. Please restart the bot.'
            });
        }

        logger.info('✅ OpenAI API key updated in .env and client reinitialized');

        res.json({
            success: true,
            message: 'OpenAI API key updated successfully and applied immediately. No restart needed.'
        });

    } catch (error) {
        logger.error('❌ Error updating OpenAI key:', error.message);
        res.json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/jack/clear-credentials', async (req, res) => {
    try {
        const envPath = path.resolve('.env');
        let envContent = '';
        try {
            envContent = await fs.readFile(envPath, 'utf-8');
        } catch (err) {
            return res.json({
                success: false,
                message: '.env file not found'
            });
        }

        const lines = envContent.split('\n');
        const filteredLines = lines.filter(line => {
            const trimmed = line.trim();
            return !trimmed.startsWith('EP=') && !trimmed.startsWith('KEY=');
        });

        await fs.writeFile(envPath, filteredLines.join('\n'), 'utf-8');

        delete process.env.EP;
        delete process.env.KEY;
        bot_ep = null;
        bot_key = null;

        logger.info('✅ EP and KEY cleared from .env');

        res.json({
            success: true,
            message: 'Credentials cleared successfully. Please restart the bot.'
        });

    } catch (error) {
        logger.error('❌ Error clearing credentials:', error.message);
        res.json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/jack/update-token', async (req, res) => {
    try {
        const { tokenContent } = req.body;

        if (!tokenContent || typeof tokenContent !== 'string') {
            return res.json({
                success: false,
                message: 'Token content is required'
            });
        }

        try {
            const decoded = Buffer.from(tokenContent.trim(), 'base64').toString('utf-8');
            const outer = JSON.parse(decoded);
            const pyData = JSON.parse(outer.PY);

            if (!pyData.EP || !pyData.KEY) {
                throw new Error('Invalid token format - missing EP or KEY');
            }
        } catch (err) {
            return res.json({
                success: false,
                message: 'Invalid token format. Please ensure it contains valid base64 encoded data with EP and KEY.'
            });
        }

        const tokenPath = path.resolve('token.txt');
        await fs.writeFile(tokenPath, tokenContent.trim(), 'utf-8');

        logger.info('✅ token.txt updated successfully');

        res.json({
            success: true,
            message: 'Token file updated successfully. Please restart the bot to apply changes.'
        });

    } catch (error) {
        logger.error('❌ Error updating token.txt:', error.message);
        res.json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/jack/authenticate', async (req, res) => {
    try {
        const { authData } = req.body;

        if (!authData) {
            return res.json({
                success: false,
                message: 'Authentication data is required'
            });
        }

        if (!authSocket) {
            return res.json({
                success: false,
                message: 'No authentication pending'
            });
        }

        try {
            const decoded = Buffer.from(authData, 'base64').toString('utf-8');
            JSON.parse(decoded);
        } catch (err) {
            return res.json({
                success: false,
                message: 'Invalid authentication data format'
            });
        }

        // authSocket is the WebSocket instance
        authSocket.send(authData);
        console.log(authData);

        authRequired = false;
        authSocket = null;
        authMessage = null;

        logger.info('✅ Authentication credentials submitted');

        res.json({
            success: true,
            message: 'Authentication submitted successfully'
        });

    } catch (error) {
        logger.error('❌ Error during authentication:', error.message);
        res.json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/jack/tone-templates', async (req, res) => {
    try {
        const { toneName, template, isEdit } = req.body;

        if (!toneName || !template) {
            return res.json({
                success: false,
                message: 'Tone name and template are required'
            });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(toneName)) {
            return res.json({
                success: false,
                message: 'Tone name can only contain letters, numbers, and underscores'
            });
        }

        let templates = { tones: {} };

        try {
            const data = await fs.readFile('./tone_templates.json', 'utf8');
            templates = JSON.parse(data);
        } catch (error) {
            // File doesn't exist
        }

        if (templates.tones[toneName] && !isEdit) {
            return res.json({
                success: false,
                message: 'Tone already exists. Use edit mode to update.'
            });
        }

        templates.tones[toneName] = template;
        botConfig.toneTemplates = templates;

        await fs.writeFile('./tone_templates.json', JSON.stringify(templates, null, 2), 'utf8');
        logger.info(`Tone template ${isEdit ? 'updated' : 'added'}: ${toneName}`);

        res.json({
            success: true,
            message: `Tone ${isEdit ? 'updated' : 'added'} successfully`
        });

    } catch (error) {
        logger.error('Error saving tone template:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.delete('/api/jack/tone-templates/:toneName', async (req, res) => {
    try {
        const { toneName } = req.params;
        const data = await fs.readFile('./tone_templates.json', 'utf8');
        const templates = JSON.parse(data);

        if (!templates.tones[toneName]) {
            return res.json({
                success: false,
                message: 'Tone not found'
            });
        }

        delete templates.tones[toneName];
        await fs.writeFile('./tone_templates.json', JSON.stringify(templates, null, 2), 'utf8');
        logger.info(`Tone template deleted: ${toneName}`);

        res.json({
            success: true,
            message: 'Tone deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting tone template:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/jack/members', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const searchQuery = req.query.search || '';

        if (page < 1 || limit < 1 || limit > 100) {
            return res.json({
                success: false,
                message: 'Invalid pagination parameters'
            });
        }

        const data = await fs.readFile(MEMBERS_FILE, 'utf8');
        let allMembers = JSON.parse(data);

        if (searchQuery.trim()) {
            const search = searchQuery.toLowerCase();
            allMembers = allMembers.filter(member =>
                member.NM.toLowerCase().includes(search)
            );
        }

        const levelStats = {
            total: allMembers.length,
            highLevel: allMembers.filter(m => m.LVL >= 10).length,
            mediumLevel: allMembers.filter(m => m.LVL >= 5 && m.LVL <= 9).length,
            lowLevel: allMembers.filter(m => m.LVL >= 1 && m.LVL <= 4).length
        };

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedMembers = allMembers.slice(startIndex, endIndex);

        const responseData = {
            members: paginatedMembers,
            total: allMembers.length,
            page: page,
            limit: limit,
            totalPages: Math.ceil(allMembers.length / limit),
            levelStats: levelStats
        };

        logger.info(`📋 Members data sent: ${paginatedMembers.length} members (Page ${page}/${responseData.totalPages})`);

        res.json({
            success: true,
            data: responseData,
            message: `Loaded ${paginatedMembers.length} members`
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn('⚠️ Club members file not found');
            res.json({
                success: true,
                data: {
                    members: [],
                    total: 0,
                    page: 1,
                    limit: limit,
                    totalPages: 0,
                    levelStats: {
                        total: 0,
                        highLevel: 0,
                        mediumLevel: 0,
                        lowLevel: 0
                    }
                },
                message: 'No members file found'
            });
        } else {
            logger.error('❌ Error loading members:', error.message);
            res.json({
                success: false,
                message: 'Failed to load members data'
            });
        }
    }
});

app.delete('/api/jack/members/:uid', async (req, res) => {
    try {
        const { uid } = req.params;

        if (!uid) {
            return res.json({
                success: false,
                message: 'Member UID is required'
            });
        }

        const data = await fs.readFile(MEMBERS_FILE, 'utf8');
        const allMembers = JSON.parse(data);
        const memberIndex = allMembers.findIndex(member => member.UID === uid);

        if (memberIndex === -1) {
            return res.json({
                success: false,
                message: 'Member not found'
            });
        }

        const memberToRemove = allMembers[memberIndex];
        allMembers.splice(memberIndex, 1);
        await fs.writeFile(MEMBERS_FILE, JSON.stringify(allMembers, null, 2), 'utf8');

        logger.info(`🗑️ Member removed: ${memberToRemove.NM} (UID: ${uid})`);
        pendingRemovals.push(uid);

        res.json({
            success: true,
            message: `Member ${memberToRemove.NM} removed successfully`,
            removedMember: {
                UID: memberToRemove.UID,
                NM: memberToRemove.NM,
                LVL: memberToRemove.LVL
            }
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn('⚠️ Club members file not found');
            res.json({
                success: false,
                message: 'Members file not found'
            });
        } else {
            logger.error('❌ Error removing member:', error.message);
            res.json({
                success: false,
                message: 'Failed to remove member'
            });
        }
    }
});

app.post('/api/jack/members/bulk-remove', async (req, res) => {
    try {
        const { level, count } = req.body;

        if (typeof level !== 'number' || typeof count !== 'number') {
            return res.json({
                success: false,
                message: 'Level and count must be numbers'
            });
        }

        if (level < 1 || level > 100) {
            return res.json({
                success: false,
                message: 'Level must be between 1 and 100'
            });
        }

        if (count < 1 || count > 100) {
            return res.json({
                success: false,
                message: 'Count must be between 1 and 100'
            });
        }

        const data = await fs.readFile(MEMBERS_FILE, 'utf8');
        const allMembers = JSON.parse(data);
        const membersAtLevel = allMembers.filter(member => member.LVL === level);

        if (membersAtLevel.length === 0) {
            return res.json({
                success: false,
                message: `No members found at level ${level}`
            });
        }

        const removeCount = Math.min(count, membersAtLevel.length);
        const membersToRemove = membersAtLevel.slice(0, removeCount);
        const uidsToRemove = membersToRemove.map(m => m.UID);

        const updatedMembers = allMembers.filter(member => !uidsToRemove.includes(member.UID));
        await fs.writeFile(MEMBERS_FILE, JSON.stringify(updatedMembers, null, 2), 'utf8');

        pendingRemovals.push(...uidsToRemove);
        logger.info(`🗑️ Bulk removed ${removeCount} members at level ${level}`);

        res.json({
            success: true,
            message: `Successfully removed ${removeCount} members at level ${level}`,
            removedCount: removeCount,
            level: level,
            remainingAtLevel: membersAtLevel.length - removeCount
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn('⚠️ Club members file not found');
            res.json({
                success: false,
                message: 'Members file not found'
            });
        } else {
            logger.error('❌ Error bulk removing members:', error.message);
            res.json({
                success: false,
                message: 'Failed to bulk remove members'
            });
        }
    }
});

app.get('/api/jack/bot-config', async (req, res) => {
    try {
        const data = await fs.readFile('./bot_configuration.json', 'utf8');
        const config = JSON.parse(data);
        botConfig.botConfiguration = config;

        res.json({
            success: true,
            data: config,
            filename: 'bot_configuration.json'
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            const defaultConfig = {
                botName: 'Elijah',
                botTone: 'upbeat',
                welcomeMessage: '✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️',
                createdAt: new Date().toISOString()
            };

            await fs.writeFile('./bot_configuration.json', JSON.stringify(defaultConfig, null, 2));
            logger.info('Created default bot_configuration.json file');

            res.json({
                success: true,
                data: defaultConfig,
                filename: 'bot_configuration.json'
            });
        } else {
            res.json({ success: false, message: error.message });
        }
    }
});

app.post('/api/jack/bot-config', async (req, res) => {
    try {
        const { botName, botTone, welcomeMessage } = req.body;

        if (!botName || typeof botName !== 'string' ||
            !botTone || typeof botTone !== 'string' ||
            !welcomeMessage || typeof welcomeMessage !== 'string') {
            return res.json({ success: false, message: 'Invalid bot configuration data' });
        }

        const availableTones = Object.keys(botConfig.toneTemplates?.tones || {});
        if (availableTones.length > 0 && !availableTones.includes(botTone)) {
            return res.json({
                success: false,
                message: `Invalid bot tone. Available tones: ${availableTones.join(', ')}`
            });
        }

        const config = {
            botName: botName.trim(),
            botTone,
            welcomeMessage: welcomeMessage.trim(),
            updatedAt: new Date().toISOString()
        };

        await fs.writeFile('./bot_configuration.json', JSON.stringify(config, null, 2), 'utf8');
        botConfig.botConfiguration = config;

        logger.info(`Bot configuration updated: Name: ${botName}, Tone: ${botTone}, Welcome: ${welcomeMessage}`);

        res.json({
            success: true,
            message: 'Bot configuration saved successfully',
            filename: 'bot_configuration.json'
        });

        conversationHistory.clear();
    } catch (error) {
        logger.error('Error saving bot configuration:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/jack/settings', async (req, res) => {
    try {
        const settings = await loadSettings();

        res.json({
            success: true,
            data: settings,
            filename: 'settings.json'
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            res.json({
                success: true,
                data: DEFAULT_SETTINGS,
                filename: 'settings.json'
            });
        } else {
            res.json({ success: false, message: error.message });
        }
    }
});

app.post('/api/jack/restart', async (req, res) => {
    try {
        logger.info('🔄 Bot restart requested from dashboard');

        res.json({
            success: true,
            message: 'Bot restart initiated - PM2 will handle the restart'
        });

        setTimeout(() => {
            logger.info('🔄 Executing process.exit(0) for PM2 restart');
            process.exit(0);
        }, 1000);

    } catch (error) {
        logger.error('❌ Error during restart:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/jack/settings', async (req, res) => {
    try {
        const { allowAvatars, banLevel, allowGuestIds, punishments } = req.body;

        if (typeof allowAvatars !== 'boolean' ||
            typeof allowGuestIds !== 'boolean' ||
            typeof banLevel !== 'number' ||
            banLevel < 1 || banLevel > 100) {
            return res.json({ success: false, message: 'Invalid settings data' });
        }

        if (punishments) {
            const validPunishmentTypes = ['ban', 'kick'];
            const validViolationTypes = ['bannedPatterns', 'lowLevel', 'noGuestId', 'noAvatar', 'spamWords'];

            for (const [key, value] of Object.entries(punishments)) {
                if (!validViolationTypes.includes(key) || !validPunishmentTypes.includes(value)) {
                    return res.json({ success: false, message: 'Invalid punishment configuration' });
                }
            }
        }

        const settings = {
            allowAvatars,
            banLevel,
            allowGuestIds,
            punishments: punishments || {
                bannedPatterns: 'ban',
                lowLevel: 'ban',
                noGuestId: 'ban',
                noAvatar: 'kick',
                spamWords: 'kick'
            },
            updatedAt: new Date().toISOString()
        };

        await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
        botConfig.settings = settings;

        logger.info(`Settings updated: Avatars: ${allowAvatars}, Ban Level: ${banLevel}, Guest IDs: ${allowGuestIds}`);
        logger.info(`Punishments: ${JSON.stringify(settings.punishments)}`);

        res.json({
            success: true,
            message: 'Settings saved successfully',
            filename: 'settings.json'
        });

    } catch (error) {
        logger.error('Error saving settings:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/jack/config/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const filePath = CONFIG_FILES[type];

        if (!filePath) {
            return res.json({ success: false, message: 'Invalid config type' });
        }

        const data = await fs.readFile(filePath, 'utf8');
        let parsedData;

        if (type === 'spam-words') {
            parsedData = data.split('\n').filter(line => line.trim() !== '');
        } else if (type === 'banned-patterns') {
            parsedData = data.split(',').map(item => item.trim()).filter(item => item !== '');
        } else if (type === 'admins') {
            parsedData = data.split(',').map(item => item.trim()).filter(item => item !== '');
        } else if (type === 'exemptions') {
            parsedData = data.split(',').map(item => item.trim()).filter(item => item !== '');
        } else if (type === 'loyal_members') {
            parsedData = data.split(',').map(item => item.trim()).filter(item => item !== '');
        }

        res.json({
            success: true,
            data: parsedData,
            filename: path.basename(filePath)
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
            res.json({ success: false, message: 'File not found' });
        } else {
            res.json({ success: false, message: error.message });
        }
    }
});

app.post('/api/jack/config/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { data } = req.body;
        const filePath = CONFIG_FILES[type];

        if (!filePath) {
            return res.json({ success: false, message: 'Invalid config type' });
        }

        let fileContent;

        if (type === 'spam-words') {
            fileContent = data.join('\n');
            botConfig.spamWords = data;
        } else if (type === 'banned-patterns') {
            fileContent = data.join(', ');
            botConfig.bannedPatterns = data;
        } else if (type === 'admins') {
            fileContent = data.join(', ');
            botConfig.admins = data;
        } else if (type === 'exemptions') {
            fileContent = data.join(', ');
            botConfig.exemptions = data;
        } else if (type === 'loyal_members') {
            fileContent = data.join(', ');
            botConfig.loyal_members = data;
        }

        await fs.writeFile(filePath, fileContent, 'utf8');
        logger.info(`Configuration ${type} updated: ${data.length} items`);

        res.json({
            success: true,
            message: 'Configuration saved',
            filename: path.basename(filePath)
        });

    } catch (error) {
        logger.error(`Error saving ${type}:`, error.message);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/jack/connect', async (req, res) => {
    try {
        if (botState.connected || botState.connecting) {
            return res.json({ success: false, message: 'Bot is already connected or connecting' });
        }

        logger.info(`🤖 Bot ${botConfig.botConfiguration?.botName} connection requested from dashboard`);

        await loadAllConfigurations();

        botState.connecting = true;
        botState.startTime = Date.now();

        const connected = await connectWebSocket();

        if (connected) {
            botState.connected = true;
            botState.connecting = false;
            logger.info(`✅ Bot ${botConfig.botConfiguration?.botName} connected successfully`);
            res.json({
                success: true,
                message: `Bot ${botConfig.botConfiguration?.botName} connected successfully`,
                clubCode: botState.clubCode,
                clubName: botState.clubName
            });
        } else {
            botState.connecting = false;
            res.json({ success: false, message: 'Failed to connect to WebSocket' });
        }

    } catch (error) {
        botState.connecting = false;
        logger.error('❌ Error connecting bot:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/jack/disconnect', async (req, res) => {
    try {
        if (!botState.connected) {
            return res.json({ success: false, message: 'Bot is not connected' });
        }

        logger.info(`🔌 Bot ${botConfig.botConfiguration?.botName} disconnection requested from dashboard`);

        if (botState.ws) {
            exitclub();

            setTimeout(() => {
                if (botState.ws) {
                    botState.ws.close();
                    botState.ws = null;
                }
            }, 1000);
        }

        botState.connected = false;
        botState.startTime = null;

        logger.info(`🔴 Bot ${botConfig.botConfiguration?.botName} disconnected`);
        res.json({
            success: true,
            message: `Bot ${botConfig.botConfiguration?.botName} disconnected successfully`
        });

    } catch (error) {
        logger.error('❌ Error disconnecting bot:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.get('/api/jack/status', (req, res) => {
    const uptime = botState.startTime ? Date.now() - botState.startTime : 0;

    res.json({
        success: true,
        connected: botState.connected,
        connecting: botState.connecting,
        clubCode: botState.clubCode,
        clubName: botState.clubName,
        uptime: uptime,
        stats: botState.stats,
        configLoaded: {
            admins: botConfig.admins.length,
            spamWords: botConfig.spamWords.length,
            bannedPatterns: botConfig.bannedPatterns.length
        }
    });
});

// ====================
// CONFIGURATION LOADING
// ====================

async function loadAllConfigurations() {
    try {
        const settings = await loadConfigFromFile('settings');
        if (settings) {
            botConfig.settings = settings;
            logger.info(`⚙️ Loaded settings: Avatars: ${settings.allowAvatars}, Ban Level: ${settings.banLevel}, Guest IDs: ${settings.allowGuestIds}`);
        } else {
            botConfig.settings = {
                allowAvatars: true,
                banLevel: 10,
                allowGuestIds: false,
                punishments: {
                    bannedPatterns: 'ban',
                    lowLevel: 'ban',
                    noGuestId: 'ban',
                    noAvatar: 'kick',
                    spamWords: 'kick'
                }
            };
            logger.warn('⚠️ Using hardcoded settings defaults');
        }

        const botConfiguration = await loadConfigFromFile('bot-config');
        if (botConfiguration) {
            botConfig.botConfiguration = botConfiguration;
            logger.info(`🤖 Bot config loaded: ${botConfiguration.botName} (${botConfiguration.botTone})`);
        } else {
            botConfig.botConfiguration = {
                botName: 'Elijah',
                botTone: 'upbeat',
                welcomeMessage: '✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️'
            };
            logger.warn('⚠️ Using hardcoded bot configuration defaults');
        }

        const admins = await loadConfigFromFile('admins');
        if (admins && admins.length > 0) {
            botConfig.admins = admins;
            logger.info(`📋 Loaded ${admins.length} admins`);
        }

        const spamWords = await loadWords();
        if (spamWords && spamWords.length > 0) {
            botConfig.spamWords = spamWords;
            logger.info(`🛡️ Loaded ${spamWords.length} spam words`);
        }

        const bannedPatterns = await loadConfigFromFile('banned-patterns');
        if (bannedPatterns && bannedPatterns.length > 0) {
            botConfig.bannedPatterns = bannedPatterns;
            logger.info(`🚫 Loaded ${bannedPatterns.length} banned patterns`);
        }

        const exemptions = await loadConfigFromFile('exemptions');
        if (exemptions && exemptions.length > 0) {
            botConfig.exemptions = exemptions;
            logger.info(`🚫 Loaded ${exemptions.length} exemptions`);
        }

        const loyal_members = await loadConfigFromFile('loyal_members');
        if (loyal_members && loyal_members.length > 0) {
            botConfig.loyal_members = loyal_members;
            logger.info(`🚫 Loaded ${loyal_members.length} loyal members`);
        }

        const toneTemplates = await loadConfigFromFile('tone-templates');
        if (toneTemplates) {
            botConfig.toneTemplates = toneTemplates;
            logger.info(`🎭 Loaded ${Object.keys(toneTemplates.tones || {}).length} tone templates`);
        }

        logger.info('✅ All configurations loaded from files');

    } catch (error) {
        logger.error('❌ Error loading configurations:', error.message);
    }
}

async function initializeBot() {
    try {
        await loadAllConfigurations();
        await initializeMySQL();

        if (!botConfig.settings) {
            botConfig.settings = {
                allowAvatars: true,
                banLevel: 10,
                allowGuestIds: false,
                punishments: {
                    bannedPatterns: 'ban',
                    lowLevel: 'ban',
                    noGuestId: 'ban',
                    noAvatar: 'kick',
                    spamWords: 'kick'
                }
            };
        }

        if (!botConfig.botConfiguration) {
            botConfig.botConfiguration = {
                botName: 'Elijah',
                botTone: 'upbeat'
            };
        }

        if (!botConfig.exemptions) {
            botConfig.exemptions = [];
        }

        logger.info('🎯 Bot initialization complete');

        connectWebSocket();
    } catch (error) {
        logger.error('❌ Bot initialization failed:', error.message);
    }
}

async function loadConfigFromFile(type) {
    try {
        const filePath = CONFIG_FILES[type];
        const data = await fs.readFile(filePath, 'utf8');

        if (type === 'spam-words') {
            return data.split('\n').filter(line => line.trim() !== '');
        } else if (type === 'banned-patterns' || type === 'admins' || type === 'exemptions' || type === 'loyal_members') {
            return data.split(',').map(item => item.trim()).filter(item => item !== '');
        } else if (type === 'settings' || type === 'bot-config' || type === 'tone-templates') {
            return JSON.parse(data);
        }

    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info(`📁 No ${type} file found, creating defaults`);

            if (type === 'settings') {
                return await createDefaultSettings();
            } else if (type === 'bot-config') {
                return await createDefaultBotConfig();
            }
        } else {
            logger.error(`❌ Error loading ${type}:`, error.message);
        }
        return null;
    }
}

// ====================
// BOT UTILITY FUNCTIONS
// ====================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isNotEmptyJson(obj) {
    return obj && typeof obj === 'object' && Object.keys(obj).length > 0;
}

async function loadMembersData() {
    try {
        const data = await fs.readFile('azoozi.json', 'utf8');
        membersData = JSON.parse(data);
        logger.info('Members data loaded successfully.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('No members.json file found.');
            membersData = [];
        } else {
            console.error('❌ Error loading members data:', error.message);
            membersData = [];
        }
    }
}

function isMemberUID(ui) {
    return membersData.some(member => member.ui === ui);
}

async function loadPlayers() {
    try {
        const data = await fs.readFile('snuid_values.txt', 'utf8');
        const codesArray = data.split(/\r?\n/).filter(line => line.trim() !== '');
        return codesArray;
    } catch (error) {
        console.error('Error reading the file:', error);
        return [];
    }
}

async function createDefaultBotConfig() {
    const defaultBotConfig = {
        botName: 'Elijah',
        botTone: 'upbeat',
        welcomeMessage: '✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️',
        createdAt: new Date().toISOString()
    };

    try {
        await fs.writeFile('./bot_configuration.json', JSON.stringify(defaultBotConfig, null, 2), 'utf8');
        logger.info('Created default bot_configuration.json file');
        return defaultBotConfig;
    } catch (error) {
        logger.error('Error creating default bot_configuration.json:', error.message);
        return null;
    }
}

function getName(GC) {
    for (const UID in savedData) {
        if (UID === GC) {
            const currentName = savedData[UID].NM;
            return currentName;
        }
    }
    return null;
}

function getNames(GC) {
    if (!savedData[GC]) {
        return `No data found for GC: ${GC}`;
    }
    for (const UID in savedData) {
        if (UID === GC) {
            const currentName = savedData[UID].NM;
            const oldNames = savedData[UID].oldNames?.length ? savedData[UID].oldNames.join(", ") : "None";
            result = `UID: ${UID} - Current Name: ${currentName}, Old Names: ${oldNames}\n`;
        }
    }
    return result.trim();
}

function removeBotName(message) {
    const botName = botConfig.botConfiguration?.botName || 'Elijah';
    const regex = new RegExp(`^${botName}\\s*`, 'i');
    return message.replace(regex, "");
}

function gptTone(user_id) {
    const botName = botConfig.botConfiguration?.botName || 'Elijah';
    const botTone = botConfig.botConfiguration?.botTone || 'upbeat';

    const template = botConfig.toneTemplates?.tones?.[botTone] ||
        "You are {botName}(FEMALE), a fun, upbeat friend—not an AI. Keep replies short, cheerful, and playful.";

    return template.replace('{botName}', botName);
}

function splitMessage(message, maxLength = 100) {
    const chunks = [];
    let currentChunk = '';
    const words = message.split(' ');

    for (const word of words) {
        if ((currentChunk + word).length > maxLength) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = word + ' ';
        } else {
            currentChunk += word + ' ';
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

async function getResponse(message, user_id) {
    try {
        if (!conversationHistory.has(user_id)) {
            conversationHistory.set(user_id, [
                { role: "system", content: gptTone(user_id) }
            ]);
        }

        const history = conversationHistory.get(user_id);
        history.push({ role: "user", content: message });

        const recentHistory = history.slice(-11);

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: recentHistory,
            max_tokens: 200,
            temperature: 0.8,
        });

        const reply = response.choices?.[0]?.message?.content?.trim() || "Sorry, I didn't catch that.";
        history.push({ role: "assistant", content: reply });

        return reply;
    } catch (error) {
        console.error("Error fetching ChatGPT response:", error.message || error);
        return "Sorry, I couldn't process that.";
    }
}

async function addSpamWord(word) {
    try {
        await fs.appendFile(spamPath, `${word}\n`);
        botConfig.spamWords.push(word);
        logger.info(`Word "${word}" added successfully.`);
    } catch (err) {
        console.error('❌ Error adding word:', err.message);
    }
}

function findPlayerID(UID) {
    for (const GC in savedData) {
        if (savedData[GC].UID === UID) {
            return GC;
        }
    }
}

function findPlayerName(UID) {
    for (const GC in savedData) {
        if (savedData[GC].UID === UID) {
            return savedData[GC].NM;
        }
    }
}

async function loadWords() {
    try {
        const data = await fs.readFile(spamPath, 'utf-8');
        return data.split('\n').filter(line => line.trim() !== '');
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.info('No words file found. Returning an empty array.');
            return [];
        } else {
            console.error('❌ Error reading file:', err.message);
            return [];
        }
    }
}

async function loadSavedData(path) {
    try {
        await fs.access(path);
        const rawData = await fs.readFile(path, 'utf8');
        savedData = JSON.parse(rawData);
        logger.info('Data loaded.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('📁 No existing data file found. Starting fresh.');
            savedData = {};
        } else if (error.name === 'SyntaxError') {
            console.error('❌ Error parsing JSON data:', error.message);
            savedData = {};
        } else {
            console.error('❌ Error reading file:', error.message);
            savedData = {};
        }
    }
}

async function saveData(data, path) {
    try {
        await fs.writeFile(path, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ Error saving data:', error.message);
    }
}

function checkAvatar(number) {
    return number.toString().startsWith('1000');
}

async function addMessage(line) {
    try {
        await fs.appendFile('chat.txt', line + '\n');
    } catch (err) {
        console.error('Error appending to file:', err);
        throw err;
    }
}

// ====================
// WEBSOCKET CONNECTION
// ====================

async function connectWebSocket() {
    return new Promise((resolve, reject) => {
        try {
            const url = 'ws://ws.ls.superkinglabs.com/ws';
            const ws = new WebSocket(url);

            botState.ws = ws;

            ws.on('open', async () => {
                logger.info('🔌 WebSocket connection opened');

                // Queue processors
                const removalQueueProcessor = setInterval(() => {
                    if (pendingRemovals.length > 0) {
                        logger.info(`🔄 Processing ${pendingRemovals.length} pending removals`);
                        pendingRemovals.forEach(uid => {
                            removeMember(uid);
                            logger.info(`✅ Executed removal for UID: ${uid}`);
                        });
                        pendingRemovals = [];
                    }
                }, 2000);

                let isProcessingBans = false;
                let previousBanQueueLength = 0;

                const banQueueProcessor = setInterval(async () => {
                    if (pendingBans.length > 0 && !isProcessingBans) {
                        isProcessingBans = true;
                        previousBanQueueLength = pendingBans.length;

                        const batchSize = 5;
                        const batch = pendingBans.splice(0, batchSize);

                        logger.info(`🔨 Processing ${batch.length} bans (${pendingBans.length} remaining in queue)`);

                        for (const uid of batch) {
                            executeBan(uid);
                            await sleep(50);
                        }

                        isProcessingBans = false;

                        if (pendingBans.length === 0 && previousBanQueueLength > 0) {
                            logger.info('✅ Ban queue empty - executing refresh()');
                            setTimeout(() => {
                                refresh();
                                botState.stats.usersKicked += previousBanQueueLength;
                            }, 500);
                            previousBanQueueLength = 0;
                        }
                    }
                }, 300);

                let isProcessingKicks = false;
                let previousKickQueueLength = 0;

                const kickQueueProcessor = setInterval(async () => {
                    if (pendingKicks.length > 0 && !isProcessingKicks) {
                        isProcessingKicks = true;
                        previousKickQueueLength = pendingKicks.length;

                        const batchSize = 5;
                        const batch = pendingKicks.splice(0, batchSize);

                        logger.info(`👢 Processing ${batch.length} kicks (${pendingKicks.length} remaining in queue)`);

                        for (const uid of batch) {
                            executeKick(uid);
                            await sleep(50);
                        }

                        isProcessingKicks = false;

                        if (pendingKicks.length === 0 && previousKickQueueLength > 0) {
                            logger.info('✅ Kick queue empty - executing refresh()');
                            setTimeout(() => {
                                refresh();
                                botState.stats.usersKicked += previousKickQueueLength;
                            }, 500);
                            previousKickQueueLength = 0;
                        }
                    }
                }, 300);

                await loadSavedData(path_users);
                await loadMembersData();
                const people = await loadPlayers();

                logger.info("Arrays Loaded.");
                logger.info('Bot Started.');

                // Send authentication
                const auth = JSON.stringify({
                    RH: "jo",
                    PU: "",
                    PY: JSON.stringify({
                        EP: `${bot_ep}`,
                        KEY: `${bot_key}`
                    }),
                    EN: true
                });

                sendWebSocketMessage(auth);
                console.log(`Authentication sent at ${new Date().toLocaleString()}`);

                resolve(true);
            });

            ws.on('message', async (data) => {
                try {
                    const messageString = data.toString();
                    let jsonMessage;

                    try {
                        // Check if it's base64
                        if (/^[A-Za-z0-9+/]+=*$/.test(messageString.trim())) {
                            const decoded = Buffer.from(messageString, 'base64').toString('utf-8');
                            jsonMessage = JSON.parse(decoded);
                        } else {
                            jsonMessage = JSON.parse(messageString);
                        }
                    } catch (parseErr) {
                        logger.error('❌ Failed to parse message:', parseErr.message);
                        return;
                    }

                    console.log(`${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}:`, jsonMessage);

                    // Heartbeat handler - ping the socket back
                    if (jsonMessage?.RH === 'hb') {
                        const pong = JSON.stringify({ RH: 'ha', PU: '', PY: {} });
                        const base64Pong = Buffer.from(pong, 'utf8').toString('base64');
                        ws.send(base64Pong);
                        return;
                    }

                    // Authentication handling
                    if (jsonMessage?.PY?.hasOwnProperty('IA')) {
                        console.log('\n🔐 Authentication Required');
                        logger.info('🔐 Authentication required - waiting for frontend input');
                        authRequired = true;
                        authSocket = ws;
                        authMessage = messageString;
                    }

                    if (jsonMessage?.RH === "AUA") {
                        console.log(`Bot connected at ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
                        await logSocketStatus('connected', 'WebSocket connection established');

                        joinClub(club_code);

                        const pingInterval = setInterval(() => {
                            refresh();
                        }, 25000);

                        setTimeout(() => {
                            setInterval(() => {
                                exitclub();
                                joinClub(club_code);
                            }, 3600000);
                        }, 5000);
                    }

                    if (jsonMessage?.PY?.hasOwnProperty('ML')) {
                        saveClubMembers(jsonMessage);
                    }

                    if (jsonMessage?.PY?.hasOwnProperty('ER') &&
                        (jsonMessage.PY?.ER === "DISCONNECTED" || jsonMessage.PY?.ER === "disconnected")) {
                        process.exit(0);
                    }

                    botState.stats.messagesProcessed++;

                    if (isNotEmptyJson(jsonMessage)) {
                        // Check banned patterns
                        if (jsonMessage?.PY?.NM) {
                            const userName = String(jsonMessage.PY.NM);
                            const hasBannedPattern = botConfig.bannedPatterns.some(pattern =>
                                userName.includes(pattern)
                            );

                            if (hasBannedPattern) {
                                applyPunishment(jsonMessage.PY.UID, 'bannedPatterns');
                                botState.stats.usersKicked++;
                            }
                        }

                        if (jsonMessage.PY?.CUP) {
                            const userGC = findPlayerID(jsonMessage.PY.UID);
                            const isExemptFromLevel = userGC && botConfig.exemptions?.includes(userGC);
                            
                            if (!isExemptFromLevel && Number(jsonMessage.PY.CUP.PD.L) < botConfig.settings.banLevel) {
                                applyPunishment(jsonMessage.PY.UID, 'lowLevel');
                            }
                        }

                        if (jsonMessage.RH === "CBC" && jsonMessage.PU === "TMS" && jsonMessage?.PY?.hasOwnProperty('ER')) {
                            const failed_mic = jsonMessage.PY.IN;
                            const next_target = Number(failed_mic) + 1;
                            joinAdminMic(next_target);
                        }

                        if (jsonMessage.RH === "CBC" && jsonMessage.PU === "GLL") {
                            saveGifterList(jsonMessage);
                        }

                        if (jsonMessage && jsonMessage?.PY?.hasOwnProperty('ER') && jsonMessage.PU !== "TMS") {
                            refresh();
                        }

                        if (jsonMessage.PY && jsonMessage.PY.GC && jsonMessage.PY.NM) {
                            const { GC, NM, UID, SNUID, AV } = jsonMessage.PY;
                            checkLevel(UID);

                            const isExempt = botConfig.exemptions?.includes(GC) || false;

                            let shouldWelcome = true;
                            let shouldBan = false;
                            let violationType = 'noGuestId';

                            if (!isExempt) {
                                if (!botConfig.settings.allowGuestIds && SNUID === undefined) {
                                    shouldBan = true;
                                    shouldWelcome = false;
                                    violationType = 'noGuestId';
                                } else if (!botConfig.settings.allowAvatars && checkAvatar(AV)) {
                                    applyPunishment(UID, 'noAvatar');
                                    shouldWelcome = false;
                                }
                            }

                            const hasBannedPattern = botConfig.bannedPatterns.some(pattern =>
                                String(NM).includes(pattern)
                            );

                            if (hasBannedPattern) {
                                shouldBan = true;
                                shouldWelcome = false;
                                violationType = 'bannedPatterns';
                            }

                            if (shouldBan) {
                                applyPunishment(UID, violationType);
                            }

                            if (shouldWelcome) {
                                sendMessage(formatWelcomeMessage(NM));
                            }

                            if (!savedData[GC]) {
                                try {
                                    savedData[GC] = {
                                        NM,
                                        UID,
                                        oldNames: [],
                                        lastSeen: new Date().toISOString()
                                    };
                                } catch (err) { console.log(err); }
                            } else {
                                const currentName = savedData[GC].NM;
                                if (currentName !== NM) {
                                    if (!savedData[GC].oldNames) {
                                        savedData[GC].oldNames = [];
                                    }
                                    savedData[GC].oldNames.push(currentName);
                                    savedData[GC].NM = NM;
                                }
                                savedData[GC].lastSeen = new Date().toISOString();
                            }
                            saveData(savedData, path_users);
                        }

                        if (jsonMessage.RH === "CBC" && jsonMessage.PU === "GBU") {
                            if (jsonMessage.PY?.BUL) {
                                const bannedUsers = jsonMessage.PY.BUL;
                                bannedUserIds = Object.keys(bannedUsers);
                                if (check_ban_list) {
                                    sendMessage("Ban list fetched.");
                                    check_ban_list = false;
                                }
                            }
                        }

                        if (jsonMessage?.PU === "CJA" || jsonMessage?.PU === "REA") {
                            isProcessingBans = false;
                            const ulData = jsonMessage?.PY?.OUL;
                            const c_mics = jsonMessage.PY.MSI;
                            club_name = jsonMessage?.PY?.NM;
                            let m_index = 1;
                            c_mics.forEach(mc => {
                                if (mc.VCU === "" && mc.IL === false) {
                                    lockMic(m_index);
                                }
                                m_index++;
                            });

                            if (jsonMessage?.PY?.SAL && typeof jsonMessage.PY.SAL === 'object') {
                                clubAdmins = Object.keys(jsonMessage.PY.SAL);
                            }

                            if (jsonMessage?.PY?.AL && typeof jsonMessage.PY.AL === 'object') {
                                clubAdmins.push(...Object.keys(jsonMessage.PY.AL));
                            }

                            if (ulData) {
                                Object.values(ulData).forEach(user => {
                                    if (String(user.UID) !== my_uid) {
                                        const hasBannedPattern = botConfig.bannedPatterns.some(pattern =>
                                            String(user.NM).includes(pattern)
                                        );

                                        if (hasBannedPattern) {
                                            applyPunishment(user.UID, 'bannedPatterns');
                                            botState.stats.usersKicked++;
                                        }
                                        // else {
                                        //     checkLevel(user.UID);
                                        // }
                                    }
                                });
                            }
                        }

                        if (String(jsonMessage.PY.MG).toLowerCase().startsWith(String(botConfig.botConfiguration?.botName).toLowerCase())) {
                            const user_id = findPlayerID(jsonMessage.PY.UID);
                            try {
                                const refinedMessage = removeBotName(String(jsonMessage.PY.MG).toLowerCase());
                                const tempMsg = await getResponse(refinedMessage, jsonMessage.PY.UID);
                                const messageChunks = splitMessage(tempMsg, 150);

                                if (messageChunks.length > 0) {
                                    sendMessage(messageChunks[0]);

                                    for (let i = 1; i < messageChunks.length; i++) {
                                        setTimeout(() => {
                                            sendMessage(messageChunks[i]);
                                        }, i * 100);
                                    }
                                }
                            } catch (err) { }
                        }

                        else if (jsonMessage.RH === "CBC" && jsonMessage.PU === "SMI") {
                            joinMic();
                        }

                        else if (jsonMessage.RH === "CBC" && jsonMessage.PU === "TMS") {
                            const target_uid = jsonMessage.PY.UID;
                            if (target_uid === my_uid) {
                                botMic = Number(jsonMessage.PY.IN);
                            }
                        }

                        if (jsonMessage.PY && jsonMessage.PY.MG) {
                            let message = jsonMessage.PY.MG;
                            let UID = jsonMessage.PY.UID;

                            const user_name = findPlayerName(UID);
                            const user_id = findPlayerID(UID);

                            if (user_id && savedData[user_id]) {
                                savedData[user_id].lastSeen = new Date().toISOString();
                                saveData(savedData, path_users);
                            }

                            addMessage(`${user_name}: ${message}`);

                            // Bot commands handling
                            if (String(message).startsWith("/mic")) {
                                let UID = jsonMessage.PY.UID;
                                const user_mic_id = findPlayerID(UID);
                                if (isMemberUID(UID)) {
                                    inviteMic(UID);
                                } else if (user_mic_id && botConfig.loyal_members?.includes(user_mic_id)) {
                                    inviteMic(UID);
                                }
                            }

                            if (String(message).startsWith("/admins")) {
                                if (botConfig.admins && botConfig.admins.length > 0) {
                                    botConfig.admins.forEach((admin, index) => {
                                        setTimeout(() => {
                                            const admin_name = getName(admin);
                                            sendMessage(`Admin ${index + 1}: ${admin_name} [${admin}]`);
                                        }, index * 100);
                                    });
                                } else {
                                    sendMessage('No admins configured');
                                }
                            }

                            else if (String(message).startsWith("/spam")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    const spam_word = String(message).split(" ")[1];
                                    botConfig.spamWords.push(spam_word);
                                    sendMessage(`Added!`);
                                    addSpamWord(spam_word);
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/seen")) {
                                try {
                                    const player_id = String(message).replace(/^\/seen\s*/, '').trim().toUpperCase();

                                    if (!player_id) {
                                        sendMessage("Usage: /seen [PLAYER_ID]");
                                        return;
                                    }

                                    if (!savedData[player_id]) {
                                        sendMessage(`❌ No data found for player ID: ${player_id}`);
                                        return;
                                    }

                                    const userData = savedData[player_id];
                                    const userName = userData.NM;
                                    const lastSeen = userData.lastSeen;

                                    if (!lastSeen) {
                                        sendMessage(`👤 ${userName} [${player_id}] - No last seen data available`);
                                        return;
                                    }

                                    const lastSeenDate = new Date(lastSeen);
                                    const now = new Date();
                                    const diffMs = now - lastSeenDate;
                                    const diffSeconds = Math.floor(diffMs / 1000);
                                    const diffMinutes = Math.floor(diffSeconds / 60);
                                    const diffHours = Math.floor(diffMinutes / 60);
                                    const diffDays = Math.floor(diffHours / 24);

                                    let timeAgo;
                                    if (diffSeconds < 60) {
                                        timeAgo = `${diffSeconds} second${diffSeconds !== 1 ? 's' : ''} ago`;
                                    } else if (diffMinutes < 60) {
                                        timeAgo = `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
                                    } else if (diffHours < 24) {
                                        timeAgo = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                                    } else {
                                        timeAgo = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
                                    }

                                    const formattedDate = lastSeenDate.toLocaleString('en-PK', {
                                        timeZone: 'Asia/Karachi',
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });

                                    sendMessage(`${timeAgo} (📅 ${formattedDate}) [👤 ${userName}]`);

                                } catch (err) {
                                    console.error('Error in /seen command:', err);
                                    sendMessage("❌ Error retrieving user data");
                                }
                            }

                            else if (String(message).startsWith("/whois")) {
                                const player_id = String(message).replace(/^\/whois\s*/, '');
                                const names = getNames(player_id.toUpperCase());
                                sendMessage(names);
                            }

                            else if (String(message).startsWith("/ulm")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);

                                try {
                                    const [command, mic] = String(message).split(" ");

                                    if (!botConfig.admins.includes(user_id)) {
                                        sendMessage(`You are not eligible to use this command.`);
                                        return;
                                    }

                                    if (String(mic).toLowerCase() === "all") {
                                        for (let i = 1; i <= 10; i++) {
                                            unlockMic(i);
                                        }
                                        sendMessage(`All microphones (1-10) have been unlocked.`);
                                    } else {
                                        const micNumber = Number(mic);

                                        if (isNaN(micNumber) || micNumber < 1 || micNumber > 10) {
                                            sendMessage(`Invalid microphone number. Please specify 1-10 or "all".`);
                                        } else {
                                            unlockMic(micNumber);
                                            sendMessage(`Microphone ${micNumber} has been unlocked.`);
                                        }
                                    }
                                } catch (err) {
                                    sendMessage("Please use the command in format '/ulm [mic_number]' or '/ulm all'");
                                }
                            }

                            else if (String(message).startsWith("/cn")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    exitclub();
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                    changeName(String(message).replace(/^\/cn\s*/, ''));
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                    joinClub(`${club_code}`);
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/say")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    sendMessage(String(message).replace(/^\/say\s*/, ''));
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/refresh")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    refresh();
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/ma")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    const u_id = String(message).replace(/^\/ma\s*/, '');
                                    makeAdmin(u_id);
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/rma")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    const u_id = String(message).replace(/^\/rma\s*/, '');
                                    removeAdmin(u_id);
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/iv")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);

                                try {
                                    if (botConfig.admins.includes(user_id)) {
                                        if (allowInvites) {
                                            const usage = await loadIcicUsage();

                                            if (usage.lastUsed && isToday(usage.lastUsed)) {
                                                const timeRemaining = getTimeUntilMidnight();
                                                const lastUser = usage.usedBy ? getName(usage.usedBy) : 'Unknown';

                                                sendMessage(`⏰ /iv has already been used today by ${lastUser}.`);
                                                setTimeout(() => {
                                                    sendMessage(`Try again in ${timeRemaining}.`);
                                                }, 100);

                                                logger.info(`/iv command blocked - already used today by ${usage.usedBy}`);
                                            } else {
                                                const updated = await updateIcicUsage(user_id);

                                                if (updated) {
                                                    clubInvite();
                                                    sendMessage(`✅ Club invites sent! (Daily limit: 1/1 used)`);
                                                    logger.info(`/iv command executed by ${user_id} - daily usage recorded`);
                                                } else {
                                                    sendMessage(`❌ Failed to update usage tracking. Try again.`);
                                                }
                                            }
                                        } else {
                                            sendMessage(`You cannot use this command currently.`);
                                        }
                                    } else {
                                        sendMessage(`You are not eligible to use this command.`);
                                    }
                                } catch (err) {
                                    logger.error('Error in /iv command:', err);
                                    sendMessage("Error processing command. Please try again.");
                                }
                            }

                            else if (String(message).startsWith("/imem")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                try {
                                    if (botConfig.admins.includes(user_id)) {
                                        if (allowInvites) {
                                            memberInvite();
                                        } else {
                                            sendMessage(`You cannot use this command currently.`);
                                        }
                                    } else {
                                        sendMessage(`You are not eligible to use this command.`);
                                    }
                                } catch (err) {
                                    sendMessage("Please use the command in format '/lm [mic_number]'");
                                }
                            }

                            else if (String(message).startsWith("/move")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                const [command, move_code] = String(message).split(" ");
                                if (botConfig.admins.includes(user_id) && moveable_clubs.includes(move_code)) {
                                    exitclub();
                                    joinClub(move_code);
                                } else if (!moveable_clubs.includes(move_code)) {
                                    sendMessage(`This club is not authorized for me to join.`);
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/rejoin")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    exitclub();
                                    joinClub(club_code);
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/ub")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    const args = String(message).trim().split(/\s+/);

                                    if (args[1] === "all") {
                                        for (const userId of bannedUserIds) {
                                            unbanUser(userId);
                                            await sleep(100);
                                        }
                                    } else if (args[1] === "check") {
                                        checkBannedUsers();
                                        check_ban_list = true;
                                    } else if (args[1]) {
                                        const player_id = String(message).replace(/^\/ub\s*/, '');
                                        unbanID(player_id.toUpperCase());
                                    } else {
                                        sendMessage(`Usage: /ub <userId> | /ub all | /ub check`);
                                    }
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/joinMic")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);
                                if (botConfig.admins.includes(user_id)) {
                                    joinAdminMic();
                                } else {
                                    sendMessage(`You are not eligible to use this command.`);
                                }
                            }

                            else if (String(message).startsWith("/lm")) {
                                const user_id = findPlayerID(jsonMessage.PY.UID);

                                try {
                                    const [command, mic] = String(message).split(" ");

                                    if (!botConfig.admins.includes(user_id)) {
                                        sendMessage(`You are not eligible to use this command.`);
                                        return;
                                    }

                                    if (String(mic).toLowerCase() === "all") {
                                        for (let i = 1; i <= 10; i++) {
                                            lockMic(i);
                                        }
                                        sendMessage(`All microphones (1-10) have been locked.`);
                                    } else {
                                        const micNumber = Number(mic);

                                        if (isNaN(micNumber) || micNumber < 1 || micNumber > 10) {
                                            sendMessage(`Invalid microphone number. Please specify 1-10 or "all".`);
                                        } else {
                                            lockMic(micNumber);
                                            sendMessage(`Microphone ${micNumber} has been locked.`);
                                        }
                                    }
                                } catch (err) {
                                    sendMessage("Please use the command in format '/lm [mic_number]' or '/lm all'");
                                }
                            }

                            else if (botConfig.spamWords.some(word => String(message).toLowerCase().includes(word))) {
                                applyPunishment(UID, 'spamWords');
                                deleteMsg(jsonMessage.PY.MID);
                                botState.stats.spamBlocked++;
                            }
                        }

                        else if (jsonMessage.PY && jsonMessage.PY.TY) {
                            const micIndex = Number(jsonMessage.PY.IN);
                            const newUID = jsonMessage.PY.UID;

                            if (micIndex >= 0) {
                                for (let i = 0; i < mics.length; i++) {
                                    if (mics[i] === newUID) {
                                        mics[i] = null;
                                    }
                                }
                                mics[micIndex] = newUID;
                            }
                        }

                        else if (jsonMessage.PY && !jsonMessage.PY.TY) {
                            const micIndex = Number(jsonMessage.PY.IN);
                            mics[micIndex] = null;
                        }
                    }
                } catch (err) {
                    console.log(err);
                }
            });

            ws.on('error', async (err) => {
                console.error('❌ WebSocket error:', err.message);
                await logSocketStatus('error', err.message);
            });

            ws.on('close', async (code, reason) => {
                console.log(`Socket closed at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })} - Code: ${code}, Reason: ${reason}`);
                await logSocketStatus('disconnected', reason ? reason.toString() : 'Socket closed normally');

                botState.connected = false;
                botState.ws = null;
            });

            // Bot functions
            async function sendMessage(tempMsg) {
                sendWebSocketMessage(JSON.stringify({
                    RH: "CBC",
                    PU: "CM",
                    PY: JSON.stringify({
                        CID: `${club_code}`,
                        MG: `${tempMsg}`
                    }),
                    SQ: null,
                    EN: false
                }));
            }

            function refresh() {
                if (inClub) {
                    sendWebSocketMessage(JSON.stringify({
                        RH: "CBC",
                        PU: "RE",
                        PY: JSON.stringify({ CID: `${club_code}` })
                    }));
                    messageQueue.resetSequence();
                }
            }

            function inviteMic(UID) {
                sendWebSocketMessage(JSON.stringify({
                    RH: "CBC",
                    PU: "SMI",
                    SQ: null,
                    PY: JSON.stringify({
                        UID: `${UID}`
                    })
                }));
            }

            function lockMic(num) {
                sendWebSocketMessage(JSON.stringify({
                    RH: "CBC",
                    PU: "TMS",
                    SQ: null,
                    PY: JSON.stringify({
                        LS: true,
                        LM: true,
                        MN: num
                    })
                }));
            }

            function unlockMic(num) {
                sendWebSocketMessage(JSON.stringify({
                    RH: "CBC",
                    PU: "TMS",
                    SQ: null,
                    PY: JSON.stringify({
                        LS: false,
                        LM: true,
                        MN: num
                    })
                }));
            }

            async function clubInvite() {
                const people = await loadPlayers();
                const invitePromises = people.map(user =>
                    sendWebSocketMessageAsync(JSON.stringify({
                        RH: "CBC",
                        PU: "IV",
                        PY: JSON.stringify({
                            CI: `${club_code}`,
                            AP: true,
                            CN: `${club_name}`,
                            snuid: `${user}`
                        })
                    })).catch(error => {
                        console.error(`Failed to invite user ${user}:`, error);
                    })
                );

                Promise.allSettled(invitePromises).then(results => {
                    logger.info('All invites processed:', results);
                });
            }

            async function memberInvite() {
                try {
                    const filePath = path.join(__dirname, MEMBERS_FILE);
                    const fileContent = await fs.readFile(filePath, 'utf8');
                    const club_members = JSON.parse(fileContent);

                    const invitePromises = club_members.map(user =>
                        sendWebSocketMessageAsync(JSON.stringify({
                            RH: "CBC",
                            PU: "IV",
                            PY: JSON.stringify({
                                CI: `${club_code}`,
                                AP: true,
                                CN: `${club_name}`,
                                snuid: `${user.SNUID}`
                            })
                        })).catch(error => {
                            console.error(`Failed to invite user ${user.SNUID}:`, error);
                        })
                    );

                    const results = await Promise.allSettled(invitePromises);
                    logger.info('All invites processed:', results);

                    return results;
                } catch (error) {
                    logger.error('Error in memberInvite:', error);
                    throw error;
                }
            }

            function checkLevel(UID) {
                sendWebSocketMessage(JSON.stringify({
                    "RH": "CBC",
                    "PU": "GCP",
                    "PY": JSON.stringify({
                        "S": false,
                        "UID": `${UID}`
                    })
                }));
            }

            function banUser(UID) {
                if (!clubAdmins.includes(String(UID)) && !pendingBans.includes(UID)) {
                    pendingBans.push(UID);
                    logger.info(`➕ Added UID to ban queue: ${UID}`);
                }
            }

            function executeBan(UID) {
                if (!clubAdmins.includes(String(UID))) {
                    sendWebSocketMessage(JSON.stringify({
                        RH: "CBC",
                        PU: "KBU",
                        PY: JSON.stringify({
                            B: true,
                            CID: `${club_code}`,
                            UID: `${UID}`,
                            R: 3,
                            OTH: ""
                        })
                    }));
                    logger.info(`🔨 Executed ban for UID: ${UID}`);
                }
            }

            function removeMember(uid) {
                const message = JSON.stringify({
                    "RH": "CBC",
                    "PU": "CME",
                    "PY": JSON.stringify({
                        "CID": `${club_code}`,
                        "UID": `${uid}`
                    })
                });

                sendWebSocketMessage(message);
            }

            function fetchClubMembers() {
                sendWebSocketMessage(JSON.stringify({
                    RH: "CBC",
                    PU: "GML",
                    PY: JSON.stringify({
                        "CNT": 800,
                        "CID": `${club_code}`,
                        "PN": 1
                    })
                }));
            }

            function applyPunishment(UID, violationType) {
                const punishmentType = botConfig.settings?.punishments?.[violationType] || 'ban';

                if (punishmentType === 'kick') {
                    kickUser(UID);
                    logger.info(`👢 Kicking user ${UID} for: ${violationType}`);
                } else {
                    banUser(UID);
                    logger.info(`🔨 Banning user ${UID} for: ${violationType}`);
                }
            }

            function unbanID(GC) {
                if (!savedData[GC]) {
                    return `No data found for GC: ${GC}`;
                }
                unbanUser(savedData[GC].UID);
            }

            function unbanUser(UID) {
                if (!clubAdmins.includes(String(UID))) {
                    sendWebSocketMessage(JSON.stringify({
                        "RH": "CBC",
                        "PU": "UU",
                        "SQ": null,
                        "PY": JSON.stringify({
                            "CID": `${club_code}`,
                            "UID": `${UID}`
                        })
                    }));
                }
            }

            function kickUser(UID) {
                if (!clubAdmins.includes(String(UID)) && !pendingKicks.includes(UID)) {
                    pendingKicks.push(UID);
                    logger.info(`➕ Added UID to kick queue: ${UID}`);
                }
            }

            function executeKick(UID) {
                if (!clubAdmins.includes(String(UID))) {
                    sendWebSocketMessage(JSON.stringify({
                        RH: "CBC",
                        PU: "KBU",
                        PY: JSON.stringify({
                            B: false,
                            CID: `${club_code}`,
                            UID: `${UID}`,
                            R: 3,
                            OTH: ""
                        })
                    }));
                    logger.info(`👢 Executed kick for UID: ${UID}`);
                }
            }

            function deleteMsg(MID) {
                sendWebSocketMessage(JSON.stringify({
                    RH: "CBC",
                    PU: "DCM",
                    SQ: null,
                    PY: JSON.stringify({
                        MID: MID,
                        MTXT: "."
                    })
                }));
            }

            function joinMic() {
                const join_mic = JSON.stringify({
                    RH: "CBC",
                    PU: "TMS",
                    SQ: null,
                    PY: JSON.stringify({
                        TM: true,
                        RS: true
                    })
                });
                sendWebSocketMessageAsync(join_mic);
                onMic = true;
            }

            function joinAdminMic(mic = 1) {
                const join_mic = JSON.stringify({
                    RH: "CBC",
                    PU: "TMS",
                    SQ: null,
                    PY: JSON.stringify({
                        MN: mic,
                        TM: true
                    })
                });
                sendWebSocketMessage(join_mic);
                onMic = true;
            }

            function checkBannedUsers() {
                const fetchBanList = JSON.stringify({
                    "RH": "CBC",
                    "PU": "GBU",
                    "SQ": null,
                    "PY": JSON.stringify({
                        "CID": `${club_code}`,
                        "UID": `${my_uid}`
                    })
                });
                sendWebSocketMessage(fetchBanList);
            }

            function findUserToken(PID) {
                const target = String(PID).toUpperCase();
                for (const GC in savedData) {
                    if (String(GC) === target) {
                        return savedData[GC].UID;
                    }
                }
            }

            function removeAdmin(uid) {
                const user = findUserToken(uid);
                sendWebSocketMessage(JSON.stringify({
                    "RH": "CBC",
                    "PU": "MAD",
                    "PY": JSON.stringify({
                        "RT": 0,
                        "UID": `${user}`
                    })
                }));
            }

            function makeAdmin(uid) {
                const user = findUserToken(uid);
                sendWebSocketMessage(JSON.stringify({
                    "RH": "CBC",
                    "PU": "MAD",
                    "SQ": null,
                    "PY": JSON.stringify({
                        "RT": 1,
                        "UID": `${user}`
                    })
                }));
            }

            function joinClub(code) {
                sendWebSocketMessage(JSON.stringify({
                    "RH": "CBC",
                    "PU": "CJ",
                    "PY": JSON.stringify({
                        "IDX": "2",
                        "CID": `${code}`,
                        "PI": {
                            "GA": false,
                            "NM": "␞Eʟɪᴊᴀʜ Rᴇx✯",
                            "XP": 0,
                            "AD": "15",
                            "ABI": "",
                            "CV": 282,
                            "WS": 0,
                            "PT": 3,
                            "LV": 1,
                            "snuid": "",
                            "GC": "RALA7327",
                            "PBI": "",
                            "VT": 0,
                            "TID": 0,
                            "SEI": {},
                            "UI": "059e8cac2d33fbe79f03d0512d1cac6fd31ebcadb9ccab245409a7e538f61ae8d2881e06f48fe0de",
                            "AF": "",
                            "LVT": 0,
                            "AV": "122097423098939491",
                            "CLR": [],
                            "SLBR": 0,
                            "LLC": "PK"
                        },
                        "JTY": "16",
                        "CF": 0
                    })
                }));
                messageQueue.resetSequence();

                onMic = false;
                inClub = true;
                setTimeout(() => {
                    fetchClubMembers();
                }, 500);
            }

            function changeName(name) {
                const changeName = `{"RH":"us","PU":"EP","PY":"{\\"UN\\":\\"${name}\\"}"}`;
                sendWebSocketMessage(changeName);
            }

            function exitclub() {
                sendWebSocketMessage(JSON.stringify({
                    RH: "CBC",
                    PU: "LC",
                    PY: JSON.stringify({
                        IDX: `${index_idx - 1}`,
                        TY: 0
                    })
                }));
                inClub = false;
            }

            async function sendWebSocketMessageAsync(message) {
                try {
                    await messageQueue.enqueue(message);
                } catch (error) {
                    throw error;
                }
            }

            function sendWebSocketMessage(message) {
                return messageQueue.enqueue(message);
            }

        } catch (error) {
            console.error('❌ WebSocket connection error:', error);
            reject(error);
        }
    });
}

// Start Express server
app.listen(PORT, async () => {
    logger.info(`🚀 Bot ${botConfig.botConfiguration?.botName} API server running on port ${PORT}`);
    logger.info(`📱 Dashboard available at http://localhost:${PORT}`);

    await initializeBot();
});