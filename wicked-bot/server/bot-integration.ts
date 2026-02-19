import type { Express, Request, Response, NextFunction } from 'express';
import { promises as fs } from 'fs';
import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import axios from 'axios';
import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import WebSocket from 'ws';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import multer from 'multer';

// Load environment variables from root .env file (where bot.js is located)
// The wicked-bot server runs from wicked-bot/ directory, so we go up one level
const rootEnvPath = path.join(process.cwd(), '..', '.env');
dotenv.config({ path: rootEnvPath });

// Auth configuration - loaded from root .env file
const OWNER_ID = process.env.OWNER_ID;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const MODERATORS_FILE = path.join(process.cwd(), 'data', 'moderators.json');
const ACTIVITY_LOGS_FILE = path.join(process.cwd(), 'data', 'activity_logs.json');

// Agora configuration from root .env (for Stream page)
const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_CHANNEL = process.env.AGORA_CHANNEL;
const AGORA_TOKEN = process.env.AGORA_TOKEN;
const AGORA_USER_ID = process.env.AGORA_USER_ID;

// Music upload feature flag from root .env
const MUSIC_UPLOAD_ENABLED = process.env.MUSIC_UPLOAD_ENABLED === 'true';

// Bot control secret for WebSocket authentication
const BOT_CONTROL_SECRET = process.env.BOT_CONTROL_SECRET || 'rexsquad_stream_secret_2024';

// Bot.js WebSocket URL for receiving stream control events
const BOT_WS_URL = process.env.BOT_WS_URL || `wss://${(process.env.DASHBOARD_URL || '').replace(/^https?:\/\//, '')}/ws/stream-control`;

// Bot.js API URL for HTTP requests
const BOT_API_URL = process.env.BOT_API_URL || process.env.DASHBOARD_URL || '';

// Stream state for playback control (mirrors bot.js state)
const streamState = {
  status: 'stopped' as 'playing' | 'paused' | 'stopped',
  currentSongIndex: 0,
  timestamp: Date.now()
};

// SSE clients for real-time stream updates
const streamSSEClients = new Set<Response>();

// WebSocket connection to bot.js
let botWsConnection: WebSocket | null = null;
let botWsReconnectTimer: NodeJS.Timeout | null = null;

// Connect to bot.js WebSocket for stream control events
function connectToBotWebSocket() {
  if (botWsConnection && botWsConnection.readyState === WebSocket.OPEN) {
    return;
  }

  logger.info(`📡 Connecting to bot.js WebSocket at ${BOT_WS_URL}...`);
  
  try {
    const wsUrl = `${BOT_WS_URL}?secret=${BOT_CONTROL_SECRET}`;
    botWsConnection = new WebSocket(wsUrl);

    botWsConnection.on('open', () => {
      logger.info('✅ Connected to bot.js WebSocket for stream control');
      if (botWsReconnectTimer) {
        clearTimeout(botWsReconnectTimer);
        botWsReconnectTimer = null;
      }
    });

    botWsConnection.on('message', (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString());
        logger.info(`📡 Received stream event from bot.js: ${event.action}`);
        
        // Update local stream state
        if (event.action === 'state' || event.action === 'play' || event.action === 'next') {
          if (event.songIndex !== undefined) {
            streamState.currentSongIndex = event.songIndex;
          }
          if (event.status) {
            streamState.status = event.status;
          } else if (event.action === 'play' || event.action === 'next') {
            streamState.status = 'playing';
          }
        } else if (event.action === 'pause') {
          streamState.status = 'paused';
        } else if (event.action === 'stop') {
          streamState.status = 'stopped';
        }
        
        if (event.timestamp) {
          streamState.timestamp = event.timestamp;
        }
        
        // Broadcast to SSE clients
        broadcastStreamEvent(event);
      } catch (err) {
        logger.error(`Failed to parse bot.js WebSocket message: ${err}`);
      }
    });

    botWsConnection.on('close', () => {
      logger.warn('📡 Bot.js WebSocket disconnected, will reconnect in 5s...');
      botWsConnection = null;
      scheduleReconnect();
    });

    botWsConnection.on('error', (err: Error) => {
      logger.error(`Bot.js WebSocket error: ${err.message}`);
    });
  } catch (err) {
    logger.error(`Failed to connect to bot.js WebSocket: ${err}`);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (botWsReconnectTimer) return;
  botWsReconnectTimer = setTimeout(() => {
    botWsReconnectTimer = null;
    connectToBotWebSocket();
  }, 5000);
}

// Broadcast stream event to all connected SSE clients
function broadcastStreamEvent(event: object) {
  const data = JSON.stringify(event);
  Array.from(streamSSEClients).forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (err) {
      streamSSEClients.delete(client);
    }
  });
  logger.info(`📡 Broadcast to ${streamSSEClients.size} SSE clients: ${JSON.stringify(event)}`);
}

// MySQL configuration for fetching bot status
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || '',
  user: process.env.MYSQL_USER || '',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || '',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

let mysqlPool: mysql.Pool | null = null;

// Initialize MySQL connection pool
async function initializeMySQL(): Promise<void> {
  try {
    mysqlPool = mysql.createPool(MYSQL_CONFIG);
    const connection = await mysqlPool.getConnection();
    logger.info(`✅ MySQL connected successfully to ${MYSQL_CONFIG.host}`);
    connection.release();
  } catch (error: any) {
    logger.error(`❌ MySQL connection failed: ${error.message}`);
    mysqlPool = null;
  }
}

// Fetch bot status from MySQL
async function fetchBotStatusFromDB(): Promise<{ connected: boolean; connecting: boolean; lastUpdate: string | null }> {
  if (!mysqlPool) {
    return { connected: false, connecting: false, lastUpdate: null };
  }

  try {
    const [rows] = await mysqlPool.query(
      'SELECT status, updated_at FROM socket_status WHERE club_code = ? ORDER BY updated_at DESC LIMIT 1',
      [club_code]
    ) as any;

    if (rows && rows.length > 0) {
      const row = rows[0];
      const isConnected = row.status === 'connected';
      logger.info(`📡 Bot status from MySQL: club_code=${club_code}, status=${row.status}, connected=${isConnected}`);
      return {
        connected: isConnected,
        connecting: false,
        lastUpdate: row.updated_at ? new Date(row.updated_at).toISOString() : null
      };
    }

    logger.info(`📡 No status found in MySQL for club_code=${club_code}`);
    return { connected: false, connecting: false, lastUpdate: null };
  } catch (error: any) {
    logger.error(`❌ Error fetching bot status from MySQL: ${error.message}`);
    return { connected: false, connecting: false, lastUpdate: null };
  }
}

// App ID for scoping sessions per domain (using CLUB_CODE as unique identifier)
const APP_ID = process.env.CLUB_CODE || 'default';

// Session helper functions (MySQL-backed for persistence across restarts)
// Sessions are scoped by app_id to prevent conflicts between multiple domains sharing the same table
async function getSession(token: string): Promise<{ userId: string; role: string; loginTime: string } | null> {
  if (!mysqlPool) return null;
  try {
    const [rows] = await mysqlPool.query(
      'SELECT user_id, role, login_time FROM dashboard_sessions WHERE token = ? AND app_id = ?',
      [token, APP_ID]
    ) as any;
    if (rows && rows.length > 0) {
      return {
        userId: rows[0].user_id,
        role: rows[0].role,
        loginTime: rows[0].login_time.toISOString()
      };
    }
    return null;
  } catch (error: any) {
    logger.error(`Error getting session from MySQL: ${error.message}`);
    return null;
  }
}

async function setSession(token: string, sessionData: { userId: string; role: string; loginTime: string }): Promise<boolean> {
  if (!mysqlPool) return false;
  try {
    await mysqlPool.query(
      'INSERT INTO dashboard_sessions (token, user_id, role, login_time, app_id) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), role = VALUES(role), login_time = VALUES(login_time)',
      [token, sessionData.userId, sessionData.role, new Date(sessionData.loginTime), APP_ID]
    );
    return true;
  } catch (error: any) {
    logger.error(`Error saving session to MySQL: ${error.message}`);
    return false;
  }
}

async function deleteSession(token: string): Promise<boolean> {
  if (!mysqlPool) return false;
  try {
    await mysqlPool.query('DELETE FROM dashboard_sessions WHERE token = ? AND app_id = ?', [token, APP_ID]);
    return true;
  } catch (error: any) {
    logger.error(`Error deleting session from MySQL: ${error.message}`);
    return false;
  }
}

