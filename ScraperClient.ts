declare const Promise;

import child_process = require('child_process');
import http = require('http');
import path = require('path');
import ps = require('ps-node');
import * as Logs from '@coya/logs';

const SCRAPER_FILE = './PhantomScraper.js';

export class ScraperClient {
	private static self = null;
	readonly hostname;
	readonly port;
	readonly requestsLimitBeforeReboot;
	readonly timeout;
	readonly logs;
	private scraperProcess;
	private requestsQueue;
	private requestsCounter;
	private requestsFailedInARow;

	private constructor(config) {
		this.hostname = 'localhost';
		if(config) {
			this.port = config.port || 8080;
			this.requestsLimitBeforeReboot = config.requestsLimitBeforeReboot || 10;
			this.timeout = config.timeout || 30000;
		}
		else {
			this.port = 8080;
			this.requestsLimitBeforeReboot = 10;
			this.timeout = 30000;
		}
		this.logs = new Logs('scraper_client', config);
		this.scraperProcess = null;
		this.requestsQueue = [];
		this.requestsCounter = 0;
		this.requestsFailedInARow = 0;
	}

	public static getInstance(config) {
		if(ScraperClient.self == null)
			ScraperClient.self = new ScraperClient(config);
		return ScraperClient.self;
	}

	private runScraper(): Promise<any> {
		if(this.scraperProcess)
			return Promise.resolve();

		return this.killExistingProcessIfExists()
		.then(() => {
			return new Promise((resolve, reject) => {
				this.logs.info('Starting web scraper server...');
				this.scraperProcess = child_process.exec('phantomjs ' + path.join(__dirname, SCRAPER_FILE) + ' ' + this.port, {cwd: __dirname});
				if(!this.scraperProcess)
					reject('The web scraper creation process has failed');

				this.scraperProcess.on('exit', (code) => {
					this.scraperProcess = null;
					if(!this.requestsQueue.length) // unexpected exit
						this.logs.error('The web scraper has crashed unexpectedly (code = ' + code + ').');
					this.runScraper() // restart the server
					.then(this.processRequestsQueue.bind(this), reject); // restarting to process the requests queue
				});

				this.scraperProcess.stderr.on('data', (data) => {
					this.logs.warning(data);
				});

				this.scraperProcess.stdout.on('data', (data) => {
					let lines = data.trim().split('\n');
					for(let line of lines)
						if(line == 'ready') { // server is ready
							this.logs.info('Web scraper ready.');
							resolve();
						}
						else
							this.logs.debug(line);
				});
			});
		});
	}

	private processRequestsQueue() {
		if(!this.requestsQueue.length) {
			this.logs.error('Fatal error : bad call to function "processRequestsQueue()".');
			process.exit(1);
		}

		if(++this.requestsCounter >= this.requestsLimitBeforeReboot) { // need to reboot phantomJS for avoid too much memory consumption
			this.requestsCounter = 0;
			this.sendExitRequest(); // and then wait for the "exit" event above
		}
		else {
			const currentRequest = this.requestsQueue[0];
			this.logs.info('Requesting page with url = "' + currentRequest.parameters.url + '"...');
			this.sendRequest(JSON.stringify(currentRequest.parameters))
			.then((result) => { // the request has succeeded
				this.requestsQueue.shift();
				if(this.requestsQueue.length)
					this.processRequestsQueue();
				currentRequest.resolve(result);
			}, currentRequest.reject);
		}
	}

	private sendRequest(params) {
		const opts = {
			hostname: this.hostname,
			port: this.port,
			path: '/',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(params)
			},
			timeout: this.timeout
		};

		return new Promise((resolve, reject) => {
			(function send() {
				const request = http.request(opts, (res) => {
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
							catch(e) {
								reject({error: 'json_parse_error', data: data}); // fatal error
								return;
							}
							if(data['error']) {
								if(data['error'] == 'page_opening_failed') {
									this.logs.warning('The page opening has failed, status : "' + data['status'] + '".');
									if(++this.requestsFailedInARow < 10)
										send.call(this); // try again
									else {
										this.requestsCounter = 0;
										this.requestsFailedInARow = 0;
										this.sendExitRequest(); // restart the scraper
									}
								}
								else
									reject(data); // fatal error
							}
							else {
								this.requestsFailedInARow = 0;
								resolve(data['result']); // the request has succeeded
							}
						}
					});
				});

				request.on('error', (error) => {
					if(error['code'] == 'ECONNRESET') {
						this.logs.warning('The connection to the scraper server has been reset.');
						send.call(this); // try again
					}
					else
						reject(error); // fatal error
				});

				request.write(params);
				request.end();
			}).call(this);
		});
	}

	private sendExitRequest() {
		this.logs.info('Sending exit request to scraper server...');
		return this.sendRequest(JSON.stringify({exit: true}))
		.then((result) => {
			if(result != 'ok') {
				this.logs.error(result);
				this.logs.warning('Scraper server does not want to exit. Killing process by force...');
				this.scraperProcess.kill();
			}
		});
	}

	private killExistingProcessIfExists() {
		return new Promise((resolve, reject) => {
			ps.lookup({command: 'phantomjs',}, (err, processList) => {
				if(err)
					return reject(new Error(err));

				if(!processList.length)
					return resolve();

				processList.forEach((process) => {
					ps.kill(process.pid, 'SIGKILL', (err) => {
						if(err)
							return reject(new Error(err));
						this.logs.info('Existing PhantomJS process killed.');
						resolve();
					});
				});
			});
		});
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

		return new Promise((resolve, reject) => {
			this.requestsQueue.push({
				resolve: resolve,
				reject: reject, // scraper errors are rejected here
				parameters: params
			});
			if(this.requestsQueue.length == 1) {
				this.runScraper()
				.then(this.processRequestsQueue.bind(this))
				.catch(reject);
			}
		});
	}

	public closeScraper() {
		this.scraperProcess.removeAllListeners('exit'); // to avoid restarting the scraper
		return this.sendExitRequest()
		.then(() => {
			this.scraperProcess = null;
			this.requestsQueue = [];
			this.requestsCounter = 0;
			this.logs.info('Web scraper process done and connection closed.');
		});
	}
}