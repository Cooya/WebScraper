import * as Logs from '@coya/logs';
import * as fs from 'fs';
const puppeteer = require('puppeteer');

const JQUERY_PATH = __dirname + '/resources/jquery.js';
const COOKIE_JAR = __dirname + '/resources/cookies.json';
const DEBUG_SCREENSHOT = __dirname + '/resources/debug.png';

interface Req {
	url: string,
	fct: Function,
	args?: Object,
	referer?: string,
	debug?: boolean
}

export class WebScraper {
	private static self = null;
	readonly logs;
	readonly requestsLimitBeforeReboot;
	private browser;
	private requestsQueue;
	private globalRequestsCounter;
	private requestsCounter;

	private constructor(config = {requestsLimitBeforeReboot: 100}) {
		this.logs = new Logs('web_scraper', config);
		this.requestsLimitBeforeReboot = config.requestsLimitBeforeReboot;
		this.browser = null;
		this.requestsQueue = [];
		this.globalRequestsCounter = 0;
		this.requestsCounter = 0;
	}

	public static getInstance(config) {
		if(WebScraper.self == null)
			WebScraper.self = new WebScraper(config);
		return WebScraper.self;
	}

	public request(req: Req) { // append a user request into the requests queue
		return new Promise(async (resolve, reject) => {
			if(!req.url)
				return reject('"url" parameter is required.');
			if(!req.fct)
				return reject('"fct" parameter is required.');

			if(!req.url.startsWith('http://') && !req.url.startsWith('https://'))
				req.url = 'http://' + req.url;

			this.requestsQueue.push({
				resolve: resolve,
				reject: reject, // scraper errors are rejected here
				content: req
			});

			if(this.requestsQueue.length == 1) // requests queue need to be processed
				this.processRequestsQueue();
		});
	}

	public async close(params = {clear: false}) {
		await this.browser.close();
		this.browser = null;
		this.requestsCounter = 0;

		if(params.clear)
			this.requestsQueue = [];
	}

	private processRequestsQueue() {
		if(!this.requestsQueue.length) { // never happens
			this.logs.error('Fatal error : bad call to function "processRequestsQueue()".');
			process.exit(1);
		}

		const currentRequest = this.requestsQueue[0];
		this.scrap(currentRequest.content)
		.then((res: any) => {
			this.requestsQueue.shift();
			if(this.requestsQueue.length)
				this.processRequestsQueue();
			if(res.err)
				currentRequest.reject(res.err);
			else
				currentRequest.resolve(res.result);
		}); // no possible rejection
	}

	private async scrap(req: Req) {
		try {
			if(!this.browser) {
				this.logs.info('Starting headless browser...');
				this.browser = await puppeteer.launch({
					args: ['--no-sandbox', '--disable-setuid-sandbox'],
					devtools: false,
					headless: true,
					ignoreHTTPSErrors: true
				});
				this.logs.info('Headless browser started.');
			}

			this.logs.info('Requesting page with url = "' + req.url + '"...');
			const page = await this.createPage(req.referer, req.debug);
			await page.goto(req.url, {waitUntil: 'domcontentloaded'});
			await page.addScriptTag({path: JQUERY_PATH});
			const result = await page.evaluate(req.fct, req.args);
			if(req.debug)
				await page.screenshot({path: DEBUG_SCREENSHOT, fullPage: true});
			await this.saveCookies(COOKIE_JAR, page);
			await page.close();

			this.globalRequestsCounter++;
			if(++this.requestsCounter >= this.requestsLimitBeforeReboot)
				await this.close();
			return {result: result};
		}
		catch(e) {
			this.logs.error(e);
			return {err: 'An error has occurred while trying to access to the page.'};
		}
	}

	private async createPage(referer: string, debug: boolean) {
		this.logs.debug('Creating new page...');

		const defaultViewport = {
			deviceScaleFactor: 1,
			hasTouch: false,
			height: 1024,
			isLandscape: false,
			isMobile: false,
			width: 1280
		};

		const page = await this.browser.newPage();
		await page.setViewport(defaultViewport);
		//await page.setUserAgent('Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:57.0) Gecko/20100101 Firefox/57.0');
		await page.setRequestInterception(true);
		await this.loadCookies(COOKIE_JAR, page);

		page.on('request', req => {
			if(req.url.match(/\.(png|jpg|jpeg|gif)$/)) // avoid images loading
				req.abort();
			else
				req.continue();
		});

		if(debug) {
			page.once('load', () => {
				this.logs.debug('Page loaded.');
			});
			page.on('console', msg => {
				this.logs.info(msg);
			});
			page.on('error', err => {
				this.logs.error(err);
			});
			page.on('pageerror', err => {
				this.logs.error(err);
			});
			page.on('requestfailed', req => {
				if(!req.url.match(/\.(png|jpg|jpeg|gif)$/))
					this.logs.warning('Request failed : ' + req.url);
			});
			/*page.on('requestfinished', req => {
				this.logs.debug('Request finished : ' + req.url);
			});*/
			page.on('response', res => {
				this.logs.debug('Response received : ' + res.url);
			});
		}

		if(referer)
			await page.setExtraHTTPHeaders({
				'Referer': referer
				//'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				//'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
				//'Accept-Encoding': 'gzip, deflate, br',
				//'Connection': 'keep-alive',
				//'Pragma': 'no-cache',
				//'Cache-Control': 'no-cache'
			});

		this.logs.debug('Page created.');
		return page;
	}

	private loadCookies(cookiesFile: string, page) {
		this.logs.debug('Loading cookies...');
		return new Promise((resolve, reject) => {
			fs.readFile(cookiesFile, async (err, cookies: any) => {
				if(err && err.code != 'ENOENT')
					reject(err);

				if(!err && cookies) {
					cookies = JSON.parse(cookies);
					if(Array.isArray(cookies))
						for(let cookie of cookies) {
							try {
								await page.setCookie(cookie);
							}
							catch(e) {} // sometimes it may fail (when "expires" value is not an integer for example)
						}
				}
				this.logs.debug('Cookies loaded.');
				resolve();
			});
		});
	}

	private saveCookies(cookiesFile: string, page) {
		this.logs.debug('Saving cookies...');
		return new Promise(async (resolve, reject) => {
			fs.writeFile(cookiesFile, JSON.stringify(await page.cookies()), ((err) => {
				if(err)
					reject(err);
				this.logs.debug('Cookies saved.');
				resolve();
			}));
		});
	}
}