async function deleteSessionsByUserId(userId: string): Promise<boolean> {
  if (!mysqlPool) return false;
  try {
    await mysqlPool.query('DELETE FROM dashboard_sessions WHERE user_id = ? AND app_id = ?', [userId, APP_ID]);
    return true;
  } catch (error: any) {
    logger.error(`Error deleting sessions by user ID from MySQL: ${error.message}`);
    return false;
  }
}

// Generate session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Load moderators from file
async function loadModerators(): Promise<any[]> {
  try {
    const data = await fs.readFile(MODERATORS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(MODERATORS_FILE, '[]', 'utf8');
      return [];
    }
    return [];
  }
}

// Save moderators to file
async function saveModerators(moderators: any[]): Promise<void> {
  await fs.writeFile(MODERATORS_FILE, JSON.stringify(moderators, null, 2), 'utf8');
}

// Load activity logs from file
async function loadActivityLogs(): Promise<any[]> {
  try {
    const data = await fs.readFile(ACTIVITY_LOGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(ACTIVITY_LOGS_FILE, '[]', 'utf8');
      return [];
    }
    return [];
  }
}

// Save activity logs to file
async function saveActivityLogs(logs: any[]): Promise<void> {
  await fs.writeFile(ACTIVITY_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
}

// Log activity
async function logActivity(userId: string, userRole: string, action: string, details: Record<string, unknown> = {}): Promise<void> {
  try {
    const logs = await loadActivityLogs();
    logs.unshift({
      id: crypto.randomUUID(),
      userId,
      userRole,
      action,
      details,
      timestamp: new Date().toISOString()
    });
    // Keep only last 500 logs
    if (logs.length > 500) {
      logs.length = 500;
    }
    await saveActivityLogs(logs);
  } catch (error) {
    logger.error('Error logging activity');
  }
}

// Extend Express Request type
interface AuthRequest extends Request {
  user?: { userId: string; role: string };
}

// Auth middleware
async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'No token provided' });
    return;
  }
  
  const token = authHeader.substring(7);
  const session = await getSession(token);
  
  if (!session) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
    return;
  }
  
  req.user = session;
  next();
}

// Owner only middleware
function ownerOnly(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'owner') {
    res.status(403).json({ success: false, message: 'Owner access required' });
    return;
  }
  next();
}

// Configuration
const club_code = process.env.CLUB_CODE || 'default';
const club_name = process.env.CLUB_NAME || 'Default Club';
const my_uid = process.env.BOT_UID || '';
const bot_ep = process.env.EP || '';
const bot_key = process.env.KEY || '';

// File paths
const DATA_DIR = path.join(process.cwd(), 'data');
const MEMBERS_FILE = path.join(DATA_DIR, 'club_members.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SPAM_FILE = path.join(DATA_DIR, 'spam.txt');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.txt');
const BANNED_PATTERNS_FILE = path.join(DATA_DIR, 'banned_patterns.txt');
const BOT_CONFIG_FILE = path.join(DATA_DIR, 'bot_configuration.json');
const MESSAGE_COUNTER_FILE = path.join(process.cwd(), '..', 'message_counter.json');

// Daily message counter state
interface MessageCounterData {
  count: number;
  date: string; // YYYY-MM-DD in Pakistani time
}

let messageCounter: MessageCounterData = {
  count: 0,
  date: ''
};

// Get current date in Pakistani time (UTC+5)
function getPakistaniDate(): string {
  const now = new Date();
  const pakistaniTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
  return pakistaniTime.toISOString().split('T')[0];
}

// Load message counter from file
async function loadMessageCounter(): Promise<void> {
  try {
    const data = await fs.readFile(MESSAGE_COUNTER_FILE, 'utf8');
    const parsed = JSON.parse(data);
    messageCounter = parsed;
    
    // Check if we need to reset (new day in Pakistani time)
    const currentDate = getPakistaniDate();
    if (messageCounter.date !== currentDate) {
      messageCounter = { count: 0, date: currentDate };
      await saveMessageCounter();
      logger.info(`📊 Message counter reset for new day: ${currentDate}`);
    } else {
      logger.info(`📊 Message counter loaded: ${messageCounter.count} messages today`);
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      messageCounter = { count: 0, date: getPakistaniDate() };
      await saveMessageCounter();
      logger.info('📊 Message counter initialized');
    }
  }
}

// Save message counter to file
async function saveMessageCounter(): Promise<void> {
  try {
    await fs.writeFile(MESSAGE_COUNTER_FILE, JSON.stringify(messageCounter, null, 2));
  } catch (error) {
    logger.error('Error saving message counter');
  }
}

// Increment message counter (with date check)
async function incrementMessageCounter(): Promise<void> {
  const currentDate = getPakistaniDate();
  
  // Reset if it's a new day
  if (messageCounter.date !== currentDate) {
    messageCounter = { count: 0, date: currentDate };
    logger.info(`📊 Message counter reset for new day: ${currentDate}`);
  }
  
  messageCounter.count++;
  await saveMessageCounter();
}

// Get current message count
function getMessageCount(): MessageCounterData {
  const currentDate = getPakistaniDate();
  
  // Return 0 if it's a new day (will be reset on next increment)
  if (messageCounter.date !== currentDate) {
    return { count: 0, date: currentDate };
  }
  
  return messageCounter;
}

// Bot state
let botState = {
  connected: false,
  connecting: false,
  socket: null as WebSocket | null,
  clubCode: club_code,
  clubName: club_name,
  startTime: null as number | null,
  stats: {
    messagesProcessed: 0,
    usersKicked: 0,
    spamBlocked: 0
  }
};

// Bot configuration
let botConfig = {
  admins: [] as string[],
  spamWords: [] as string[],
  bannedPatterns: [] as string[],
  settings: null as any,
  botConfiguration: null as any
};

// Game state
let secretNumber = Math.floor(Math.random() * 100) + 1;
let botMic = 0;
let index_idx = 1;
let sequence = 2;
let mics = new Array(10).fill(null);
let onMic = false;
let savedData: any = {};
let club_members: any[] = [];
let messageBuffer = '';
let typeWord: string | false = false;
let messageStorage = '';
let clubAdmins: string[] = [];
let pendingRemovals: string[] = [];
let bannedUserIds: string[] = [];
let check_ban_list = false;

// Session tracking - tracks when users join the club
const activeSessions: Map<string, number> = new Map();

// Time tracking data structure for members
interface MemberTimeData {
  totalSeconds: number;
  dailySeconds: number;
  weeklySeconds: number;
  monthlySeconds: number;
  lastDayReset: string;
  lastWeekReset: string;
  lastMonthReset: string;
}

// Get Pakistani time as Date object
function getPakistaniTime(): Date {
  const now = new Date();
  return new Date(now.getTime() + (5 * 60 * 60 * 1000));
}

// Get the last weekly reset time (Sunday 2:00 AM PKT)
function getLastWeeklyResetTime(): string {
  const pkt = getPakistaniTime();
  const dayOfWeek = pkt.getUTCDay(); // 0 = Sunday
  const hour = pkt.getUTCHours();
  
  // Calculate days since last Sunday
  let daysSinceLastSunday = dayOfWeek;
  
  // If it's Sunday but before 2:00 AM, the last reset was the previous Sunday
  if (dayOfWeek === 0 && hour < 2) {
    daysSinceLastSunday = 7;
  }
  
  // Create the last reset date (Sunday 2:00 AM PKT)
  const lastReset = new Date(pkt);
  lastReset.setUTCDate(lastReset.getUTCDate() - daysSinceLastSunday);
  lastReset.setUTCHours(2, 0, 0, 0);
  
  return lastReset.toISOString();
}

// Get the last monthly reset time (1st of month, 12:00 AM PKT)
function getLastMonthlyResetTime(): string {
  const pkt = getPakistaniTime();
  const dayOfMonth = pkt.getUTCDate();
  
  let year = pkt.getUTCFullYear();
  let month = pkt.getUTCMonth();
  
  // Create the last reset date (1st of month, 12:00 AM PKT = previous day 7:00 PM UTC)
  const lastReset = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  // Adjust for PKT (UTC+5) - midnight PKT is 7PM previous day UTC
  lastReset.setUTCHours(-5);
  
  return lastReset.toISOString();
}

// Get the last daily reset time (12:00 AM PKT)
function getLastDailyResetTime(): string {
  const pkt = getPakistaniTime();
  
  // Create today's midnight in PKT
  const lastReset = new Date(Date.UTC(
    pkt.getUTCFullYear(),
    pkt.getUTCMonth(),
    pkt.getUTCDate(),
    0, 0, 0, 0
  ));
  // Adjust for PKT (UTC+5) - midnight PKT is 7PM previous day UTC
  lastReset.setUTCHours(-5);
  
  return lastReset.toISOString();
}

// Get current day identifier for tracking (based on midnight PKT reset)
function getCurrentDay(): string {
  return getLastDailyResetTime();
}

