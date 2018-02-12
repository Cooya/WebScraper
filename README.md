# Web Scraper

Web scraper on top of PhantomJS or Chromium.  
If you chose to use PhantomJS, the module is designed as a connection client/server between the PhantomJS web scraper server and a client acting like a driver and sending scraping HTTP requests to the server.  
Chromium is different because it is driven directly from NodeJS.

## Installation
```
npm install @coya/web-scraper
```

## Build (for dev)
```
git clone https://github.com/Cooya/WebScraper
cd WebScraper
npm install // it will also install the development dependencies
npm install phantomjs -g // if you need PhantomJS, install it globally
npm run build
npm run example // run the example script in "examples" folder
```

## Usage examples
The package allows to inject JS function :
```javascript
const { ChromiumScraper } = require('@coya/web-scraper');

// if you want to use PhantomJS instead of Chromium
// const { PhantomScraper } = require('@coya/web-scraper');

const scraper = ChromiumScraper.getInstance();

const getLinks = function() { // return all links from the requested page
    return $('a').map(function(i, elt) {
        return $(elt).attr('href');
    }).get();
};

scraper.request({
    url: 'cooya.fr',
    fct: getLinks // function injected in the page environment
})
.then(function(result) {
    console.log(result); // returned value of the injected function
    scraper.close(); // close the headless browser
}, function(error) {
    console.error(error);
    scraper.close();
});
```

Or to inject JS function from an external script :
```javascript
const { ChromiumScraper } = require('@coya/web-scraper');

// if you want to use PhantomJS instead of Chromium
// const { PhantomScraper } = require('@coya/web-scraper');

const scraper = ChromiumScraper.getInstance();

scraper.request({
    url: 'cooya.fr',
    fct: __dirname + '/externalScript.js', // external script exporting the function to be injected
})
.then(function(result) {
    console.log(result); // returned value of the injected function
    scraper.close(); // close the headless browser
}, function(error) {
    console.error(error);
    scraper.close();
});
```
externalScript.js :
```javascript
module.exports = function() { // return all links from the requested page
    return $('a').map(function(i, elt) {
        return $(elt).attr('href');
    }).get();
};
```

## Methods

### ScraperClient.getInstance()

The ScraperClient object is a singleton, only one client can be created, so this method is required to get the client instance.

### request(params)

Send a request to a specific url and inject JavaScript into the page associated. Return a promise with the result in parameter.

Parameter | Type    | Description | Default value
--------  | ---     | --- | ---
params  | object | see below for details about this | none

### close()

Terminate the PhantomJS web scraper process that will allow to end the current NodeJS script properly.

### Request parameters spec

Parameter | Type    | Description | Required
--------  | ---     | --- | ---
url  | string | target url | yes
fct | function | JS function to inject into the page | yes
fct | string | path to script path and function to inject separated by hash key (e.g. "path/to/script/script.js#functionToCall") | yes
referer | string | referer header parameter set in each request | optional
args | object | object passed to the injected function | optional
debug | boolean | enable the debug mode (verbose) | optional
