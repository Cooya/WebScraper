const { ChromeScraper } = require('../js/entryPoint');

const getLinks = function() {
	return $('a').map(function(i, elt) {
		return $(elt).attr('href');
	}).get();
};

const scraper = new ChromeScraper({executionMode: 'debug'});

scraper.request({
	url: 'cooya.fr',
	fct: getLinks,
	debug: true
})
.then(function(result) {
	console.log(result);
	scraper.close();
}, function(error) {
	console.error(error);
	scraper.close();
});