const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const mysql = require('mysql2/promise');
const WebSocket = require('ws');

require('dotenv').config();

const logger = {
    info: (message) => console.log(`[INFO] ${message}`),
    error: (message) => console.error(`[ERROR] ${message}`),
    warn: (message) => console.warn(`[WARN] ${message}`)
};

const MYSQL_CONFIG = {
    host: process.env.MYSQL_HOST || '94.72.106.77',
    user: process.env.MYSQL_USER || 'ryzon',
    password: process.env.MYSQL_PASSWORD || 'zain0980',
    database: 'ivex',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

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
let pendingVCRequest = null;
let currentSequence = 2;
let index_idx = 1;
let onMic = false;
let currentClubCode = null;
let refreshIntervalId = null;

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

(async () => {
    if (!bot_ep || !bot_key) {
        const tokenPath = path.resolve('token.txt');

        try {
            await fs.access(tokenPath);
            const base64data = (await fs.readFile(tokenPath, 'utf-8')).trim();
            const decoded = Buffer.from(base64data, 'base64').toString('utf-8');
            const outer = JSON.parse(decoded);
            const pyData = JSON.parse(outer.PY);

            bot_ep = pyData.EP;
            bot_key = pyData.KEY;

            const envPath = path.resolve('.env');
            let envContent = '';
            try {
                envContent = await fs.readFile(envPath, 'utf-8');
            } catch {}

            const newLines = [];
            if (!envContent.includes('EP=')) newLines.push(`EP=${bot_ep}`);
            if (!envContent.includes('KEY=')) newLines.push(`KEY=${bot_key}`);

            if (newLines.length > 0) {
                await fs.appendFile(envPath, '\n' + newLines.join('\n'));
                console.log('Added EP and KEY to .env');
            }

            process.env.EP = bot_ep;
            process.env.KEY = bot_key;

        } catch (err) {
            console.error('Failed to decode token.txt or update env:', err);
        }
    }

    console.log('Club Code:', club_code);
    console.log('Club Name:', club_name);
    console.log('BOT UID:', my_uid);
    console.log('Endpoint:', bot_ep);
    console.log('Key:', bot_key);
    console.log('Port:', PORT);
})();

async function initializeMySQL() {
    let retries = 3;
    let lastError;

    while (retries > 0) {
        try {
            mysqlPool = mysql.createPool(MYSQL_CONFIG);
            const connection = await mysqlPool.getConnection();
            logger.info(`MySQL connected successfully to ${MYSQL_CONFIG.host}`);

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
            logger.info('Socket status tables ready');
            return;

        } catch (error) {
            lastError = error;
            retries--;
            logger.error(`MySQL connection attempt failed (${3 - retries}/3):`, error.message);

            if (retries > 0) {
                logger.info(`Retrying in 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    logger.error('MySQL initialization failed after 3 attempts:', lastError?.message);
    logger.warn('Bot will continue without MySQL logging');
    mysqlPool = null;
}

async function logSocketStatus(status, message = null) {
    if (!mysqlPool) {
        logger.warn('MySQL pool not available, skipping status log');
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

        logger.info(`Socket status updated: ${status} for club "${name}" (${code})`);
    } catch (error) {
        logger.error('Failed to log socket status:', error.message);
    }
}

function isNotEmptyJson(obj) {
    return obj && typeof obj === 'object' && Object.keys(obj).length > 0;
}

app.get('/api/jack/get-token', async (req, res) => {
    try {
        const tokenPath = path.join(__dirname, 'token.txt');
        const tokenContent = await fs.readFile(tokenPath, 'utf8');
        res.json({ success: true, token: tokenContent.trim() });
    } catch (error) {
        res.json({ success: false, message: 'Token file not found' });
    }
});

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
            return res.json({ success: false, message: 'Token is required' });
        }

        logger.info('Token update requested');

        await fs.writeFile('token.txt', token, 'utf8');
        logger.info('token.txt updated');

        try {
            const envPath = '.env';
            const envContent = await fs.readFile(envPath, 'utf8');
            const lines = envContent.split('\n');
            const filteredLines = lines.filter(line => {
                const trimmed = line.trim();
                return !trimmed.startsWith('EP=') && !trimmed.startsWith('KEY=');
            });
            await fs.writeFile(envPath, filteredLines.join('\n'), 'utf8');
            logger.info('EP and KEY removed from .env file');
        } catch (envError) {
            logger.warn('Could not update .env file:', envError.message);
        }

        delete process.env.EP;
        delete process.env.KEY;
        bot_ep = undefined;
        bot_key = undefined;
        logger.info('EP and KEY removed from environment');

        res.json({ success: true, message: 'Token updated. Restarting...' });

        setTimeout(() => {
            logger.info('Executing process.exit(0) for PM2 restart');
            process.exit(0);
        }, 1000);

    } catch (error) {
        logger.error('Error updating token:', error.message);
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

app.post('/api/jack/authenticate', async (req, res) => {
    try {
        const { authData } = req.body;

        if (!authData) {
            return res.json({ success: false, message: 'Authentication data is required' });
        }

        if (!authSocket) {
            return res.json({ success: false, message: 'No authentication pending' });
        }

        try {
            const decoded = Buffer.from(authData, 'base64').toString('utf-8');
            JSON.parse(decoded);
        } catch (err) {
            return res.json({ success: false, message: 'Invalid authentication data format' });
        }

        authSocket.send(authData);
        console.log(authData);

        authRequired = false;
        authSocket = null;
        authMessage = null;

        logger.info('Authentication credentials submitted');

        res.json({ success: true, message: 'Authentication submitted successfully' });

    } catch (error) {
        logger.error('Error during authentication:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/jack/fetch-vc-credentials', async (req, res) => {
    try {
        const code = req.body?.code;

        if (!code) {
            return res.json({ success: false, message: 'Club code is required' });
        }

        logger.info(`Fetching VC credentials for club: ${code}`);

        const vcPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingVCRequest = null;
                reject(new Error('Timeout waiting for VC credentials'));
            }, 15000);

            pendingVCRequest = {
                resolve: (credentials) => {
                    clearTimeout(timeout);
                    pendingVCRequest = null;
                    resolve(credentials);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    pendingVCRequest = null;
                    reject(error);
                },
                targetClub: code
            };
        });

        botState.ws.send(Buffer.from(JSON.stringify({
            RH: "CBC",
            PU: "LC",
            PY: JSON.stringify({ IDX: "1", TY: 0 })
        })).toString('base64'));

        inClub = false;

        await new Promise(resolve => setTimeout(resolve, 1000));

        botState.ws.send(Buffer.from(JSON.stringify({
            "RH": "CBC",
            "PU": "CJ",
            "PY": JSON.stringify({
                "IDX": "2",
                "CID": `${code}`,
                "PI": { "GA": false, "NM": "Bot", "XP": 0, "UID": my_uid }
            }),
            "SQ": null,
            "EN": false
        })).toString('base64'));

        const credentials = await vcPromise;

        logger.info(`Got VC credentials for club ${code}`);

        res.json({
            success: true,
            message: 'VC credentials fetched successfully',
            credentials: credentials
        });

        await new Promise(resolve => setTimeout(resolve, 20000));

        botState.ws.send(Buffer.from(JSON.stringify({
            RH: "CBC",
            PU: "LC",
            PY: JSON.stringify({ IDX: "1", TY: 0 })
        })).toString('base64'));

        inClub = false;

        await new Promise(resolve => setTimeout(resolve, 1000));

        botState.ws.send(Buffer.from(JSON.stringify({
            "RH": "CBC",
            "PU": "CJ",
            "PY": JSON.stringify({
                "IDX": "2",
                "CID": `${club_code}`,
                "PI": { "GA": false, "NM": "Bot", "XP": 0, "UID": my_uid }
            }),
            "SQ": null,
            "EN": false
        })).toString('base64'));

        logger.info(`Rejoined default club ${club_code}`);

    } catch (error) {
        logger.error('Error fetching VC credentials:', error.message);

        try {
            if (botState.ws && botState.connected) {
                botState.ws.send(Buffer.from(JSON.stringify({
                    "RH": "CBC",
                    "PU": "CJ",
                    "PY": JSON.stringify({
                        "IDX": "2",
                        "CID": `${club_code}`,
                        "PI": { "GA": false, "NM": "Bot", "XP": 0, "UID": my_uid }
                    }),
                    "SQ": null,
                    "EN": false
                })).toString('base64'));
            }
        } catch (e) {
            logger.error('Failed to rejoin default club:', e.message);
        }

        res.json({ success: false, message: error.message });
    }
});

app.post('/api/jack/restart', async (req, res) => {
    try {
        logger.info('Bot restart requested from dashboard');

        res.json({ success: true, message: 'Bot restart initiated - PM2 will handle the restart' });

        setTimeout(() => {
            logger.info('Executing process.exit(0) for PM2 restart');
            process.exit(0);
        }, 1000);

    } catch (error) {
        logger.error('Error during restart:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/jack/connect', async (req, res) => {
    try {
        if (botState.connected || botState.connecting) {
            return res.json({ success: false, message: 'Bot is already connected or connecting' });
        }

        logger.info('Bot connection requested from dashboard');

        botState.connecting = true;
        botState.startTime = Date.now();

        const connected = await connectWebSocket();

        if (connected) {
            botState.connected = true;
            botState.connecting = false;
            logger.info('Bot connected successfully');
            res.json({
                success: true,
                message: 'Bot connected successfully',
                clubCode: botState.clubCode,
                clubName: botState.clubName
            });
        } else {
            botState.connecting = false;
            res.json({ success: false, message: 'Failed to connect to WebSocket' });
        }

    } catch (error) {
        botState.connecting = false;
        logger.error('Error connecting bot:', error.message);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/jack/disconnect', async (req, res) => {
    try {
        if (!botState.connected) {
            return res.json({ success: false, message: 'Bot is not connected' });
        }

        logger.info('Bot disconnection requested from dashboard');

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

        logger.info('Bot disconnected');
        res.json({ success: true, message: 'Bot disconnected successfully' });

    } catch (error) {
        logger.error('Error disconnecting bot:', error.message);
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
        stats: botState.stats
    });
});

function getNextSequence() {
    return currentSequence++;
}

function resetSequence() {
    currentSequence = 2;
}

function exitclub() {
    sendWebSocketMessage(JSON.stringify({
        RH: "CBC",
        PU: "LC",
        PY: JSON.stringify({ IDX: `${index_idx - 1}`, TY: 0 })
    }));
    inClub = false;
}

function sendWebSocketMessage(message) {
    if (!botState.ws || botState.ws.readyState !== WebSocket.OPEN) {
        logger.error("WebSocket is not open");
        return;
    }

    try {
        let parsedMessage;
        let needsSequence = false;

        try {
            parsedMessage = JSON.parse(message);
            needsSequence = parsedMessage.hasOwnProperty('SQ');
        } catch {
            const base64Message = Buffer.from(message, 'utf8').toString('base64');
            botState.ws.send(base64Message);
            return;
        }

        if (needsSequence) {
            parsedMessage.SQ = getNextSequence();
        }

        const base64Message = Buffer.from(JSON.stringify(parsedMessage), 'utf8').toString('base64');
        botState.ws.send(base64Message);
        console.log(parsedMessage);
    } catch (error) {
        logger.error('Error sending WebSocket message:', error.message);
    }
}

async function connectWebSocket() {
    return new Promise((resolve, reject) => {
        try {
            const url = 'ws://ws.ls.superkinglabs.com/ws';
            const ws = new WebSocket(url);

            botState.ws = ws;

            ws.on('open', async () => {
                logger.info('WebSocket connection opened');
                logger.info('Bot Started.');

                const auth = JSON.stringify({
                    RH: "jo",
                    PU: "",
                    PY: JSON.stringify({ EP: `${bot_ep}`, KEY: `${bot_key}` }),
                    EN: true
                });

                sendWebSocketMessage(auth);
                console.log(`Authentication sent at ${new Date().toLocaleString()}`);
                await logSocketStatus('disconnected', 'Socket opened');

                resolve(true);
            });

            ws.on('message', async (data) => {
                try {
                    const messageString = data.toString();
                    let jsonMessage;

                    try {
                        if (/^[A-Za-z0-9+/]+=*$/.test(messageString.trim())) {
                            const decoded = Buffer.from(messageString, 'base64').toString('utf-8');
                            jsonMessage = JSON.parse(decoded);
                        } else {
                            jsonMessage = JSON.parse(messageString);
                        }
                    } catch (parseErr) {
                        logger.error('Failed to parse message:', parseErr.message);
                        return;
                    }

                    console.log(`${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}:`, jsonMessage);

                    if (jsonMessage?.PY?.hasOwnProperty('IA')) {
                        console.log('\nAuthentication Required');
                        logger.info('Authentication required - waiting for frontend input');
                        authRequired = true;
                        authSocket = ws;
                        authMessage = messageString;
                    }

                    if (jsonMessage?.RH === "AUA") {
                        console.log(`Bot connected at ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);
                        await logSocketStatus('connected', 'WebSocket connection established');

                        joinClub(club_code);
                    }

                    if (jsonMessage?.PY?.hasOwnProperty('ER') &&
                        (jsonMessage.PY?.ER === "DISCONNECTED" || jsonMessage.PY?.ER === "disconnected")) {
                        process.exit(0);
                    }

                    botState.stats.messagesProcessed++;

                    if (isNotEmptyJson(jsonMessage)) {
                        if (jsonMessage?.PU === "CJA" || jsonMessage?.PU === "REA") {
                            const agora_channel = jsonMessage.PY?.VC?.VCH;
                            const agora_token = jsonMessage.PY?.VC?.AT;

                            if (pendingVCRequest && jsonMessage?.PU === "CJA") {
                                pendingVCRequest.resolve({
                                    channel: agora_channel,
                                    token: agora_token,
                                    clubName: jsonMessage?.PY?.NM || 'Unknown'
                                });
                            }

                            club_name = jsonMessage?.PY?.NM;
                        }
                    }
                } catch (err) {
                    console.log(err);
                }
            });

            ws.on('error', async (err) => {
                console.error('WebSocket error:', err.message);
                await logSocketStatus('error', err.message);
            });

            ws.on('close', async (code, reason) => {
                console.log(`Socket closed - Code: ${code}, Reason: ${reason}`);
                await logSocketStatus('disconnected', reason ? reason.toString() : 'Socket closed normally');

                botState.connected = false;
                botState.ws = null;
            });

            function refresh() {
                if (inClub && currentClubCode) {
                    sendWebSocketMessage(JSON.stringify({
                        RH: "CBC",
                        PU: "RE",
                        PY: JSON.stringify({ CID: `${currentClubCode}` })
                    }));
                    resetSequence();
                }
            }

            function startRefreshInterval() {
                if (refreshIntervalId) {
                    clearInterval(refreshIntervalId);
                }
                refreshIntervalId = setInterval(() => {
                    refresh();
                }, 25000);
            }

            function joinClub(code) {
                currentClubCode = code;
                
                sendWebSocketMessage(JSON.stringify({
                    "RH": "CBC",
                    "PU": "CJ",
                    "PY": JSON.stringify({
                        "IDX": "2",
                        "CID": `${code}`,
                        "PI": {
                            "GA": false,
                            "NM": "Elijah Rex",
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
                resetSequence();

                onMic = false;
                inClub = true;
                
                startRefreshInterval();
            }

        } catch (error) {
            console.error('WebSocket connection error:', error);
            reject(error);
        }
    });
}

async function initializeBot() {
    try {
        await initializeMySQL();
        logger.info('Bot initialization complete');
        connectWebSocket();
    } catch (error) {
        logger.error('Bot initialization failed:', error.message);
    }
}

app.listen(PORT, async () => {
    logger.info(`Bot API server running on port ${PORT}`);
    await initializeBot();
});