// Get current week identifier for tracking (based on Sunday 2:00 AM PKT reset)
function getCurrentWeek(): string {
  return getLastWeeklyResetTime();
}

// Get current month identifier for tracking (based on 1st of month 2:00 AM PKT reset)
function getCurrentMonth(): string {
  return getLastMonthlyResetTime();
}

// Handle user joining the club
function handleUserJoin(uid: string): void {
  activeSessions.set(uid, Date.now());
  logger.info(`👋 User joined, tracking session: ${uid.substring(0, 16)}...`);
}

// Handle user leaving the club and update their time
async function handleUserLeave(uid: string): Promise<void> {
  const joinTime = activeSessions.get(uid);
  if (!joinTime) {
    logger.warn(`⚠️ No join time found for user: ${uid.substring(0, 16)}...`);
    return;
  }

  const sessionDuration = Math.floor((Date.now() - joinTime) / 1000);
  activeSessions.delete(uid);

  await updateMemberTime(uid, sessionDuration);
  logger.info(`👋 User left after ${formatDuration(sessionDuration)}: ${uid.substring(0, 16)}...`);
}

// Format seconds to human readable duration
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// Update member's time tracking data
async function updateMemberTime(uid: string, sessionSeconds: number): Promise<void> {
  try {
    const data = await fs.readFile(MEMBERS_FILE, 'utf8');
    const members = JSON.parse(data);
    
    const memberIndex = members.findIndex((m: any) => m.UID === uid);
    if (memberIndex === -1) {
      logger.warn(`⚠️ Member not found for time update: ${uid.substring(0, 16)}...`);
      return;
    }

    const member = members[memberIndex];
    const currentWeek = getCurrentWeek();
    const currentMonth = getCurrentMonth();

    // Initialize time tracking if not exists
    if (!member.timeTracking) {
      member.timeTracking = {
        totalSeconds: 0,
        weeklySeconds: 0,
        monthlySeconds: 0,
        lastWeekReset: currentWeek,
        lastMonthReset: currentMonth
      };
    }

    // Reset weekly if new week
    if (member.timeTracking.lastWeekReset !== currentWeek) {
      member.timeTracking.weeklySeconds = 0;
      member.timeTracking.lastWeekReset = currentWeek;
    }

    // Reset monthly if new month
    if (member.timeTracking.lastMonthReset !== currentMonth) {
      member.timeTracking.monthlySeconds = 0;
      member.timeTracking.lastMonthReset = currentMonth;
    }

    // Add session time
    member.timeTracking.totalSeconds += sessionSeconds;
    member.timeTracking.weeklySeconds += sessionSeconds;
    member.timeTracking.monthlySeconds += sessionSeconds;

    members[memberIndex] = member;
    await fs.writeFile(MEMBERS_FILE, JSON.stringify(members, null, 2));
    
    logger.info(`⏱️ Updated time for ${member.NM}: +${formatDuration(sessionSeconds)} (Weekly: ${formatDuration(member.timeTracking.weeklySeconds)}, Monthly: ${formatDuration(member.timeTracking.monthlySeconds)})`);
  } catch (error) {
    logger.error('Error updating member time');
  }
}

// Get member time statistics
function getMemberTimeStats(member: any): { weeklyHours: number; monthlyHours: number; totalHours: number } {
  const currentWeek = getCurrentWeek();
  const currentMonth = getCurrentMonth();
  
  if (!member.timeTracking) {
    return { weeklyHours: 0, monthlyHours: 0, totalHours: 0 };
  }

  let weeklySeconds = member.timeTracking.weeklySeconds || 0;
  let monthlySeconds = member.timeTracking.monthlySeconds || 0;
  const totalSeconds = member.timeTracking.totalSeconds || 0;

  // Check if we need to reset (for display purposes)
  if (member.timeTracking.lastWeekReset !== currentWeek) {
    weeklySeconds = 0;
  }
  if (member.timeTracking.lastMonthReset !== currentMonth) {
    monthlySeconds = 0;
  }

  return {
    weeklyHours: Math.round((weeklySeconds / 3600) * 100) / 100,
    monthlyHours: Math.round((monthlySeconds / 3600) * 100) / 100,
    totalHours: Math.round((totalSeconds / 3600) * 100) / 100
  };
}

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI || ''
});

// Conversation history for OpenAI
const conversationHistory = new Map();

// Logger
const logger = {
  info: (message: string) => console.log(`[BOT] ${message}`),
  error: (message: string) => console.error(`[BOT] ${message}`),
  warn: (message: string) => console.warn(`[BOT] ${message}`)
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function loadSettings() {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      const defaults = {
        allowAvatars: true,
        banLevel: 10,
        allowGuestIds: false,
        enableLevelBan: true,
        micCount: 10,
        createdAt: new Date().toISOString()
      };
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    throw error;
  }
}

async function loadConfigFromFile(type: string) {
  try {
    let filePath = '';
    if (type === 'settings') filePath = SETTINGS_FILE;
    else if (type === 'bot-config') filePath = BOT_CONFIG_FILE;
    else if (type === 'admins') filePath = ADMINS_FILE;
    else if (type === 'spam-words') filePath = SPAM_FILE;
    else if (type === 'banned-patterns') filePath = BANNED_PATTERNS_FILE;
    else return null;

    const data = await fs.readFile(filePath, 'utf8');
    
    if (type === 'settings' || type === 'bot-config') {
      return JSON.parse(data);
    } else {
      if (type === 'spam-words') {
        return data.split('\n').filter(line => line.trim() !== '');
      } else {
        return data.split(',').map(item => item.trim()).filter(item => item !== '');
      }
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.warn(`Config file not found: ${type}`);
      return null;
    }
    logger.error(`Error loading config ${type}: ${error.message}`);
    return null;
  }
}

async function loadAllConfigurations() {
  try {
    const settings = await loadConfigFromFile('settings');
    if (settings) {
      botConfig.settings = settings;
      logger.info(`⚙️ Settings loaded: Avatars: ${settings.allowAvatars}, Ban Level: ${settings.banLevel}`);
    } else {
      botConfig.settings = {
        allowAvatars: true,
        banLevel: 10,
        allowGuestIds: false
      };
    }

    const botConfiguration = await loadConfigFromFile('bot-config');
    if (botConfiguration) {
      botConfig.botConfiguration = botConfiguration;
      logger.info(`🤖 Bot config: ${botConfiguration.botName} (${botConfiguration.botTone})`);
    } else {
      botConfig.botConfiguration = {
        botName: 'Elijah',
        botTone: 'upbeat',
        welcomeMessage: '✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️'
      };
    }

    const admins = await loadConfigFromFile('admins');
    if (admins) {
      botConfig.admins = admins;
      clubAdmins = admins;
      logger.info(`👥 ${admins.length} admins loaded`);
    }

    const spamWords = await loadConfigFromFile('spam-words');
    if (spamWords) {
      botConfig.spamWords = spamWords;
      logger.info(`🚫 ${spamWords.length} spam words loaded`);
    }

    const bannedPatterns = await loadConfigFromFile('banned-patterns');
    if (bannedPatterns) {
      botConfig.bannedPatterns = bannedPatterns;
      logger.info(`⛔ ${bannedPatterns.length} banned patterns loaded`);
    }
  } catch (error: any) {
    logger.error(`Error loading configurations: ${error.message}`);
  }
}

async function saveClubMembers(members: any) {
  try {
    if (members !== undefined) {
      const jsonString = JSON.stringify(members, null, 2);
      await fs.writeFile(MEMBERS_FILE, jsonString, 'utf8');
      club_members = members;
      logger.info(`✅ ${members.length} club members saved`);
    }
  } catch (error) {
    logger.error('Error saving club members');
  }
}

function formatWelcomeMessage(userName: string) {
  const welcomeTemplate = botConfig.botConfiguration?.welcomeMessage || '✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️';
  return welcomeTemplate.replace('{name}', userName);
}

async function loadSavedData(filePath: string) {
  try {
    await fs.access(filePath);
    const rawData = await fs.readFile(filePath, 'utf8');
    savedData = JSON.parse(rawData);
    logger.info('📁 User data loaded');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.info('📁 Starting with empty user data');
      savedData = {};
    } else {
      savedData = {};
    }
  }
}

async function saveData(data: any, filePath: string) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.error('Error saving data');
  }
}

function findPlayerID(UID: string) {
  for (const GC in savedData) {
    if (savedData[GC].UID === UID) {
      return GC;
    }
  }
  return null;
}

function findPlayerName(UID: string) {
  for (const GC in savedData) {
    if (savedData[GC].UID === UID) {
      return savedData[GC].NM;
    }
  }
  return 'Unknown';
}

