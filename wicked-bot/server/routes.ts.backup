import type { Express } from "express";
import { createServer, type Server } from "http";
import { promises as fs } from "fs";
import path from "path";

// File paths for data storage
const DATA_DIR = path.join(process.cwd(), 'data');
const FILES = {
  MEMBERS: path.join(DATA_DIR, 'club_members.json'),
  SETTINGS: path.join(DATA_DIR, 'settings.json'),
  BOT_CONFIG: path.join(DATA_DIR, 'bot_configuration.json'),
  SPAM_WORDS: path.join(DATA_DIR, 'spam.txt'),
  BANNED_PATTERNS: path.join(DATA_DIR, 'banned_patterns.txt'),
  ADMINS: path.join(DATA_DIR, 'admins.txt'),
  BOT_STATUS: path.join(DATA_DIR, 'bot_status.json'),
};

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Default data structures
const DEFAULT_SETTINGS = {
  allowAvatars: true,
  banLevel: 10,
  allowGuestIds: false,
  createdAt: new Date().toISOString()
};

const DEFAULT_BOT_CONFIG = {
  botName: 'RexBot',
  botTone: 'upbeat',
  welcomeMessage: '✨️˚.⭒Wᴇʟᴄᴏᴍᴇ {name}˚✨️',
  createdAt: new Date().toISOString()
};

const DEFAULT_BOT_STATUS = {
  isRunning: false,
  lastStarted: null,
  lastStopped: null,
  cacheCleared: null,
  uptime: 0
};

// Helper functions
async function readJsonFile(filePath: string, defaultValue: any = null) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      if (defaultValue !== null) {
        await writeJsonFile(filePath, defaultValue);
        return defaultValue;
      }
      return null;
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, data: any) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function readTextFile(filePath: string, defaultValue: string = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(filePath, defaultValue, 'utf8');
      return defaultValue;
    }
    throw error;
  }
}

