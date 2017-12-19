const {WebScraper} = require('../js/WebScraper.js');

const getLinks = function() {
	return $('a').map(function(i, elt) {
		return $(elt).attr('href');
	}).get();
};

const scraper = new WebScraper({executionMode: 'debug'});

scraper.request({
	url: 'cooya.fr',
	fct: getLinks,
	debug: false
})
.then(function(result) {
	console.log(result);
	scraper.close();
}, function(error) {
	console.error(error);
	scraper.close();
});