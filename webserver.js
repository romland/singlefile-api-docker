'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { connect } = require('puppeteer-real-browser');

const SINGLEFILE_EXECUTABLE = '/opt/app/node_modules/single-file-cli/single-file-node.js';
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
app.use(express.urlencoded({ extended: true }))

app.post('/', async (req, res) => {
    const { url } = req.body;
    console.log("\n=======================================================");
    console.log("request:", JSON.stringify(req.body));
    
    if (!url) {
        res.status(500).send('Error: url parameter not found.');
        return;
    }

    // Generate a completely unique data directory for this specific request
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
        
        if (browser.process()) {
            browserPid = browser.process().pid;
        }

        const stealthUA = await page.evaluate(() => navigator.userAgent);
        console.log(`[STEALTH] PRB initialized. UA: ${stealthUA}`);

        // CRITICAL: SingleFile CLI opens a NEW tab. PRB only patches the first tab.
        browser.on('targetcreated', async (target) => {
            if (target.type() === 'page') {
                try {
                    const newPage = await target.page();
                    await newPage.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
                } catch (e) {}
            }
        });

        console.log(`[STEALTH] Navigating to ${url}...`);
        let prbStatus = null;
        page.on('response', response => {
            if (response.url() === url) prbStatus = response.status();
        });

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 });
        } catch (err) {
            console.log(`[STEALTH] Network wait timeout or goto error. Proceeding...`);
        }

        let prbTitle = await page.title();
        console.log(`[STEALTH] Status: ${prbStatus} | Title: "${prbTitle}"`);

        if (prbStatus === 403 || prbTitle.includes('403')) {
            console.log(`[STEALTH] 403 / Challenge detected. Injecting proven biometric sequence...`);
            
            let autoNavigated = false;
            const navWatcher = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 })
                .then(() => { autoNavigated = true; })
                .catch(() => {});

            try {
                // This is the EXACT loop that gave you Status 200 earlier.
                // Every single command has a silent catch so WAF reloads don't crash the script.
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
                
                // Replaced page.evaluate scroll with native wheel to prevent deadlocks
                if (!autoNavigated) await page.mouse.wheel({ deltaY: 300 }).catch(()=>{});
                
                console.log(`[STEALTH] Biometrics injected. Waiting up to 5s for telemetry POST/auto-reload...`);
                for (let i = 0; i < 50; i++) {
                    if (autoNavigated) break;
                    await new Promise(r => setTimeout(r, 100));
                }
                
                if (!autoNavigated) {
                    console.log(`[STEALTH] No auto-reload detected. Forcing page reload to present valid cookie...`);
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(()=>{});
                } else {
                    console.log(`[STEALTH] WAF auto-reloaded successfully.`);
                }
                
                prbTitle = await page.title().catch(() => "Unknown");
                console.log(`[STEALTH] Post-challenge Title: "${prbTitle}"`);
            } catch (e) {
                console.log(`[STEALTH] Interaction sequence or reload failed: ${e.message}`);
            }
        }

        const wsEndpoint = browser.wsEndpoint();
        
        console.log(`\n[DEBUG] === EXTRACTING FATAL DEBUG INFO ===`);
        console.log(`[DEBUG] PRB Proxy WS Endpoint: ${wsEndpoint}`);
        
        let singleFileServerArg = wsEndpoint;
        let realPort = null;
        try {
            const pids = fs.readdirSync('/proc').filter(p => !isNaN(p));
            for (const pid of pids) {
                try {
                    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
                    if (cmdline.includes('chrome') && cmdline.includes(DATA_DIR) && cmdline.includes('--remote-debugging-port=')) {
                        const match = cmdline.match(/--remote-debugging-port=(\d+)/);
                        if (match) {
                            realPort = match[1];
                            break;
                        }
                    }
                } catch(e) {}
            }
        } catch(e) {}

        if (realPort) {
            singleFileServerArg = `http://127.0.0.1:${realPort}`;
            console.log(`[DEBUG] Found real Chrome CDP Port via /proc: ${realPort}`);
            console.log(`[DEBUG] Bypassing PRB Proxy. Routing SingleFile to: ${singleFileServerArg}`);
        } else {
            console.log(`[DEBUG] WARNING: Could not find real Chrome CDP port in /proc. Using PRB Proxy (likely to crash).`);
        }
        console.log(`[DEBUG] =====================================\n`);

        console.log(`[SINGLEFILE] Passing to SingleFile CLI...`);

        const args = [
            `--browser-server=${singleFileServerArg}`,
            '--dump-content',
            '--browser-debug=true',
            `--user-agent=${stealthUA}`,
            '--browser-load-max-time=15000',
            '--browser-wait-until=load',
            '--browser-wait-delay=2000',
            '--browser-script=' + path.resolve(__dirname, 'extract-inject.js'),
            '--browser-ignore-insecure-certs=true',
            url
        ];

        // 120 SECOND TIMEOUT TO ALLOW E-COMMERCE ASSET PACKAGING
        const opts = { maxBuffer: 1024 * 1024 * 50, timeout: 120000 };

        console.log(`[DEBUG] SingleFile CLI CMD: node ${SINGLEFILE_EXECUTABLE} ${args.join(' ')}`);
        
        await new Promise((resolve, reject) => {
            cp.execFile(process.execPath, [SINGLEFILE_EXECUTABLE, ...args], opts, (e, stdout, stderr) => {
                console.log(`[DEBUG] SingleFile Process Exited with Code: ${e ? e.code : 0}`);

                if (res.headersSent) return resolve();

                if (e) {
                    console.error(`\n[SINGLEFILE CRASH DETECTED]`);
                    console.error(`► FATAL ERROR: ${e.message}`);
                    console.error(`► RAW STDERR:\n${stderr ? stderr.trim() : '(empty)'}`);
                    console.error(`► RAW STDOUT:\n${stdout ? stdout.trim().substring(0, 500) + '... (truncated)' : '(empty)'}`);
                    res.status(500).send('Error: ' + e);
                    return resolve();
                }

                if (stdout.length < 500) {
                    console.log(`[SINGLEFILE] Warning: Very small output detected: ${stdout.trim()}`);
                    console.log(`[DEBUG] RAW STDERR FOR 0-BYTE DUMP:\n${stderr ? stderr.trim() : '(empty)'}`);
                }

                let result = { url: url, extracts: [], html: null };
                
                const extract = stdout.match(/(?<=### META_EXTRACTION_START ###)(.*)(?=### META_EXTRACTION_END ###)/s);
                if(extract && extract.length > 0) {
                    try {
                        let stdoutClean = stdout.replace("### META_EXTRACTION_START ###", "");
                        stdoutClean = stdoutClean.replace("### META_EXTRACTION_END ###", "");
                        stdoutClean = stdoutClean.replace(extract[0], "");
                        result = JSON.parse(extract[0]);
                        stdout = stdoutClean;
                    } catch(ex) {
                        console.error("Failed to parse text extraction");
                    }
                }
                result.html = stdout;
                console.log(`[SINGLEFILE] Completed successfully. Final HTML Length: ${stdout.length} bytes`);

                res.setHeader('Content-Type', 'application/json');
                res.send(result);
                resolve();
            });
        });

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