function checkAvatar(number: number) {
  return number.toString().startsWith('1000');
}

// ==========================================
// OPENAI FUNCTIONS
// ==========================================

function gptTone(user_id: string) {
  const tones: any = {
    upbeat: "You are an upbeat and friendly assistant. Be positive and encouraging!",
    sarcastic: "You are a witty and sarcastic assistant. Use humor and sass in your responses!",
    wise: "You are a wise and thoughtful assistant. Provide deep insights and wisdom.",
    energetic: "You are an energetic and enthusiastic assistant. Show excitement in every response!",
    chill: "You are a chill and relaxed assistant. Keep things cool and casual.",
    phuppo: "You are a phuppo (aunt) character. Be caring but slightly nosy and gossipy.",
    gangster: "You are a gangster character. Talk tough and street-smart.",
    party: "You are a party animal. Everything is fun and exciting!"
  };
  
  const tone = botConfig.botConfiguration?.botTone || 'upbeat';
  return tones[tone] || tones.upbeat;
}

function removeBotName(message: string) {
  const botName = botConfig.botConfiguration?.botName || 'Elijah';
  return message.replace(new RegExp(botName, 'gi'), '').trim();
}

function splitMessage(text: string, maxLength: number = 150) {
  const words = text.split(' ');
  const chunks: string[] = [];
  let currentChunk = '';

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

async function getResponse(message: string, user_id: string) {
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
    logger.error("Error fetching ChatGPT response");
    return "Sorry, I couldn't process that.";
  }
}

// ==========================================
// WEBSOCKET FUNCTIONS (placeholder - bot.js handles actual WebSocket)
// ==========================================

function sendMessage(TC: string) {
  logger.warn('sendMessage called - WebSocket handled by standalone bot.js');
}

function kickUser(uid: string, reason: string = '') {
  logger.warn('kickUser called - WebSocket handled by standalone bot.js');
}

function takeMic() {
  logger.warn('takeMic called - WebSocket handled by standalone bot.js');
}

function leaveMic() {
  logger.warn('leaveMic called - WebSocket handled by standalone bot.js');
}

function changeName(newName: string) {
  logger.warn('changeName called - WebSocket handled by standalone bot.js');
}

function inviteMember(uid: string) {
  logger.warn('inviteMember called - WebSocket handled by standalone bot.js');
}

function joinMic(micIndex: number) {
  logger.warn('joinMic called - WebSocket handled by standalone bot.js');
}

async function handleMessage(data: string) {
  try {
    const jsonMessage = JSON.parse(data);
    botState.stats.messagesProcessed++;

    // Check for AUA message - this confirms bot is fully connected
    if (jsonMessage?.RH === "AUA") {
      botState.connected = true;
      botState.connecting = false;
      botState.startTime = Date.now();
      logger.info(`🎉 Bot authenticated and connected to ${club_name}!`);
    }

    // Increment daily message counter when MG (message) is received
    if (jsonMessage?.PY?.MG !== undefined) {
      await incrementMessageCounter();
    }

    // Handle member list
    if (jsonMessage?.PY?.ML !== undefined) {
      await saveClubMembers(jsonMessage.PY.ML);
    }

    // Handle new member joining
    if (jsonMessage?.TC === "nmu" && jsonMessage?.PY?.NM) {
      const userName = jsonMessage.PY.NM;
      const userUID = jsonMessage.PY.UID;
      
      // Check if avatar allowed
      if (!botConfig.settings?.allowAvatars && checkAvatar(jsonMessage.PY.AVI)) {
        kickUser(userUID, 'Avatars not allowed');
        return;
      }

      // Welcome message
      const welcomeMsg = formatWelcomeMessage(userName);
      sendMessage(welcomeMsg);
    }

    // Handle chat messages
    if (jsonMessage?.TC === "msg" && jsonMessage?.PY?.msg) {
      const message = jsonMessage.PY.msg;
      const senderUID = jsonMessage.PY.UID;
      const senderName = jsonMessage.PY.NM || 'User';

      // Don't respond to own messages
      if (senderUID === my_uid) return;

      // Check spam
      const lowerMsg = message.toLowerCase();
      for (const spamWord of botConfig.spamWords) {
        if (lowerMsg.includes(spamWord.toLowerCase())) {
          kickUser(senderUID, 'Spam detected');
          botState.stats.spamBlocked++;
          logger.info(`🚫 Spam blocked from ${senderName}: ${spamWord}`);
          return;
        }
      }

      // Check banned patterns
      for (const pattern of botConfig.bannedPatterns) {
        if (lowerMsg.includes(pattern.toLowerCase())) {
          kickUser(senderUID, 'Banned content');
          logger.info(`⛔ Banned pattern from ${senderName}: ${pattern}`);
          return;
        }
      }

      // Handle commands
      await handleChatCommand(message, senderUID, senderName);
    }

    // Handle mic updates
    if (jsonMessage?.TC === "mu" && jsonMessage?.PY?.MU) {
      mics = jsonMessage.PY.MU;
    }

  } catch (error) {
    logger.error('Error handling message');
  }
}

