# Web Scraper

Web scraper based on PhantomJS, designed as a connection client/server between the PhantomJS web scraper server and a client acting like a driver and sending scraping HTTP requests to the server.

## Installation
```
npm install @coya/web-scraper
```

## Usage examples
The package allows to inject JS function (from the same file) :
```javascript
const { ScraperClient } = require('@coya/web-scraper');

const getLinks = function() { // return all links from the requested page
    return $('a').map(function(i, elt) {
        return $(elt).attr('href');
    }).get();
};

const scraperClient = ScraperClient.getInstance();

scraperClient.request({
    url: 'nicodev.fr',
    function: getLinks // function injected in the page environment
})
.then(function(result) {
    console.log(result); // return value of the injected function
    scraperClient.closeScraper(); // end the client/server connection and kill the web scraper subprocess
}, function(error) {
    console.error(error);
    scraperClient.closeScraper();
});
```

Or to inject JS function from an external script :
```javascript
const { ScraperClient } = require('@coya/web-scraper');

const scraperClient = ScraperClient.getInstance();

scraperClient.request({
    url: 'nicodev.fr',
    scriptPath: __dirname + '/externalScript.js', // external script exporting the function to be injected
})
.then(function(result) {
    console.log(result); // return value of the injected function
    scraperClient.closeScraper(); // end the client/server connection and kill the web scraper subprocess
}, function(error) {
    console.error(error);
    scraperClient.closeScraper();
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

### closeScraper()

Terminate the PhantomJS web scraper process that will allow to end the current NodeJS script properly.

### Request parameters spec

Parameter | Type    | Description | Required
--------  | ---     | --- | ---
url  | string | target url | yes
scriptPath | string | absolute path of the JS script to inject | optional
function | string or function | if string, it will be the name of the function to call from the injected script ("scriptPath" must be specified too), if function, it will be a function injected into the page | optional
args | object | object passed to the called function | optional
