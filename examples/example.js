const { ScraperClient } = require('../js/ScraperClient.js');

const getLinks = function() {
	return $('a').map(function(i, elt) {
		return $(elt).attr('href');
	}).get();
};

const scraperClient = ScraperClient.getInstance();

scraperClient.request({
	url: 'nicodev.fr',
	function: getLinks,
	args: {}
})
.then(function(result) {
	console.log(result);
	scraperClient.closeScraper();
}, function(error) {
	console.error(error);
	scraperClient.closeScraper();
});