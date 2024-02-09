'use strict';

const cp = require('child_process');
const express = require('express');

const SINGLEFILE_EXECUTABLE = '/opt/app/node_modules/single-file/cli/single-file';
const BROWSER_PATH = '/opt/google/chrome/google-chrome';
const BROWSER_ARGS = ['--no-sandbox'];

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
			'--browser-load-max-time=20000',
			'--browser-script=extract-inject.js',
			'--browser-ignore-insecure-certs=true',
			'--browser-executable-path=' + BROWSER_PATH,
			'--browser-args=\'' + JSON.stringify(BROWSER_ARGS) + '\'',
			url,
			'--dump-content',
		];

		cp.execFile(SINGLEFILE_EXECUTABLE, args, (e, stdout, stderr) => {
			if(e) {
				console.log(e);
				res.status(500).send('Error: ' + e);
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

			// Do we have a text-extract in the HTML? (see extract-inject.js)
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
