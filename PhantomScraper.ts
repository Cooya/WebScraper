declare const phantom;

const fs = require('fs');
const server = require('webserver').create();
const system = require('system');
const webpage = require('webpage');

const JQUERY_PATH = './resources/jquery.js';
const COOKIE_JAR = './resources/cookies.json';
const DEBUG_SCREENSHOT = './resources/debug.png';

class PhantomScraper {
	private scripts;

	constructor() {
		this.scripts = [];
		PhantomScraper.importCookies();

		server.listen('127.0.0.1:' + system.args[1], function(request, response) {
			response.statusCode = 200;
			let req;
			try {
				req = JSON.parse(request.post);
			}
			catch(e) {
				response.write('{"error": "json_parse_failed", "msg": "The request JSON parsing has failed."}');
				response.close();
				return;
			}

			if(req.exit) { // exit request
				response.write('{"result": "ok"}');
				response.close();
				phantom.exit(0);
				return;
			}

			if(req.scriptPath && !this.scripts[req.scriptPath])
				this.scripts[req.scriptPath] = require(req.scriptPath);

			if(!req.args)
				req.args = {};

			let action;
			if(req.scriptPath) { // evaluate a function in a file
				action = req.function ? this.scripts[req.scriptPath][req.function] : this.scripts[req.scriptPath];
				req.args.evaluationType = 'file';
			}
			else { // evaluate a function in a string
				action = req.function;
				req.args.evaluationType = 'string';	
			}

			PhantomScraper.scrap(req.url, action, req.args, function(result) {
				response.write(JSON.stringify(result));
				response.close();
			});
		}.bind(this));
		console.log('ready');
	}

	private static createPage(referer: string, debugMode: boolean) {
		const page = webpage.create();
		if(debugMode) {
			page.onError = function(msg, trace) {
				console.error(msg);
			};
			page.onResourceError = function(resourceError) {
				console.error(resourceError);
			};
			page.onResourceTimeout = function(request) {
				console.error('Timeout resource : ' + JSON.stringify(request));
			};

			page.onResourceRequested = function(request) {
				console.log(JSON.stringify(request, undefined, 4));
			};
			page.onConsoleMessage = function(msg, lineNum, sourceId) {
				console.log(msg);
			};
			page.onLoadStarted = function() {
				console.log('Page loading started.');
			};
			page.onLoadFinished = function() {
				console.log('Page loading finished.');
			};
			page.onNavigationRequested = function(url, type, willNavigate, main) {

			};
		}

		page.onResourceReceived = function() {
			fs.write(COOKIE_JAR, JSON.stringify(phantom.cookies), 'w');
		};
		page.settings.userAgent = 'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:56.0) Gecko/20100101 Firefox/56.0';
		page.settings.loadImages = false;
		page.settings.loadPlugins = false;
		page.settings.javascriptEnabled = true;
		page.settings.resourceTimeout = 30000;
		page.customHeaders = {
			'Referer': referer,
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
			//'Accept-Encoding': 'gzip, deflate, br',
			'Connection': 'keep-alive',
			'Pragma': 'no-cache',
			'Cache-Control': 'no-cache'
		};
		page.viewportSize = {width: 1600, height: 900};
		return page;
	}

	private static closePage(page) {
		page.clearMemoryCache();
		page.close();
		page = null;
	}

	private static importCookies() {
		if(fs.isFile(COOKIE_JAR)) {
			try {
				let cookies = JSON.parse(fs.read(COOKIE_JAR));
				for(let cookie of cookies)
					phantom.addCookie(cookie);
			}
			catch(e) {

			}
		}
	}

	private static scrap(url, action, args, callback) {
		let page = PhantomScraper.createPage(args.referer, args.debug);

		page.open(url, function(status) {
			try {
				if(status !== 'success' || !page.evaluateJavaScript('function() { return !!document.body; }')) {
					PhantomScraper.closePage(page);
					callback({error: 'page_opening_failed', msg: 'An error has occurred when opening the page.', status: status});
				}
				else {
					if(args.debug) page.render(DEBUG_SCREENSHOT);
					if(page.injectJs(JQUERY_PATH)) {
						if(args.complex) {
							action(page, waitFor, args, function(result) {
								PhantomScraper.closePage(page);
								callback({result: result})
							});
						}
						else {
							let result;
							if(args.evaluationType == 'file')
								result = page.evaluate(action, args);
							else
								result = page.evaluateJavaScript(action);
							PhantomScraper.closePage(page);
							callback({result: result});
						}
					}
					else {
						PhantomScraper.closePage(page);
						callback({error: 'script_injection_failed', msg: 'The script injection has failed.'});
					}
				}
			} catch(e) {
				PhantomScraper.closePage(page);
				callback({error: e});
			}
		});
	}
}

new PhantomScraper();

// https://github.com/ariya/phantomjs/blob/master/examples/waitfor.js
const waitFor = function(testFct, readyFct, timeOutMillis) {
	let maxtimeOutMillis = timeOutMillis ? timeOutMillis : 3000,
	start = new Date().getTime(),
	condition = false,
	interval = setInterval(function() {
		if((new Date().getTime() - start < maxtimeOutMillis) && !condition)
			condition = testFct();
		else {
			clearInterval(interval);
			readyFct(!condition);
		}
	}, 250);
};