declare const Promise;

import child_process = require('child_process');
import http = require('http');
import path = require('path');
import * as Logs from '@coya/logs';

const HOSTNAME = 'localhost';
const PORT = 8080;
const SCRAPER_FILE = './PhantomScraper.js';
const REQUESTS_LIMIT_BEFORE_REBOOT = 10;

export class ScraperClient {
	private static self = null;
	private logs;
	private scraperProcess;
	private requestsQueue;
	private requestsCounter;

	private constructor() {
		this.logs = new Logs('scraper_client');
		this.scraperProcess = null;
		this.requestsQueue = [];
		this.requestsCounter = 0;
	}

	public static getInstance() {
		if(ScraperClient.self == null)
			ScraperClient.self = new ScraperClient();
		return ScraperClient.self;
	}

	private runScraper(): Promise<any> {
		if(this.scraperProcess)
			return Promise.resolve();

		const self = this;

		return new Promise(function(resolve, reject) {
			self.logs.info('Starting web scraper server...');
			self.scraperProcess = child_process.exec('phantomjs ' + path.join(__dirname, SCRAPER_FILE), {cwd: __dirname});
			if(!self.scraperProcess)
				reject('The web scraper creation process has failed');

			self.scraperProcess.on('exit', function(code) {
				self.scraperProcess = null;
				if(!self.requestsQueue.length) // unexpected exit
					self.logs.error('The web scraper has crashed unexpectedly (code = ' + code + ').');
				self.runScraper() // restart the server
				.then(self.processRequestsQueue.bind(self), reject); // restarting to process the requests queue
			});

			self.scraperProcess.stderr.on('data', function(data) {
				self.logs.error(data);
			});

			self.scraperProcess.stdout.on('data', function(data: string) {
				let lines = data.trim().split('\n');
				for(let line of lines)
					if(line == 'ready') { // server is ready
						self.logs.info('Web scraper ready.');
						resolve();
					}
					else
						self.logs.warning(line);
			});
		});
	}

	private processRequestsQueue() {
		if(!this.requestsQueue.length)
			this.exit('Bad call to function "processRequestsQueue()".');

		if(++this.requestsCounter >= REQUESTS_LIMIT_BEFORE_REBOOT) { // need to reboot phantomJS for avoid too much memory consumption
			this.requestsCounter = 0;
			this.logs.info('Sending exit request to scraper server...');
			this.sendRequest(JSON.stringify({exit: true}))
			.then(function(result) {
				if(result != 'ok')
					this.exit('Scraper server does not want to exit.');
			}.bind(this), this.exit);
		}
		else {
			const currentRequest = this.requestsQueue[0];
			this.logs.info('Requesting page with url = "' + currentRequest.parameters.url + '"...');
			this.sendRequest(JSON.stringify(currentRequest.parameters))
			.then(function(result) { // the request has succeeded
				this.requestsQueue.shift();
				if(this.requestsQueue.length)
					this.processRequestsQueue();
				currentRequest.resolve(result);
			}.bind(this), currentRequest.reject);
		}
	}

	private sendRequest(params) {
		const self = this;
		const opts = {
			hostname: HOSTNAME,
			port: PORT,
			path: '/',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(params)
			},
			timeout: 30000
		};

		return new Promise(function(resolve, reject) {
			(function send() {
				const request = http.request(opts, function(res) {
					let data = '';
					res.on('data', (chunk) => {
						data += chunk;
					});
					res.on('end', () => {
						if(data == '')
							reject({error: 'scraper_down'}); // fatal error
						else {
							try {
								data = JSON.parse(data);
							}
							catch (e) {
								reject({error: 'json_parse_error', data: data}); // fatal error
								return;
							}
							if(data['error']) {
								if (data['error'] == 'page_opening_failed') {
									self.logs.warning('The page opening has failed.');
									setTimeout(send.bind(self)); // try again
								}
								else
									reject(data); // fatal error
							}
							else
								resolve(data['result']); // the request has succeeded
						}
					});
				});

				request.on('error', function(error) {
					if(error['code'] == 'ECONNRESET') {
						self.logs.warning('The connection to the scraper server has been reset.');
						setTimeout(send.bind(self)); // try again
					}
					else
						reject(error); // fatal error
				});

				request.write(params);
				request.end();
			})();
		});
	}

	private exit(error) {
		this.scraperProcess.removeAllListeners('exit');
		this.scraperProcess.kill();
		if(error) {
			this.logs.error(error);
			process.exit(1);
		}
		else
			process.exit(0);
	}

	public request(params) {
		if(!params.url)
			return Promise.reject('"url" parameter is required.');
		if(!params.scriptPath) {
			if(!params.function)
				return Promise.reject('"scriptPath" or/and "function" parameters are required.');
			else
				params.function = params.function.toString();
		}

		if(!params.url.startsWith('http://') && !params.url.startsWith('https://'))
			params.url = 'http://' + params.url;

		return new Promise(function(resolve, reject) {
			this.requestsQueue.push({
				resolve: resolve,
				reject: reject, // scraper errors are rejected here
				parameters: params
			});
			if(this.requestsQueue.length == 1) {
				this.runScraper()
				.then(this.processRequestsQueue.bind(this), this.exit); // connection errors are caught here
			}
		}.bind(this));
	}

	public closeScraper() {
		this.scraperProcess.removeAllListeners('exit');
		return this.sendRequest(JSON.stringify({exit: true}))
		.then(function(result) {
			if(result != 'ok')
				this.exit('Scraper server does not want to exit.');
			else {
				this.scraperProcess = null;
				this.requestsQueue = [];
				this.requestsCounter = 0;
				this.logs.info('Web scraper process done and connection closed.');
			}
		}.bind(this), this.exit);
	}
}