async function handleChatCommand(message: string, uid: string, name: string) {
  const msg = message.trim();
  const isAdmin = clubAdmins.includes(uid);
  const botName = botConfig.botConfiguration?.botName || 'Elijah';

  // AI Chat (mention bot name)
  if (msg.toLowerCase().includes(botName.toLowerCase())) {
    const cleanedMessage = removeBotName(msg);
    const response = await getResponse(cleanedMessage, uid);
    const chunks = splitMessage(response);
    
    for (const chunk of chunks) {
      sendMessage(chunk);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return;
  }

  // Admin commands
  if (!isAdmin && msg.startsWith('/')) {
    sendMessage('⛔ Admin-only command');
    return;
  }

  // /mic - Take mic
  if (msg === '/mic') {
    takeMic();
    sendMessage('🎤 Taking mic...');
  }
  
  // /lm - Leave mic
  else if (msg === '/lm' || msg === '/leave') {
    leaveMic();
    sendMessage('👋 Leaving mic...');
  }
  
  // /say <message>
  else if (msg.startsWith('/say ')) {
    const textToSay = msg.substring(5);
    sendMessage(textToSay);
  }
  
  // /spam <word> - Add spam word
  else if (msg.startsWith('/spam ')) {
    const word = msg.substring(6).trim();
    botConfig.spamWords.push(word);
    await fs.appendFile(SPAM_FILE, `${word}\n`);
    sendMessage(`✅ Added spam word: ${word}`);
  }
  
  // /whois <name> - Find user info
  else if (msg.startsWith('/whois ')) {
    const searchName = msg.substring(7).trim().toLowerCase();
    const found = club_members.find((m: any) => 
      m.NM.toLowerCase().includes(searchName)
    );
    if (found) {
      sendMessage(`👤 ${found.NM} - Level ${found.LVL} - UID: ${found.UID}`);
    } else {
      sendMessage('❌ User not found');
    }
  }
  
  // /kick <uid> - Kick user
  else if (msg.startsWith('/kick ')) {
    const targetUID = msg.substring(6).trim();
    kickUser(targetUID, 'Kicked by admin');
    sendMessage(`⚠️ Kicked user: ${targetUID}`);
  }
  
  // /cn <name> - Change bot name
  else if (msg.startsWith('/cn ')) {
    const newName = msg.substring(4).trim();
    changeName(newName);
    sendMessage(`✅ Name changed to: ${newName}`);
  }
  
  // /iv <uid> - Invite member
  else if (msg.startsWith('/iv ')) {
    const targetUID = msg.substring(4).trim();
    inviteMember(targetUID);
    sendMessage(`📨 Invited: ${targetUID}`);
  }
  
  // /joinMic <index> - Join specific mic
  else if (msg.startsWith('/joinMic ')) {
    const micIndex = parseInt(msg.substring(9));
    if (!isNaN(micIndex) && micIndex >= 0 && micIndex < 10) {
      joinMic(micIndex);
      sendMessage(`🎤 Joining mic ${micIndex}...`);
    } else {
      sendMessage('❌ Invalid mic index (0-9)');
    }
  }
  
  // /rejoin - Rejoin club (handled by standalone bot.js)
  else if (msg === '/rejoin') {
    sendMessage('🔄 Rejoin is handled by standalone bot process');
  }
  
  // /stats - Show bot stats
  else if (msg === '/stats') {
    const uptime = botState.startTime ? Math.floor((Date.now() - botState.startTime) / 1000) : 0;
    sendMessage(`📊 Messages: ${botState.stats.messagesProcessed} | Kicks: ${botState.stats.usersKicked} | Spam: ${botState.stats.spamBlocked} | Uptime: ${uptime}s`);
  }
  
  // /members - Show member count
  else if (msg === '/members') {
    sendMessage(`👥 ${club_members.length} members in club`);
  }
  
  // /guess <number> - Guess the number game
  else if (msg.startsWith('/guess ')) {
    const guess = parseInt(msg.substring(7));
    if (isNaN(guess)) {
      sendMessage('❌ Invalid number');
    } else if (guess === secretNumber) {
      sendMessage(`🎉 ${name} guessed it! The number was ${secretNumber}!`);
      secretNumber = Math.floor(Math.random() * 100) + 1;
    } else if (guess < secretNumber) {
      sendMessage('📈 Higher!');
    } else {
      sendMessage('📉 Lower!');
    }
  }
  
  // /type - Start typing challenge
  else if (msg === '/type') {
    const words = ['javascript', 'typescript', 'nodejs', 'express', 'websocket', 'replit'];
    typeWord = words[Math.floor(Math.random() * words.length)];
    sendMessage(`⌨️ Type this word: ${typeWord}`);
  }
  
  // Check if typing correct word
  else if (typeWord && msg.toLowerCase() === typeWord) {
    sendMessage(`✅ ${name} typed it correctly!`);
    typeWord = false;
  }
  
  // /help - Show commands
  else if (msg === '/help') {
    sendMessage('🤖 Commands: /mic /lm /say /spam /whois /kick /cn /iv /joinMic /rejoin /stats /members /guess /type /help');
  }
}

// ==========================================
// INITIALIZATION
// ==========================================

async function initializeBot() {
  try {
    await loadAllConfigurations();
    await loadSavedData(USERS_FILE);
    await loadMessageCounter();
    await initializeMySQL();
    
    // Connect to bot.js WebSocket for stream control events
    connectToBotWebSocket();
    
    logger.info('✅ Bot initialized successfully');
    logger.info('📡 Bot status fetched from MySQL database');
  } catch (error) {
    logger.error('Error initializing bot');
  }
}

// ==========================================
// EXPRESS API ENDPOINTS
// ==========================================

export function setupBotIntegration(app: Express) {
  
  // ====================
  // AUTHENTICATION ENDPOINTS
  // ====================

  // Login endpoint
  app.post('/api/jack/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
      }
      
      // Check if owner
      if (username === OWNER_ID && password === OWNER_PASSWORD) {
        const token = generateSessionToken();
        await setSession(token, {
          userId: username,
          role: 'owner',
          loginTime: new Date().toISOString()
        });
        
        await logActivity(username, 'owner', 'LOGIN', { message: 'Owner logged in' });
        
        return res.json({
          success: true,
          data: {
            token,
            user: { id: username, role: 'owner' }
          }
        });
      }
      
      // Check if moderator
      const moderators = await loadModerators();
      const moderator = moderators.find(m => m.username === username);
      
      if (moderator) {
        // Verify password with bcrypt (handles both hashed and legacy plaintext)
        const isValidPassword = moderator.passwordHash 
          ? await bcrypt.compare(password, moderator.passwordHash)
          : moderator.password === password;
        
        if (!isValidPassword) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = generateSessionToken();
        await setSession(token, {
          userId: username,
          role: 'moderator',
          loginTime: new Date().toISOString()
        });
        
        await logActivity(username, 'moderator', 'LOGIN', { message: 'Moderator logged in' });
        
        return res.json({
          success: true,
          data: {
            token,
            user: { id: username, role: 'moderator' }
          }
        });
      }
      
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    } catch (error) {
      logger.error('Login error');
      res.status(500).json({ success: false, message: 'Login failed' });
    }
  });

  // Logout endpoint
  app.post('/api/jack/logout', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.substring(7);
        await deleteSession(token);
      }
      
      if (req.user) {
        await logActivity(req.user.userId, req.user.role, 'LOGOUT', { message: 'User logged out' });
      }
      
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.json({ success: false, message: 'Logout failed' });
    }
  });

  // Session check endpoint
  app.get('/api/jack/session', authMiddleware, (req: AuthRequest, res) => {
    res.json({
      success: true,
      data: {
        user: { id: req.user?.userId, role: req.user?.role }
      }
    });
  });

  // List moderators (owner only)
  app.get('/api/jack/moderators', authMiddleware, ownerOnly, async (req: AuthRequest, res) => {
    try {
      const moderators = await loadModerators();
      // Don't send passwords
      const safeModerators = moderators.map(m => ({
        id: m.id,
        username: m.username,
        createdAt: m.createdAt
      }));
      res.json({ success: true, data: safeModerators });
    } catch (error) {
      res.json({ success: false, message: 'Failed to load moderators' });
    }
  });

  // Create moderator (owner only)
  app.post('/api/jack/moderators', authMiddleware, ownerOnly, async (req: AuthRequest, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.json({ success: false, message: 'Username and password are required' });
      }
      
      if (password.length < 4) {
        return res.json({ success: false, message: 'Password must be at least 4 characters' });
      }
      
      if (username === OWNER_ID) {
        return res.json({ success: false, message: 'Cannot use owner username' });
      }
      
      const moderators = await loadModerators();
      
      if (moderators.find(m => m.username === username)) {
        return res.json({ success: false, message: 'Username already exists' });
      }
      
      // Hash password with bcrypt
      const passwordHash = await bcrypt.hash(password, 10);
      
      const newModerator = {
        id: crypto.randomUUID(),
        username,
        passwordHash,
        createdAt: new Date().toISOString()
      };
      
      moderators.push(newModerator);
      await saveModerators(moderators);
      
      await logActivity(req.user!.userId, 'owner', 'CREATE_MODERATOR', { 
        moderatorUsername: username 
      });
      
      res.json({ 
        success: true, 
        data: { id: newModerator.id, username: newModerator.username, createdAt: newModerator.createdAt }
      });
    } catch (error) {
      res.json({ success: false, message: 'Failed to create moderator' });
    }
  });

  // Delete moderator (owner only)
  app.delete('/api/jack/moderators/:id', authMiddleware, ownerOnly, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const moderators = await loadModerators();
      const moderator = moderators.find(m => m.id === id);
      
      if (!moderator) {
        return res.json({ success: false, message: 'Moderator not found' });
      }
      
      const updatedModerators = moderators.filter(m => m.id !== id);
      await saveModerators(updatedModerators);
      
      await logActivity(req.user!.userId, 'owner', 'DELETE_MODERATOR', { 
        moderatorUsername: moderator.username 
      });
      
      res.json({ success: true, message: 'Moderator deleted' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to delete moderator' });
    }
  });

  // Change own password (for moderators)
  app.post('/api/jack/change-password', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.json({ success: false, message: 'Current and new password are required' });
      }
      
      if (newPassword.length < 4) {
        return res.json({ success: false, message: 'New password must be at least 4 characters' });
      }
      
      if (req.user?.role === 'owner') {
        // Owner cannot change password through this endpoint (it's stored in env)
        return res.json({ success: false, message: 'Owner password is managed through environment variables' });
      }
      
      // Moderator changing their own password
      const moderators = await loadModerators();
      const moderator = moderators.find(m => m.username === req.user?.userId);
      
      if (!moderator) {
        return res.json({ success: false, message: 'Moderator not found' });
      }
      
      // Verify current password
      const isValidPassword = moderator.passwordHash 
        ? await bcrypt.compare(currentPassword, moderator.passwordHash)
        : moderator.password === currentPassword;
      
      if (!isValidPassword) {
        return res.json({ success: false, message: 'Current password is incorrect' });
      }
      
      // Hash and save new password
      moderator.passwordHash = await bcrypt.hash(newPassword, 10);
      delete moderator.password; // Remove legacy plaintext if exists
      
      await saveModerators(moderators);
      
      await logActivity(req.user!.userId, 'moderator', 'CHANGE_PASSWORD', { 
        message: 'Changed own password' 
      });
      
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to change password' });
    }
  });

  // Owner changes moderator password
  app.post('/api/jack/moderators/:id/change-password', authMiddleware, ownerOnly, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;
      
      if (!newPassword) {
        return res.json({ success: false, message: 'New password is required' });
      }
      
      if (newPassword.length < 4) {
        return res.json({ success: false, message: 'Password must be at least 4 characters' });
      }
      
      const moderators = await loadModerators();
      const moderator = moderators.find(m => m.id === id);
      
      if (!moderator) {
        return res.json({ success: false, message: 'Moderator not found' });
      }
      
      // Hash and save new password
      moderator.passwordHash = await bcrypt.hash(newPassword, 10);
      delete moderator.password; // Remove legacy plaintext if exists
      
      await saveModerators(moderators);
      
      await logActivity(req.user!.userId, 'owner', 'CHANGE_MODERATOR_PASSWORD', { 
        moderatorUsername: moderator.username 
      });
      
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to change password' });
    }
  });

  // Get activity logs (owner only) - max 50 logs, 10 per page
  app.get('/api/jack/activity-logs', authMiddleware, ownerOnly, async (req: AuthRequest, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const maxLogs = 50;
      
      const allLogs = await loadActivityLogs();
      // Limit to most recent 50 logs
      const logs = allLogs.slice(0, maxLogs);
      const total = logs.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const paginatedLogs = logs.slice(start, start + limit);
      
      res.json({
        success: true,
        data: {
          logs: paginatedLogs,
          pagination: { page, limit, total, totalPages }
        }
      });
    } catch (error) {
      res.json({ success: false, message: 'Failed to load activity logs' });
    }
  });

  // ====================
  // JACK API ENDPOINTS
  // ====================

  // Get members with pagination
  app.get('/api/jack/members', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (page < 1 || limit < 1 || limit > 100) {
        return res.json({
          success: false,
          message: 'Invalid pagination parameters'
        });
      }

      const data = await fs.readFile(MEMBERS_FILE, 'utf8');
      const allMembers = JSON.parse(data);

      const levelStats = {
        total: allMembers.length,
        highLevel: allMembers.filter((m: any) => m.LVL >= 10).length,
        mediumLevel: allMembers.filter((m: any) => m.LVL >= 5 && m.LVL <= 9).length,
        lowLevel: allMembers.filter((m: any) => m.LVL >= 1 && m.LVL <= 4).length
      };

      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedMembers = allMembers.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          members: paginatedMembers,
          total: allMembers.length,
          page: page,
          limit: limit,
          totalPages: Math.ceil(allMembers.length / limit),
          levelStats: levelStats
        }
      });
    } catch (error) {
      res.json({ success: false, message: 'Failed to load members' });
    }
  });

  // Remove member
  app.delete('/api/jack/members/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      const data = await fs.readFile(MEMBERS_FILE, 'utf8');
      const allMembers = JSON.parse(data);

      const memberIndex = allMembers.findIndex((m: any) => m.UID === uid);
      if (memberIndex === -1) {
        return res.json({ success: false, message: 'Member not found' });
      }

      const removed = allMembers.splice(memberIndex, 1)[0];
      await fs.writeFile(MEMBERS_FILE, JSON.stringify(allMembers, null, 2));
      
      pendingRemovals.push(uid);
      
      // Kick from club if connected
      if (botState.connected) {
        kickUser(uid, 'Removed by admin');
      }
      
      logger.info(`🗑️ Member removed: ${removed.NM}`);

      res.json({
        success: true,
        message: `Member ${removed.NM} removed successfully`,
        removedMember: removed
      });
    } catch (error) {
      res.json({ success: false, message: 'Failed to remove member' });
    }
  });

  // Bulk remove members
  app.post('/api/jack/members/bulk-remove', async (req, res) => {
    try {
      const { level, count } = req.body;

      if (typeof level !== 'number' || typeof count !== 'number') {
        return res.json({ success: false, message: 'Invalid parameters' });
      }

      const data = await fs.readFile(MEMBERS_FILE, 'utf8');
      const allMembers = JSON.parse(data);
      const membersAtLevel = allMembers.filter((m: any) => m.LVL === level);

      if (membersAtLevel.length === 0) {
        return res.json({ success: false, message: `No members at level ${level}` });
      }

      const removeCount = Math.min(count, membersAtLevel.length);
      const membersToRemove = membersAtLevel.slice(0, removeCount);
      const uidsToRemove = membersToRemove.map((m: any) => m.UID);

      const updated = allMembers.filter((m: any) => !uidsToRemove.includes(m.UID));
      await fs.writeFile(MEMBERS_FILE, JSON.stringify(updated, null, 2));

      pendingRemovals.push(...uidsToRemove);
      
      // Kick all if connected
      if (botState.connected) {
        for (const uid of uidsToRemove) {
          kickUser(uid, 'Bulk removal');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logger.info(`🗑️ Bulk removed ${removeCount} members at level ${level}`);

      res.json({
        success: true,
        message: `Removed ${removeCount} members at level ${level}`,
        removedCount: removeCount
      });
    } catch (error) {
      res.json({ success: false, message: 'Failed to bulk remove' });
    }
  });

  // Load bot configuration
  app.get('/api/jack/bot-config', async (req, res) => {
    try {
      const data = await fs.readFile(BOT_CONFIG_FILE, 'utf8');
      const config = JSON.parse(data);
      botConfig.botConfiguration = config;
      res.json({ success: true, data: config });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        const defaultConfig = {
          botName: 'Elijah',
          botTone: 'upbeat',
          welcomeMessage: '✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️',
          createdAt: new Date().toISOString()
        };
        await fs.writeFile(BOT_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
        res.json({ success: true, data: defaultConfig });
      } else {
        res.json({ success: false, message: 'Failed to load config' });
      }
    }
  });

  // Save bot configuration
  app.post('/api/jack/bot-config', async (req, res) => {
    try {
      const { botName, botTone, welcomeMessage } = req.body;

      if (!botName || !botTone || !welcomeMessage) {
        return res.json({ success: false, message: 'Invalid bot configuration' });
      }

      const validTones = ['upbeat', 'sarcastic', 'wise', 'energetic', 'chill', 'phuppo', 'gangster', 'party'];
      if (!validTones.includes(botTone)) {
        return res.json({ success: false, message: 'Invalid bot tone' });
      }

      const config = {
        botName: botName.trim(),
        botTone,
        welcomeMessage: welcomeMessage.trim(),
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(BOT_CONFIG_FILE, JSON.stringify(config, null, 2));
      botConfig.botConfiguration = config;
      conversationHistory.clear();

      logger.info(`Bot configuration updated: ${botName} (${botTone})`);
      res.json({ success: true, message: 'Bot configuration saved' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to save config' });
    }
  });

  // Load settings
  app.get('/api/jack/settings', async (req, res) => {
    try {
      const settings = await loadSettings();
      res.json({ success: true, data: settings });
    } catch (error) {
      res.json({ success: false, message: 'Failed to load settings' });
    }
  });

  // Save settings (with activity logging)
  app.post('/api/jack/settings', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { allowAvatars, banLevel, allowGuestIds, enableLevelBan, micCount, punishments } = req.body;

      if (typeof allowAvatars !== 'boolean' ||
          typeof allowGuestIds !== 'boolean' ||
          typeof banLevel !== 'number' ||
          banLevel < 1 || banLevel > 100) {
        return res.json({ success: false, message: 'Invalid settings data' });
      }

      // Validate micCount
      const validMicCount = (typeof micCount === 'number' && micCount >= 1 && micCount <= 20) ? micCount : 10;

      // Load current settings to compare and preserve existing values
      const currentSettings = await loadSettings();

      const settings: any = {
        allowAvatars,
        banLevel,
        allowGuestIds,
        enableLevelBan: enableLevelBan ?? true,
        micCount: validMicCount,
        updatedAt: new Date().toISOString()
      };

      // Check if club settings changed
      const clubSettingsChanged = 
        currentSettings.allowAvatars !== allowAvatars ||
        currentSettings.banLevel !== banLevel ||
        currentSettings.allowGuestIds !== allowGuestIds ||
        currentSettings.enableLevelBan !== enableLevelBan ||
        currentSettings.micCount !== validMicCount;

      if (clubSettingsChanged && req.user) {
        await logActivity(req.user.userId, req.user.role, 'UPDATE_CLUB_SETTINGS', {
          allowAvatars,
          banLevel,
          allowGuestIds,
          enableLevelBan: enableLevelBan ?? true,
          micCount: validMicCount
        });
      }

      // Handle punishment settings - preserve existing if not provided
      if (punishments) {
        settings.punishments = {
          bannedPatterns: punishments.bannedPatterns || 'ban',
          lowLevel: punishments.lowLevel || 'ban',
          noGuestId: punishments.noGuestId || 'ban',
          noAvatar: punishments.noAvatar || 'kick',
          spamWords: punishments.spamWords || 'kick'
        };

        // Check if punishment settings changed
        const currentPunishments = currentSettings.punishments || {};
        const punishmentSettingsChanged = 
          currentPunishments.bannedPatterns !== punishments.bannedPatterns ||
          currentPunishments.lowLevel !== punishments.lowLevel ||
          currentPunishments.noGuestId !== punishments.noGuestId ||
          currentPunishments.noAvatar !== punishments.noAvatar ||
          currentPunishments.spamWords !== punishments.spamWords;

        if (punishmentSettingsChanged && req.user) {
          await logActivity(req.user.userId, req.user.role, 'UPDATE_PUNISHMENT_SETTINGS', {
            bannedPatterns: punishments.bannedPatterns,
            lowLevel: punishments.lowLevel,
            noGuestId: punishments.noGuestId,
            noAvatar: punishments.noAvatar,
            spamWords: punishments.spamWords
          });
        }
      } else if (currentSettings.punishments) {
        // Preserve existing punishment settings if not provided in request
        settings.punishments = currentSettings.punishments;
      }

      await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      botConfig.settings = settings;

      logger.info(`Settings updated: Avatars: ${allowAvatars}, Ban Level: ${banLevel}`);
      res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to save settings' });
    }
  });

  // Get exemptions (must be before generic :type route)
  app.get('/api/jack/config/exemptions', async (req, res) => {
    try {
      const data = await fs.readFile(path.join(process.cwd(), 'data', 'exemptions.txt'), 'utf8');
      const arr = data.split(',').map(s => s.trim()).filter(s => s);
      res.json({ success: true, data: arr });
    } catch (error) {
      res.json({ success: true, data: [] });
    }
  });

  // Save exemptions (must be before generic :type route)
  app.post('/api/jack/config/exemptions', async (req, res) => {
    try {
      const { data } = req.body;
      if (!Array.isArray(data)) {
        return res.json({ success: false, message: 'Invalid data format' });
      }
      
      const fileContent = data.join(', ');
      await fs.writeFile(path.join(process.cwd(), 'data', 'exemptions.txt'), fileContent, 'utf8');
      logger.info(`Exemptions updated: ${data.length} items`);
      
      res.json({ success: true, message: 'Exemptions saved' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to save exemptions' });
    }
  });

  // Get loyal members (must be before generic :type route)
  app.get('/api/jack/config/loyal-members', async (req, res) => {
    try {
      const data = await fs.readFile(path.join(process.cwd(), 'data', 'loyal_members.txt'), 'utf8');
      const arr = data.split(',').map(s => s.trim()).filter(s => s);
      res.json({ success: true, data: arr });
    } catch (error) {
      res.json({ success: true, data: [] });
    }
  });

  // Save loyal members (must be before generic :type route)
  app.post('/api/jack/config/loyal-members', async (req, res) => {
    try {
      const { data } = req.body;
      if (!Array.isArray(data)) {
        return res.json({ success: false, message: 'Invalid data format' });
      }
      
      const fileContent = data.join(', ');
      await fs.writeFile(path.join(process.cwd(), 'data', 'loyal_members.txt'), fileContent, 'utf8');
      logger.info(`Loyal members updated: ${data.length} items`);
      
      res.json({ success: true, message: 'Loyal members saved' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to save loyal members' });
    }
  });

  // Load configuration (admins, spam-words, banned-patterns)
  app.get('/api/jack/config/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const fileMap: any = {
        'admins': ADMINS_FILE,
        'spam-words': SPAM_FILE,
        'banned-patterns': BANNED_PATTERNS_FILE
      };

      const filePath = fileMap[type];
      if (!filePath) {
        return res.json({ success: false, message: 'Invalid config type' });
      }

      const data = await fs.readFile(filePath, 'utf8');
      let parsedData;

      if (type === 'spam-words') {
        parsedData = data.split('\n').filter(line => line.trim() !== '');
      } else {
        parsedData = data.split(',').map(item => item.trim()).filter(item => item !== '');
      }

      res.json({ success: true, data: parsedData });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.json({ success: false, message: 'File not found' });
      } else {
        res.json({ success: false, message: 'Failed to load config' });
      }
    }
  });

  // Save configuration
  app.post('/api/jack/config/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const { data } = req.body;

      const fileMap: any = {
        'admins': ADMINS_FILE,
        'spam-words': SPAM_FILE,
        'banned-patterns': BANNED_PATTERNS_FILE
      };

      const filePath = fileMap[type];
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
        clubAdmins = data;
      }

      await fs.writeFile(filePath, fileContent, 'utf8');
      logger.info(`Configuration ${type} updated: ${data.length} items`);

      res.json({ success: true, message: 'Configuration saved' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to save config' });
    }
  });

  // Get bot status (fetched from MySQL)
  app.get('/api/jack/status', async (req, res) => {
    try {
      const dbStatus = await fetchBotStatusFromDB();
      
      res.json({
        success: true,
        connected: dbStatus.connected,
        connecting: dbStatus.connecting,
        clubCode: club_code,
        clubName: club_name,
        lastUpdate: dbStatus.lastUpdate,
        configLoaded: {
          admins: botConfig.admins.length,
          spamWords: botConfig.spamWords.length,
          bannedPatterns: botConfig.bannedPatterns.length
        }
      });
    } catch (error) {
      res.json({
        success: true,
        connected: false,
        connecting: false,
        clubCode: club_code,
        clubName: club_name,
        lastUpdate: null,
        configLoaded: {
          admins: botConfig.admins.length,
          spamWords: botConfig.spamWords.length,
          bannedPatterns: botConfig.bannedPatterns.length
        }
      });
    }
  });

  // Get daily message count
  app.get('/api/jack/message-count', (req, res) => {
    try {
      const data = getMessageCount();
      res.json({
        success: true,
        data: {
          count: data.count,
          date: data.date
        }
      });
    } catch (error) {
      res.json({ success: false, message: 'Failed to get message count' });
    }
  });

  // Send message endpoint
  app.post('/api/jack/send-message', (req, res) => {
    try {
      const { message } = req.body;
      if (!message) {
        return res.json({ success: false, message: 'Message required' });
      }

      sendMessage(message);
      res.json({ success: true, message: 'Message sent' });
    } catch (error) {
      res.json({ success: false, message: 'Failed to send message' });
    }
  });

  // Connect bot endpoint (WebSocket managed by standalone bot.js)
  app.post('/api/jack/connect', (req, res) => {
    res.json({ 
      success: false, 
      message: 'Bot connection is managed by standalone bot.js process. Please start bot.js to connect.' 
    });
  });

  // Disconnect bot endpoint (WebSocket managed by standalone bot.js)
  app.post('/api/jack/disconnect', (req, res) => {
    res.json({ 
      success: false, 
      message: 'Bot disconnection is managed by standalone bot.js process.' 
    });
  });

  // Restart bot endpoint
  app.post('/api/jack/restart', async (req, res) => {
    try {
      logger.info('🔄 Bot restart requested from dashboard');
      res.json({
        success: true,
        message: 'Bot restart initiated'
      });

      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } catch (error) {
      res.json({ success: false, message: 'Failed to restart' });
    }
  });

  // Reset endpoint - called by bot.js /reset command
  app.get('/reset', async (req, res) => {
    try {
      logger.info('🔄 Reset requested from bot.js /reset command');
      res.json({
        success: true,
        message: 'Shutting down...'
      });
      setTimeout(() => process.exit(0), 100);
    } catch (error) {
      logger.error(`❌ Reset error: ${error}`);
      res.json({ success: false, message: 'Reset failed' });
    }
  });

  // Fetch VC credentials - proxies to external bot.js
  app.post('/api/jack/fetch-vc-credentials', async (req, res) => {
    try {
      const code = req.body?.code;

      if (!code) {
        return res.json({
          success: false,
          message: 'Club code is required'
        });
      }

      logger.info(`🔄 Proxying VC credentials request for club: ${code}`);

      const response = await axios.post(`${BOT_API_URL}/api/jack/fetch-vc-credentials`, {
        code: code
      }, {
        timeout: 20000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      res.json(response.data);
    } catch (error: any) {
      logger.error(`❌ Error fetching VC credentials: ${error.message}`);
      res.json({ 
        success: false, 
        message: error.response?.data?.message || error.message || 'Failed to fetch VC credentials'
      });
    }
  });

  // ==================== STREAM API (PUBLIC - NO AUTH) ====================

  // Get stream config (Agora credentials) - PUBLIC for stream listeners
  app.get('/api/jack/stream-config', async (req, res) => {
    try {
      if (!AGORA_APP_ID || !AGORA_CHANNEL || !AGORA_TOKEN) {
        return res.json({ 
          success: false, 
          message: 'Stream configuration not set. Please add AGORA_APP_ID, AGORA_CHANNEL, AGORA_TOKEN, and AGORA_USER_ID to your .env file.' 
        });
      }

      res.json({
        success: true,
        data: {
          appId: AGORA_APP_ID,
          channel: AGORA_CHANNEL,
          token: AGORA_TOKEN,
          userId: AGORA_USER_ID || '0'
        }
      });
    } catch (error) {
      res.json({ success: false, message: 'Failed to get stream configuration' });
    }
  });

  // Get songs list - PUBLIC for stream listeners
  app.get('/api/jack/stream-songs', async (req, res) => {
    try {
      const songsMetadataPath = path.join(process.cwd(), 'data', 'songs_metadata.json');
      let songs: any[] = [];
      try {
        const data = await fs.readFile(songsMetadataPath, 'utf8');
        const parsed = JSON.parse(data);
        songs = Array.isArray(parsed) ? parsed : (parsed.songs || []);
      } catch (err) {}
      
      res.json({ success: true, data: songs });
    } catch (error) {
      res.json({ success: false, message: 'Failed to load songs' });
    }
  });

  // Songs directory and multer setup
  const SONGS_DIR = path.join(process.cwd(), 'data', 'songs');
  const songsStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        await fs.mkdir(SONGS_DIR, { recursive: true });
        cb(null, SONGS_DIR);
      } catch (err) {
        cb(err as Error, SONGS_DIR);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    }
  });
  const songUpload = multer({
    storage: songsStorage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'audio/mpeg' || file.originalname.toLowerCase().endsWith('.mp3')) {
        cb(null, true);
      } else {
        cb(new Error('Only MP3 files are allowed'));
      }
    }
  });

  // Get songs list (authenticated)
  app.get('/api/jack/songs', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const songsMetadataPath = path.join(process.cwd(), 'data', 'songs_metadata.json');
      let songs: any[] = [];
      try {
        const data = await fs.readFile(songsMetadataPath, 'utf8');
        const parsed = JSON.parse(data);
        songs = Array.isArray(parsed) ? parsed : (parsed.songs || []);
      } catch (err) {}
      
      res.json({ success: true, data: songs });
    } catch (error) {
      res.json({ success: false, message: 'Failed to load songs' });
    }
  });

  // Upload song
  app.post('/api/jack/songs/upload', authMiddleware, songUpload.single('song'), async (req: any, res: any) => {
    try {
      if (!MUSIC_UPLOAD_ENABLED) {
        return res.json({ success: false, message: 'This feature is not available for you' });
      }

      if (!req.file) {
        return res.json({ success: false, message: 'No file uploaded' });
      }

      const songsMetadataPath = path.join(process.cwd(), 'data', 'songs_metadata.json');
      let songs: any[] = [];
      try {
        const data = await fs.readFile(songsMetadataPath, 'utf8');
        const parsed = JSON.parse(data);
        songs = Array.isArray(parsed) ? parsed : (parsed.songs || []);
      } catch (err) {}

      if (songs.length >= 15) {
        await fs.unlink(req.file.path);
        return res.json({ success: false, message: 'Maximum 15 songs allowed' });
      }

      const newSong = {
        id: crypto.randomUUID(),
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user?.userId || 'unknown'
      };

      songs.push(newSong);
      await fs.writeFile(songsMetadataPath, JSON.stringify(songs, null, 2), 'utf8');

      logger.info(`🎵 Song uploaded: ${newSong.originalName} by ${newSong.uploadedBy}`);
      res.json({ success: true, message: 'Song uploaded successfully', data: newSong });
    } catch (error: any) {
      logger.error(`❌ Error uploading song: ${error.message}`);
      res.json({ success: false, message: error.message || 'Failed to upload song' });
    }
  });

  // Delete song
  app.delete('/api/jack/songs/:id', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const songsMetadataPath = path.join(process.cwd(), 'data', 'songs_metadata.json');
      
      let songs: any[] = [];
      try {
        const data = await fs.readFile(songsMetadataPath, 'utf8');
        const parsed = JSON.parse(data);
        songs = Array.isArray(parsed) ? parsed : (parsed.songs || []);
      } catch (err) {
        return res.json({ success: false, message: 'No songs found' });
      }

      const songIndex = songs.findIndex(s => s.id === id);
      if (songIndex === -1) {
        return res.json({ success: false, message: 'Song not found' });
      }

      const song = songs[songIndex];
      const songPath = path.join(SONGS_DIR, song.filename);
      
      try {
        await fs.unlink(songPath);
      } catch (err) {
        logger.warn(`⚠️ Could not delete song file: ${songPath}`);
      }

      songs.splice(songIndex, 1);
      await fs.writeFile(songsMetadataPath, JSON.stringify(songs, null, 2), 'utf8');

      logger.info(`🗑️ Song deleted: ${song.originalName}`);
      res.json({ success: true, message: 'Song deleted successfully' });
    } catch (error: any) {
      logger.error(`❌ Error deleting song: ${error.message}`);
      res.json({ success: false, message: 'Failed to delete song' });
    }
  });

  // SSE endpoint for stream events - PUBLIC for stream listeners
  app.get('/api/jack/stream-events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send initial state
    res.write(`data: ${JSON.stringify({ action: 'state', ...streamState })}\n\n`);

    streamSSEClients.add(res);
    logger.info(`📡 Stream SSE client connected (total: ${streamSSEClients.size})`);

    req.on('close', () => {
      streamSSEClients.delete(res);
      logger.info(`📡 Stream SSE client disconnected (total: ${streamSSEClients.size})`);
    });
  });

  // Get current stream state
  app.get('/api/jack/stream-state', authMiddleware, (req: AuthRequest, res) => {
    res.json({ success: true, data: streamState });
  });

  // Stream control: Play
  app.post('/api/jack/stream-control/play', authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { songIndex } = req.body;
      
      if (songIndex !== undefined) {
        streamState.currentSongIndex = parseInt(songIndex) || 0;
      }
      streamState.status = 'playing';
      streamState.timestamp = Date.now();

      broadcastStreamEvent({ 
        action: 'play', 
        songIndex: streamState.currentSongIndex,
        timestamp: streamState.timestamp 
      });

      logger.info(`🎵 Stream control: Play song index ${streamState.currentSongIndex}`);
      res.json({ success: true, message: 'Play command sent', data: streamState });
    } catch (error) {
      res.json({ success: false, message: 'Failed to send play command' });
    }
  });

  // Stream control: Pause
  app.post('/api/jack/stream-control/pause', authMiddleware, (req: AuthRequest, res) => {
    try {
      streamState.status = 'paused';
      streamState.timestamp = Date.now();

      broadcastStreamEvent({ 
        action: 'pause',
        timestamp: streamState.timestamp 
      });

      logger.info(`⏸️ Stream control: Pause`);
      res.json({ success: true, message: 'Pause command sent', data: streamState });
    } catch (error) {
      res.json({ success: false, message: 'Failed to send pause command' });
    }
  });

  // Stream control: Next song
  app.post('/api/jack/stream-control/next', authMiddleware, async (req: AuthRequest, res) => {
    try {
      // Load songs to get the count
      const songsMetadataPath = path.join(process.cwd(), 'data', 'songs_metadata.json');
      let songsMetadata = { songs: [] as any[] };
      try {
        const data = await fs.readFile(songsMetadataPath, 'utf8');
        songsMetadata = JSON.parse(data);
      } catch (err) {}

      const totalSongs = songsMetadata.songs.length;
      if (totalSongs === 0) {
        return res.json({ success: false, message: 'No songs available' });
      }

      streamState.currentSongIndex = (streamState.currentSongIndex + 1) % totalSongs;
      streamState.status = 'playing';
      streamState.timestamp = Date.now();

      broadcastStreamEvent({ 
        action: 'next', 
        songIndex: streamState.currentSongIndex,
        timestamp: streamState.timestamp 
      });

      logger.info(`⏭️ Stream control: Next song (index ${streamState.currentSongIndex})`);
      res.json({ success: true, message: 'Next command sent', data: streamState });
    } catch (error) {
      res.json({ success: false, message: 'Failed to send next command' });
    }
  });

  // Stream control: Stop
  app.post('/api/jack/stream-control/stop', authMiddleware, (req: AuthRequest, res) => {
    try {
      streamState.status = 'stopped';
      streamState.timestamp = Date.now();

      broadcastStreamEvent({ 
        action: 'stop',
        timestamp: streamState.timestamp 
      });

      logger.info(`⏹️ Stream control: Stop`);
      res.json({ success: true, message: 'Stop command sent', data: streamState });
    } catch (error) {
      res.json({ success: false, message: 'Failed to send stop command' });
    }
  });

  // Initialize bot on server start (must complete before serving requests)
  initializeBot().then(() => {
    logger.info('✅ Bot initialized successfully');
  }).catch(err => {
    logger.error(`Bot initialization failed: ${err.message}`);
  });

  logger.info('✅ Bot integration endpoints registered');
  logger.info('📡 Bot API available at /api/jack/*');
}

// Export initialization function for synchronous startup
export async function initializeBotIntegration(): Promise<void> {
  await initializeMySQL();
}
