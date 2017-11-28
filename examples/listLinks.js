const { ScraperClient } = require('../js/ScraperClient.js');

const getLinks = function() {
	return $('a').map(function(i, elt) {
		return $(elt).attr('href');
	}).get();
};

const scraperClient = ScraperClient.getInstance({
	port: 8888,
	//executionMode: 'prod',
	//logsFilePath: 'logs.html'
});

scraperClient.request({
	url: 'nicodev.fr',
	function: getLinks
})
.then(function(result) {
	console.log(result);
	scraperClient.closeScraper();
}, function(error) {
	console.error(error);
	scraperClient.closeScraper();
});