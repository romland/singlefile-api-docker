'use strict';
/*
                  ┌──────────────────────────────────────────┐
                  │ Does webserver log hit a 45s hard timeout│
                  └────────────────────┬─────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                 ▼
     [Test Raw Chrome direct]                 [Test SingleFile CLI direct]
/opt/google/chrome/google-chrome \       node .../single-file-node.js ...
  --headless=new --dump-dom <URL>          --dump-content <URL>
                    │                                     │
         ┌───────────┴──────────┐               ┌─────────────┴──────────┐
         ▼                   ▼               ▼                     ▼
  Fails / Times out       Succeeds        Succeeds               Fails
  ┌──────────────────┐  ┌────────────────┐ ┌──────────┐  ┌───────────────────────────────┐
  │ Network / IP / │  │ Chrome works!│ │ Scraper │  │ CDP / SingleFile flag bug │
  │ Akamai block   │  │ Issue is CDP │ │ works!  │  │ Check wait conditions or  │
  │ Issue is Chrome│  │ wrapper level│ │ Done.   │  │ node_modules modifications│
  └──────────────────┘  └────────────────┘ └──────────┘  └───────────────────────────────┘
*/

const cp = require('child_process');
const express = require('express');
const path = require('path');

// const SINGLEFILE_EXECUTABLE = '/opt/app/node_modules/single-file/cli/single-file';
const SINGLEFILE_EXECUTABLE = '/opt/app/node_modules/single-file-cli/single-file-node.js';
const BROWSER_PATH = '/opt/google/chrome/google-chrome';
const BROWSER_ARGS = [
	'--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-web-security',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
];
// const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let port = 3000;

if(process.argv.length > 2 && !isNaN(process.argv[2])) {
    port = parseInt(process.argv[2], 10);
}

const app = express();
app.use(express.urlencoded({ extended: true }))

app.post('/', async (req, res) => {
    const { url } = req.body;
    
    console.log("request:", JSON.stringify(req.body));
    
    if (url) {
        const args = [
            '--browser-load-max-time=30000',
            '--browser-script=' + path.resolve(__dirname, 'extract-inject.js'),
            '--browser-ignore-insecure-certs=true',
            '--browser-executable-path=' + BROWSER_PATH,
            '--browser-args=' + JSON.stringify(BROWSER_ARGS),
            // '--browser-user-agent=' + USER_AGENT,
            url,
            '--dump-content',
        ];
        const opts = {
            maxBuffer: 1024 * 1024 * 50,
            timeout: 45000 // Hard 45s safety killswitch to prevent orphan process hangs
        };

        // cp.execFile(SINGLEFILE_EXECUTABLE, args, opts, (e, stdout, stderr) => {
        // cp.execFile(process.execPath, [SINGLEFILE_CLI, ...args], opts, (e, stdout, stderr) => {
        // cp.execFile(SINGLEFILE_EXECUTABLE, args, opts, (e, stdout, stderr) => {
        // cp.execFile(process.execPath, [SINGLEFILE_EXECUTABLE, ...args], opts, (e, stdout, stderr) => {
        cp.execFile(process.execPath, [SINGLEFILE_EXECUTABLE, ...args], opts, (e, stdout, stderr) => {
            if (res.headersSent) return;
            if(e) {
                console.error(`\n[SINGLEFILE CRASH DETECTED]`);
                console.error(`► Exit Code / Signal : ${e.code || e.signal}`);
                console.error(`► Process Killed     : ${e.killed ? 'YES (Hard timeout limit hit)' : 'NO'}`);
                console.error(`► Executed Command   : ${e.cmd}`);
                console.error(`► STDERR:\n${stderr ? stderr.trim() : '(empty)'}`);
                if (stdout) console.error(`► STDOUT HEAD:\n${stdout.slice(0, 300)}...\n`);
                return res.status(500).send('Error: ' + e);
            }

            let result = {
                url : url,
                title : "", 
                extracts : [], 
                centerX : -1, 
                centerY : -1, 
                centerPath : "", 
                centerText : "", 
                heights : [], 
                dismissedCookieDialog : false, 
                fallbackExtract : false,
                html : null,
            };

            const extract = stdout.match(/(?<=### META_EXTRACTION_START ###)(.*)(?=### META_EXTRACTION_END ###)/s);
            if(extract && extract.length > 0) {
                try {
                    stdout = stdout.replace("### META_EXTRACTION_START ###", "");
                    stdout = stdout.replace("### META_EXTRACTION_END ###", "");
                    stdout = stdout.replace(extract[0], "");

                    result = JSON.parse(extract[0]);
                    console.log("Meta extract", result);
                } catch(ex) {
                    console.error("Failed to parse text extraction");
                }
            }

            result.html = stdout;

            res.setHeader('Content-Type', 'application/json');
            res.send(result);
        });
    } else {
        console.log("No url");
        res.status(500).send('Error: url parameter not found.');
    }
});

const listener = app.listen(port, '0.0.0.0', () => {
    console.log(`Server is listening on ${JSON.stringify(listener.address())}`);
});