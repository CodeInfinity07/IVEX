const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const STREAM_URL = process.env.STREAM_URL || 'https://music-club.botpanels.live/stream';
const API_PORT = 1001;
const HEARTBEAT_INTERVAL = 30000;
const RECONNECT_DELAY = 5000;
const USER_DATA_DIR = process.env.USER_DATA_DIR || path.join(process.cwd(), '.chrome-profile');

let browser = null;
let page = null;
let isRunning = true;

if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

function startApiServer() {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        
        if (req.url === '/stop' || req.url === '/reset') {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, message: 'Shutting down...' }));
            console.log('🛑 Reset requested via API');
            isRunning = false;
            setTimeout(() => process.exit(0), 500);
        } else if (req.url === '/status') {
            const status = await getStatus();
            res.writeHead(200);
            res.end(JSON.stringify(status));
        } else if (req.url === '/reconnect') {
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, message: 'Reconnecting...' }));
            await reconnect();
        } else {
            res.writeHead(200);
            res.end(JSON.stringify({ 
                status: 'running', 
                endpoints: ['/stop', '/reset', '/status', '/reconnect'] 
            }));
        }
    });
    
    server.listen(API_PORT, '0.0.0.0', () => {
        console.log(`🌐 API: http://localhost:${API_PORT} [/stop, /status, /reconnect]`);
    });
    
    return server;
}

async function getStatus() {
    if (!page) return { connected: false, song: null };
    
    try {
        return await page.evaluate(() => {
            const text = document.body.innerText.toLowerCase();
            const isConnected = text.includes('connected') && !text.includes('disconnected');
            
            const songEl = document.querySelector('.truncate.font-medium, [class*="truncate"]');
            const song = songEl ? songEl.textContent : null;
            
            const trackEl = document.querySelector('[class*="muted-foreground"]');
            const trackMatch = trackEl?.textContent?.match(/Track (\d+) of (\d+)/);
            
            return {
                connected: isConnected,
                song: song,
                track: trackMatch ? { current: parseInt(trackMatch[1]), total: parseInt(trackMatch[2]) } : null
            };
        });
    } catch {
        return { connected: false, song: null };
    }
}

function findChromium() {
    const paths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/snap/bin/chromium',
    ];
    
    for (const cmd of ['chromium', 'chromium-browser', 'google-chrome']) {
        try {
            const which = execSync(`which ${cmd} 2>/dev/null`, { timeout: 2000 }).toString().trim();
            if (which) return which;
        } catch {}
    }
    
    for (const p of paths) {
        if (p) {
            try {
                require('fs').accessSync(p, require('fs').constants.X_OK);
                return p;
            } catch {}
        }
    }
    
    return null;
}

async function launchBrowser() {
    const executablePath = findChromium();
    const useHeadless = process.env.HEADLESS !== 'false';
    
    console.log(`📦 Browser: ${executablePath || 'puppeteer bundled'}`);
    console.log(`📂 Profile: ${USER_DATA_DIR}`);
    console.log(`🖥️ Mode: ${useHeadless ? 'headless' : 'headed'}`);
    
    browser = await puppeteer.launch({
        headless: useHeadless ? 'new' : false,
        executablePath: executablePath || undefined,
        userDataDir: USER_DATA_DIR,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--disable-popup-blocking',
            '--disable-component-update',
            '--disable-breakpad',
            '--autoplay-policy=no-user-gesture-required',
            '--window-size=1280,720',
            '--use-fake-ui-for-media-stream',
            '--enable-features=AudioServiceOutOfProcess',
            '--disable-features=TranslateUI',
            '--audio-buffer-size=4096',
        ]
    });
    
    return browser;
}

async function connect() {
    console.log('🚀 Connecting to stream...');
    
    if (!browser) {
        await launchBrowser();
    }
    
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
    });
    
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Agora]') || text.includes('Published') || text.includes('Playing')) {
            console.log(`📺 ${text}`);
        }
    });
    
    console.log(`📡 Loading ${STREAM_URL}...`);
    await page.goto(STREAM_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log('✅ Page loaded, clicking Connect...');
    
    await page.waitForSelector('button', { timeout: 10000 });
    
    const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const connectBtn = buttons.find(btn => 
            btn.textContent.toLowerCase().includes('connect') && 
            !btn.textContent.toLowerCase().includes('disconnect')
        );
        if (connectBtn && !connectBtn.disabled) {
            connectBtn.click();
            return true;
        }
        return false;
    });
    
    if (!clicked) {
        console.log('⚠️ Connect button not found or already connected');
    } else {
        console.log('✅ Connect clicked, waiting for Agora...');
    }
    
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const status = await getStatus();
        console.log(`📊 ${i+1}/20: ${status.connected ? 'Connected' : 'Connecting...'}`);
        if (status.connected) {
            console.log('✅ Agora connected!');
            break;
        }
    }
    
    await startFirstSong();
}

async function startFirstSong() {
    if (!page) return;
    
    console.log('🎵 Starting first song...');
    
    await page.evaluate(() => {
        const playBtn = document.querySelector('button[class*="h-12 w-12"]');
        if (playBtn) {
            playBtn.click();
            return true;
        }
        const buttons = Array.from(document.querySelectorAll('button'));
        const playButton = buttons.find(btn => btn.querySelector('svg[class*="lucide-play"]'));
        if (playButton) {
            playButton.click();
            return true;
        }
        return false;
    });
    
    await new Promise(r => setTimeout(r, 2000));
    const status = await getStatus();
    if (status.song) {
        console.log(`🎵 Now playing: ${status.song}`);
    }
}

async function reconnect() {
    console.log('🔄 Reconnecting...');
    
    try {
        if (page) {
            await page.close().catch(() => {});
            page = null;
        }
    } catch {}
    
    await new Promise(r => setTimeout(r, RECONNECT_DELAY));
    await connect();
}

async function monitorConnection() {
    let lastSong = null;
    let disconnectCount = 0;
    
    while (isRunning) {
        await new Promise(r => setTimeout(r, HEARTBEAT_INTERVAL));
        
        if (!isRunning) break;
        
        try {
            const status = await getStatus();
            const mem = process.memoryUsage();
            
            if (status.song && status.song !== lastSong) {
                console.log(`🎵 Song changed: ${status.song}`);
                lastSong = status.song;
            }
            
            if (status.connected) {
                disconnectCount = 0;
                const trackInfo = status.track ? ` | Track ${status.track.current}/${status.track.total}` : '';
                console.log(`💓 Connected${trackInfo} | RAM: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
            } else {
                disconnectCount++;
                console.log(`⚠️ Disconnected (${disconnectCount}/3)`);
                
                if (disconnectCount >= 3) {
                    console.log('🔄 Auto-reconnecting...');
                    await reconnect();
                    disconnectCount = 0;
                }
            }
            
            if (global.gc) global.gc();
        } catch (err) {
            console.error('❌ Monitor error:', err.message);
        }
    }
}

async function main() {
    console.log('🎵 Stream Connect - Optimized for Howler.js');
    console.log('─'.repeat(40));
    
    startApiServer();
    
    try {
        await connect();
        await monitorConnection();
    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    isRunning = false;
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
});

process.on('SIGTERM', async () => {
    isRunning = false;
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught:', err.message);
});

main();
