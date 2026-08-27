'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { connect } = require('puppeteer-real-browser');

// Import the official script injectors from SingleFile
const { getHookScriptSource, getScriptSource } = require('single-file-cli/lib/single-file-script.js');

const BROWSER_PATH = '/opt/google/chrome/google-chrome';
const BROWSER_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--window-size=1282,1051',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox'
];

let port = 3000;
if(process.argv.length > 2 && !isNaN(process.argv[2])) {
    port = parseInt(process.argv[2], 10);
}

const app = express();
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));

app.post('/', async (req, res) => {
    const { url } = req.body;
    console.log("\n=======================================================");
    console.log("request:", JSON.stringify(req.body));
    
    if (!url) {
        res.status(500).send('Error: url parameter not found.');
        return;
    }

    const DATA_DIR = `/tmp/chrome-data-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    fs.mkdirSync(DATA_DIR, { recursive: true });

    let browserInstance = null;
    let browserPid = null;

    try {
        console.log(`[STEALTH] Launching PRB for: ${url} (Profile: ${DATA_DIR})`);
        const { browser, page } = await connect({
            headless: false,
            args: BROWSER_ARGS,
            customConfig: { 
                chromePath: BROWSER_PATH,
                userDataDir: DATA_DIR
            },
            turnstile: true,
            disableXvfb: false,
            ignoreAllFlags: false
        });
        browserInstance = browser;
        if (browser.process()) browserPid = browser.process().pid;

        const stealthUA = await page.evaluate(() => navigator.userAgent);
        console.log(`[STEALTH] PRB initialized. UA: ${stealthUA}`);

        // Block heavy media to save RAM
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['media', 'font'].includes(req.resourceType()) || req.url().includes('analytics') || req.url().includes('tracker')) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`[STEALTH] Navigating to ${url}...`);
        let prbStatus = null;
        page.on('response', response => {
            if (response.url() === url) prbStatus = response.status();
        });

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 });
        } catch (err) {
            console.log(`[STEALTH] Network wait timeout or goto error. Proceeding...`);
        }

        let prbTitle = await page.title();
        console.log(`[STEALTH] Status: ${prbStatus} | Title: "${prbTitle}"`);

        // WAF Evasion Sequence
        if (prbStatus === 403 || prbTitle.includes('403')) {
            console.log(`[STEALTH] 403 / Challenge detected. Injecting proven biometric sequence...`);
            let autoNavigated = false;
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 })
                .then(() => { autoNavigated = true; }).catch(() => {});

            try {
                for (let i = 0; i < 3; i++) {
                    if (autoNavigated) break;
                    await page.mouse.move(100 + Math.random() * 500, 100 + Math.random() * 500, { steps: 10 }).catch(()=>{});
                    await new Promise(r => setTimeout(r, 200));
                    if (autoNavigated) break;
                    await page.mouse.down().catch(()=>{});
                    await new Promise(r => setTimeout(r, 50));
                    await page.mouse.up().catch(()=>{});
                }
                if (!autoNavigated) await page.keyboard.press('Shift').catch(()=>{});
                if (!autoNavigated) await new Promise(r => setTimeout(r, 50));
                if (!autoNavigated) await page.mouse.wheel({ deltaY: 300 }).catch(()=>{});
                
                console.log(`[STEALTH] Biometrics injected. Waiting up to 5s for telemetry POST/auto-reload...`);
                for (let i = 0; i < 50; i++) {
                    if (autoNavigated) break;
                    await new Promise(r => setTimeout(r, 100));
                }
                
                if (!autoNavigated) {
                    console.log(`[STEALTH] Forcing page reload to present valid cookie...`);
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
                }
                prbTitle = await page.title().catch(() => "Unknown");
                console.log(`[STEALTH] Post-challenge Title: "${prbTitle}"`);
            } catch (e) {
                console.log(`[STEALTH] Interaction sequence failed: ${e.message}`);
            }
        }

        console.log(`[SINGLEFILE] Executing natively in WAF-cleared PRB page...`);
        
        let extractData = { url: url, extracts: [], html: null };
        
        // Listen for the custom extraction payload from extract-inject.js
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('### META_EXTRACTION_START ###')) {
                const match = text.match(/### META_EXTRACTION_START ###([\s\S]*)### META_EXTRACTION_END ###/);
                if (match) {
                    try { 
                        const parsed = JSON.parse(match[1]); 
                        extractData = { ...extractData, ...parsed };
                        console.log(`[SINGLEFILE] Successfully captured FTS metadata.`);
                    } catch(e) { console.error("Failed to parse extract payload", e); }
                }
            }
        });

        // 1. Run User Extraction Script (FTS Readability)
        const extractScriptPath = path.resolve(__dirname, 'extract-inject.js');
        if (fs.existsSync(extractScriptPath)) {
            const extractScript = fs.readFileSync(extractScriptPath, 'utf8');
            await page.evaluate(extractScript).catch(e => console.error("Extract script error:", e));
            await new Promise(r => setTimeout(r, 2000)); 
        }

        // 2. Inject and Run SingleFile Core natively
        let htmlContent = null;
        try {
            console.log(`[SINGLEFILE] Injecting official SingleFile bundle...`);
            
            // This is the official API to load single-file into a puppeteer instance
            await page.addScriptTag({ content: getHookScriptSource() });
            const scriptSrc = (await getScriptSource({})) + "; window.singlefile = singlefile;";
            await page.addScriptTag({ content: scriptSrc });
            
            htmlContent = await page.evaluate(async () => {
                if (typeof singlefile !== 'undefined') {
                    const pageData = await singlefile.getPageData({
                        removeHiddenElements: true,
                        removeUnusedStyles: true,
                        removeUnusedFonts: true,
                        removeImports: true,
                        blockScripts: true,
                        blockAudios: true,
                        blockVideos: true,
                        removeFrames: false
                    });
                    return pageData.content;
                }
                throw new Error("singlefile object not found in window");
            });
        } catch(err) {
            console.error(`[SINGLEFILE] Injection failed, falling back to raw DOM. Error: ${err.message}`);
            htmlContent = await page.content();
        }

        extractData.html = htmlContent;
        console.log(`[SINGLEFILE] Completed successfully. Final HTML Length: ${htmlContent.length} bytes`);
        
        res.setHeader('Content-Type', 'application/json');
        res.send(extractData);

    } catch (e) {
        console.error(`\n[SCRAPER CRASH DETECTED]`);
        console.error(e.stack);
        if (!res.headersSent) res.status(500).send('Error: ' + e.message);
    } finally {
        if (browserInstance) {
            try { await browserInstance.close(); } catch(e) {}
        }
        if (browserPid) {
            try { process.kill(browserPid, 'SIGKILL'); } catch(e) {}
        }
        
        try {
            const pids = fs.readdirSync('/proc').filter(p => !isNaN(p));
            for (const pid of pids) {
                try {
                    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
                    if (cmdline.includes('chrome') && cmdline.includes(DATA_DIR)) {
                        process.kill(parseInt(pid), 'SIGKILL');
                    }
                } catch(e) {}
            }
        } catch(e) {}

        if (fs.existsSync(DATA_DIR)) {
            try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) {}
        }
        console.log(`[STEALTH] Cleaned up profile ${DATA_DIR}`);
    }
});

const listener = app.listen(port, '0.0.0.0', () => {
    console.log(`Server is listening on ${JSON.stringify(listener.address())}`);
});