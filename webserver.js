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
			res.setHeader('Content-Type', 'text/html');
			res.send(stdout);
		});
	} else {
		console.log("No url");
		res.status(500).send('Error: url parameter not found.');
	}
});

const listener = app.listen(port, '0.0.0.0', () => {
	console.log(`Server is listening on ${JSON.stringify(listener.address())}`);
});