async function writeTextFile(filePath: string, data: string) {
  await fs.writeFile(filePath, data, 'utf8');
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Ensure data directory exists on startup
  await ensureDataDir();

  // ====================
  // MEMBER MANAGEMENT ENDPOINTS
  // ====================

  // Get club members with pagination and stats
  app.get('/api/members', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      if (page < 1 || limit < 1 || limit > 100) {
        return res.json({
          success: false,
          message: 'Invalid pagination parameters'
        });
      }

      const allMembers = await readJsonFile(FILES.MEMBERS, []);

      // Calculate level statistics
      const levelStats = {
        total: allMembers.length,
        lowLevel: allMembers.filter((m: any) => m.LVL >= 1 && m.LVL <= 4).length,
        mediumLevel: allMembers.filter((m: any) => m.LVL >= 5 && m.LVL <= 9).length,
        highLevel: allMembers.filter((m: any) => m.LVL >= 10).length
      };

      // Paginate
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedMembers = allMembers.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          members: paginatedMembers,
          total: allMembers.length,
          page,
          limit,
          totalPages: Math.ceil(allMembers.length / limit),
          levelStats
        }
      });
    } catch (error: any) {
      console.error('Error loading members:', error);
      res.json({ success: false, message: 'Failed to load members' });
    }
  });

  // Remove individual member
  app.delete('/api/members/:uid', async (req, res) => {
    try {
      const { uid } = req.params;

      if (!uid) {
        return res.json({ success: false, message: 'Member UID is required' });
      }

      const allMembers = await readJsonFile(FILES.MEMBERS, []);
      const memberIndex = allMembers.findIndex((m: any) => m.UID === uid);

      if (memberIndex === -1) {
        return res.json({ success: false, message: 'Member not found' });
      }

      const memberToRemove = allMembers[memberIndex];
      allMembers.splice(memberIndex, 1);

      await writeJsonFile(FILES.MEMBERS, allMembers);

      console.log(`Member removed: ${memberToRemove.NM} (UID: ${uid})`);

      res.json({
        success: true,
        message: `Member ${memberToRemove.NM} removed successfully`,
        removedMember: {
          UID: memberToRemove.UID,
          NM: memberToRemove.NM,
          LVL: memberToRemove.LVL
        }
      });
    } catch (error: any) {
      console.error('Error removing member:', error);
      res.json({ success: false, message: 'Failed to remove member' });
    }
  });

  // Bulk remove members by level
  app.post('/api/members/bulk-remove', async (req, res) => {
    try {
      const { level, count } = req.body;

      if (typeof level !== 'number' || typeof count !== 'number') {
        return res.json({ success: false, message: 'Level and count must be numbers' });
      }

      if (level < 1 || level > 100 || count < 1 || count > 100) {
        return res.json({ success: false, message: 'Invalid level or count' });
      }

      const allMembers = await readJsonFile(FILES.MEMBERS, []);
      const membersAtLevel = allMembers.filter((m: any) => m.LVL === level);

      if (membersAtLevel.length === 0) {
        return res.json({ success: false, message: `No members found at level ${level}` });
      }

      const removeCount = Math.min(count, membersAtLevel.length);
      const membersToRemove = membersAtLevel.slice(0, removeCount);
      const uidsToRemove = membersToRemove.map((m: any) => m.UID);

      const updatedMembers = allMembers.filter((m: any) => !uidsToRemove.includes(m.UID));
      await writeJsonFile(FILES.MEMBERS, updatedMembers);

      console.log(`Bulk removed ${removeCount} members at level ${level}`);

      res.json({
        success: true,
        message: `Successfully removed ${removeCount} members at level ${level}`,
        removedCount: removeCount,
        level,
        remainingAtLevel: membersAtLevel.length - removeCount
      });
    } catch (error: any) {
      console.error('Error bulk removing members:', error);
      res.json({ success: false, message: 'Failed to bulk remove members' });
    }
  });

  // ====================
  // BOT CONFIGURATION ENDPOINTS
  // ====================

  // Get bot configuration
  app.get('/api/config/bot', async (req, res) => {
    try {
      const config = await readJsonFile(FILES.BOT_CONFIG, DEFAULT_BOT_CONFIG);
      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error('Error loading bot config:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Save bot configuration
  app.put('/api/config/bot', async (req, res) => {
    try {
      const { botName, botTone, welcomeMessage } = req.body;

      if (!botName || !botTone || !welcomeMessage) {
        return res.json({ success: false, message: 'Missing required fields' });
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

      await writeJsonFile(FILES.BOT_CONFIG, config);
      console.log(`Bot configuration updated: ${botName} (${botTone})`);

      res.json({ success: true, message: 'Bot configuration saved successfully' });
    } catch (error: any) {
      console.error('Error saving bot config:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // ====================
  // SETTINGS ENDPOINTS
  // ====================

  // Get settings
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await readJsonFile(FILES.SETTINGS, DEFAULT_SETTINGS);
      res.json({ success: true, data: settings });
    } catch (error: any) {
      console.error('Error loading settings:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Save settings
  app.put('/api/settings', async (req, res) => {
    try {
      const { allowAvatars, banLevel, allowGuestIds } = req.body;

      if (
        typeof allowAvatars !== 'boolean' ||
        typeof allowGuestIds !== 'boolean' ||
        typeof banLevel !== 'number' ||
        banLevel < 1 ||
        banLevel > 100
      ) {
        return res.json({ success: false, message: 'Invalid settings data' });
      }

      const settings = {
        allowAvatars,
        banLevel,
        allowGuestIds,
        updatedAt: new Date().toISOString()
      };

      await writeJsonFile(FILES.SETTINGS, settings);
      console.log(`Settings updated: Avatars: ${allowAvatars}, Ban Level: ${banLevel}, Guest IDs: ${allowGuestIds}`);

      res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // ====================
  // PROTECTION ENDPOINTS
  // ====================

  // Get spam words
  app.get('/api/protection/spam-words', async (req, res) => {
    try {
      const data = await readTextFile(FILES.SPAM_WORDS, '');
      const words = data.split('\n').filter(line => line.trim() !== '');
      res.json({ success: true, data: words });
    } catch (error: any) {
      console.error('Error loading spam words:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Save spam words
  app.put('/api/protection/spam-words', async (req, res) => {
    try {
      const { words } = req.body;

      if (!Array.isArray(words)) {
        return res.json({ success: false, message: 'Words must be an array' });
      }

      const content = words.join('\n');
      await writeTextFile(FILES.SPAM_WORDS, content);
      console.log(`Spam words updated: ${words.length} words`);

      res.json({ success: true, message: 'Spam words saved successfully' });
    } catch (error: any) {
      console.error('Error saving spam words:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Get banned patterns
  app.get('/api/protection/banned-patterns', async (req, res) => {
    try {
      const data = await readTextFile(FILES.BANNED_PATTERNS, '');
      const patterns = data.split(',').map(item => item.trim()).filter(item => item !== '');
      res.json({ success: true, data: patterns });
    } catch (error: any) {
      console.error('Error loading banned patterns:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Save banned patterns
  app.put('/api/protection/banned-patterns', async (req, res) => {
    try {
      const { patterns } = req.body;

      if (!Array.isArray(patterns)) {
        return res.json({ success: false, message: 'Patterns must be an array' });
      }

      const content = patterns.join(', ');
      await writeTextFile(FILES.BANNED_PATTERNS, content);
      console.log(`Banned patterns updated: ${patterns.length} patterns`);

      res.json({ success: true, message: 'Banned patterns saved successfully' });
    } catch (error: any) {
      console.error('Error saving banned patterns:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Get admins
  app.get('/api/protection/admins', async (req, res) => {
    try {
      const data = await readTextFile(FILES.ADMINS, '');
      const admins = data.split(',').map(item => item.trim()).filter(item => item !== '');
      res.json({ success: true, data: admins });
    } catch (error: any) {
      console.error('Error loading admins:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Save admins
  app.put('/api/protection/admins', async (req, res) => {
    try {
      const { admins } = req.body;

      if (!Array.isArray(admins)) {
        return res.json({ success: false, message: 'Admins must be an array' });
      }

      const content = admins.join(', ');
      await writeTextFile(FILES.ADMINS, content);
      console.log(`Admins updated: ${admins.length} admins`);

      res.json({ success: true, message: 'Admins saved successfully' });
    } catch (error: any) {
      console.error('Error saving admins:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // ====================
  // BOT CONTROL ENDPOINTS
  // ====================

  // Get bot status
  app.get('/api/bot/status', async (req, res) => {
    try {
      const status = await readJsonFile(FILES.BOT_STATUS, DEFAULT_BOT_STATUS);
      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error('Error reading bot status:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Start bot
  app.post('/api/bot/start', async (req, res) => {
    try {
      const status = await readJsonFile(FILES.BOT_STATUS, DEFAULT_BOT_STATUS);
      
      if (status.isRunning) {
        return res.json({ success: false, message: 'Bot is already running' });
      }

      const now = new Date().toISOString();
      status.isRunning = true;
      status.lastStarted = now;
      // Preserve lastStopped for audit history

      await writeJsonFile(FILES.BOT_STATUS, status);
      console.log('Bot started at:', now);

      res.json({ success: true, message: 'Bot started successfully', data: status });
    } catch (error: any) {
      console.error('Error starting bot:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Stop bot
  app.post('/api/bot/stop', async (req, res) => {
    try {
      const status = await readJsonFile(FILES.BOT_STATUS, DEFAULT_BOT_STATUS);
      
      if (!status.isRunning) {
        return res.json({ success: false, message: 'Bot is not running' });
      }

      const now = new Date().toISOString();
      status.isRunning = false;
      status.lastStopped = now;

      await writeJsonFile(FILES.BOT_STATUS, status);
      console.log('Bot stopped at:', now);

      res.json({ success: true, message: 'Bot stopped successfully', data: status });
    } catch (error: any) {
      console.error('Error stopping bot:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Restart bot
  app.post('/api/bot/restart', async (req, res) => {
    try {
      const status = await readJsonFile(FILES.BOT_STATUS, DEFAULT_BOT_STATUS);
      
      const now = new Date().toISOString();
      status.isRunning = true;
      status.lastStarted = now;
      // Preserve lastStopped for audit history

      await writeJsonFile(FILES.BOT_STATUS, status);
      console.log('Bot restarted at:', now);

      res.json({ success: true, message: 'Bot restarted successfully', data: status });
    } catch (error: any) {
      console.error('Error restarting bot:', error);
      res.json({ success: false, message: error.message });
    }
  });

  // Clear cache
  app.post('/api/bot/clear-cache', async (req, res) => {
    try {
      const status = await readJsonFile(FILES.BOT_STATUS, DEFAULT_BOT_STATUS);
      
      const now = new Date().toISOString();
      status.cacheCleared = now;

      await writeJsonFile(FILES.BOT_STATUS, status);
      console.log('Bot cache cleared at:', now);

      res.json({ success: true, message: 'Cache cleared successfully', data: status });
    } catch (error: any) {
      console.error('Error clearing cache:', error);
      res.json({ success: false, message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
