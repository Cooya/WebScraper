const { ScraperClient } = require('../js/ScraperClient.js');

const getLinks = function() {
	return $('a').map(function(i, elt) {
		return $(elt).attr('href');
	}).get();
};

const scraperClient = ScraperClient.getInstance({
	port: 8888,
	executionMode: 'debug',
	//logsFilePath: 'logs.html'
});

scraperClient.request({
	url: 'cooya.fr',
	function: getLinks,
	args: {
		debug: true
	}
})
.then(function(result) {
	console.log(result);
	scraperClient.closeScraper();
}, function(error) {
	console.error(error);
	scraperClient.closeScraper();
});