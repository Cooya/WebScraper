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
