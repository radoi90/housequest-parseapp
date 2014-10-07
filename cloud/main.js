var zoopla_api_key = 'ws9n766jdafxqb5btb6ad7v8',
	zoopla_api_url = 'http://api.zoopla.co.uk/api/v1/property_listings.json';

var featureList = ["dishwasher","garden","parking","balcony","gym","swimming pool","gated","bills included"];

Parse.Cloud.job("zooplaClone", function(request, status) {
	Parse.Cloud.useMasterKey();

	console.log("Fetching last fetch job information");
	
	var FetchJob = Parse.Object.extend("FetchJob");
	var jobQuery = new Parse.Query(FetchJob);
	jobQuery.descending("createdAt");

	jobQuery.first().then(
		function(latestJob) {
			console.log("Setting up current fetch job");
 			var currentJob = createJob(latestJob);

 			console.log("Cloning up to ID: " + currentJob.get("limitId") +
 						 " or date: " + currentJob.get("limitDate"));

 			return currentJob.save();
		},
		function(error) {
			console.error('Error ' + error.code + " " + error.message);
			status.error("Cloning failed, error fetching last job information.");
		}
	).then(
		function(currentJob) {
			// Zoopla queries show max 100 results per page
			var pageNumber = 1, pageSize = 100;

			console.log("Begining fetch");
			return fetchPage(pageNumber, pageSize, currentJob);
		},
		function(error){
			console.error('Error ' + error.code + " " + error.message);
			status.error("Cloning failed, error saving job information.");
		}
	).then(
		function(completedJob) {
			console.log("Getting batch size");

			var promise = new Parse.Promise();
			var statsQuery = new Parse.Query(Listing);
			statsQuery.limit(1000);
			statsQuery.equalTo("batchNo", completedJob.get("batchNo"));
			statsQuery.count({
				success: function(batchSize) {
					completedJob.set("batchSize", batchSize);
					promise.resolve(completedJob);
				},
				error: function(error) {
					promise.reject(error);
				}
			});

			return promise;
		},
		function(error) {
			status.error("Cloning failed, error fetching data");
		}
	).then(
		function(completedJob) {
			console.log("Saving job, finished at " + completedJob.get("finishedAt"));
			
			return completedJob.save();
		},
		function(error) {
			status.error("Cloning failed, error fetching batch size");
		}
	).then(
		function(savedJob) {
			console.log("Successful job, added " + savedJob.get("batchSize") + ". Exiting.")
			status.success("Cloning finished.");
		},
		function(error) {
			console.error('Error ' + error.code + " " + error.message);
			status.error("Cloning failed, error saving job information.");
		}
	);
});

function createJob(prevJob) {
	var FetchJob = Parse.Object.extend("FetchJob");
	var newJob = new FetchJob();
	
	// Date limit is properties 3 days old, applies to inception job.
	var dateLimit = new Date();
	dateLimit.setDate(dateLimit.getDate() - 3);
	
	newJob.set({
		source		: "Zoopla",
		batchNo		: prevJob.get("batchNo") + 1,
		batchSize	: 0,
		startedAt	: new Date(),
		firstId		: prevJob.get("firstId"),	//in case of empty batch
		limitId		: prevJob.get("firstId"),
		limitDate	: dateLimit
	});

	return newJob;
}

function createListingObject(zooplaData) {
	var geometry = require('cloud/boroughs.js');

	var Listing = Parse.Object.extend("Listing");
	var listing = new Listing();

	// Add extra properties
	if (!zooplaData.latitude || !zooplaData.longitude) {
		console.warn("No location data, id: " + zooplaData.listing_id);
	} else {
		var point = new Parse.GeoPoint({
			latitude: zooplaData.latitude,
			longitude: zooplaData.longitude
		});
		zooplaData.location = point;
		zooplaData.borough = geometry.getBorough(zooplaData.location);
	}
	
	zooplaData.price_per_month = parseInt(zooplaData.rental_prices.per_month);
	zooplaData.price_per_week = parseInt(zooplaData.rental_prices.per_week);

	// Parse Strings as Numbers and update
	zooplaData.last_published_date = parseZooplaDate(zooplaData.last_published_date);
	zooplaData.first_published_date = parseZooplaDate(zooplaData.first_published_date);

	zooplaData.listing_id = parseInt(zooplaData.listing_id);
	zooplaData.num_bathrooms = parseInt(zooplaData.num_bathrooms);
	zooplaData.num_bedrooms = parseInt(zooplaData.num_bedrooms);
	zooplaData.num_floors 	= parseInt(zooplaData.num_floors);
	zooplaData.num_recepts = parseInt(zooplaData.num_recepts);

	// Remove API key from url
	var qMark = zooplaData.details_url.indexOf("?");
	zooplaData.details_url = zooplaData.details_url.substring(0, qMark);

	// Delete unnecesary properties
	delete zooplaData.country;
	delete zooplaData.county;
	delete zooplaData.image_caption;
	delete zooplaData.latitude;
	delete zooplaData.longitude;
	delete zooplaData.post_town;
	delete zooplaData.price;
	delete zooplaData.rental_prices;

	listing.set(zooplaData);
	listing.set("source","Zoopla");

	return listing;
}

var reachedLimit = false;
// Zoopla API doesn't return listings sorted by *_published_date, check a few pages after limit
var extraPagesToGo = 3;

function fetchPage(pageNumber,pageSize,currentJob) {
	var _ = require('underscore');

	console.log("Fetching listings: " + pageSize * (pageNumber - 1) + "-" + pageSize * pageNumber);

	var promise = new Parse.Promise();
	var listingsToSave = [];

    Parse.Cloud.httpRequest({
		url: zoopla_api_url,
		headers: {
    		'Content-Type': 'application/json;charset=utf-8'
  		},
		params: {
		    area 			: 'London',
		    listing_status	: 'rent',
		    page_size		: pageSize,
		    page_number		: pageNumber,
		    order_by		: 'age',
		    summarised		: true,
		    api_key			: zoopla_api_key
	  	}
	}).then(
	  	function(httpResponse) {
	  		if (!reachedLimit) {
	  			console.log("Fetched page: " + pageNumber);
	  		} else {
	  			extraPagesToGo = extraPagesToGo - 1;
	  			console.log("Fetched extra page, to go: " + extraPagesToGo);
	  		}

	  		var scrapePromises = [];

	  		for (var i = 0; i < httpResponse.data.listing.length; i++) {
				var zooplaData = httpResponse.data.listing[i];
				var listing = createListingObject(zooplaData);
				listing.set("batchNo", currentJob.get("batchNo"));

				if ((listing.get("last_published_date") < currentJob.get("limitDate")) && (!reachedLimit)) {
					console.log("Reached date limit at listing_id: " + listing.get("listing_id") +
								". Checking");
					reachedLimit = true;
				} else if ((listing.get("listing_id") == currentJob.get("limitId")) && (!reachedLimit)) {
					console.log("Reached last added id: " + listing.get("listing_id"));
					reachedLimit = true;
				}

				if (i == 0 && pageNumber == 1)
					currentJob.set("firstId", listing.get("listing_id"));
				listing.set("afterLimit", reachedLimit);

				listingsToSave.push(listing);

				scrapePromises.push(
		        	Parse.Cloud.httpRequest({
		          		url: listing.get("details_url")
		        	})
		    	);
			}

			return Parse.Promise.when(scrapePromises);
	  	},
	  	function(httpResponse) {
			console.error('Request failed with response code ' + httpResponse.status);
			promise.reject(httpResponse.status);
		}
	).then(
		function() {
			console.log("Scraping listing HTML pages");
			// Parse the html for all the visited pages, add data to listing object
			for(var i = 0; i < arguments.length; i++) {
				var listing = listingsToSave[i];
				var connectionStatus = arguments[i].status; //200 OK, 300 listing gone
				var htmlString = arguments[i].text;
				delete arguments[i].text;

				if (connectionStatus == "200") {
					listing.set("image_urls", extractImageURLs(htmlString)); 
					htmlString = trimText(htmlString).toLowerCase(); // keep only relevant text

					listing.set("available_from", extractAvailabilityDate(htmlString));
					listing.set("features", extractFeatures(htmlString, featureList));
					listing.set(extractFurnishedStatus(htmlString));
				} else {
					console.warn("Status: " + connectionStatus + " id: " + listing.get("listing_id"));
				}
			}

			return Parse.Object.saveAll(listingsToSave);
		}
	).then(
		function(list) {
			console.log("Finished processing page " + pageNumber);

			if ((!reachedLimit) || (extraPagesToGo > 0)) {
				var nextPage = pageNumber + 1;
				console.log("Advancing to page: " + nextPage);

				fetchPage(pageNumber + 1, pageSize, currentJob).then(
					function(job) {
						promise.resolve(job);
					},
					function(error) {
						promise.reject(error);
					}
				);
			} else {
				currentJob.set("finishedAt", new Date());
				promise.resolve(currentJob);
			}
		},
		function(error) {
			console.log("Finished processing page " + pageNumber);

			if ((!reachedLimit) || (extraPagesToGo > 0)) {
				var nextPage = pageNumber + 1;
				console.log("Advancing to page: " + nextPage);

				fetchPage(pageNumber + 1, pageSize, currentJob).then(
					function(job) {
						promise.resolve(job);
					},
					function(error) {
						promise.reject(error);
					}
				);
			} else {
				currentJob.set("finishedAt", new Date());
				promise.resolve(currentJob);
			}
		}
	);

    return promise;
}

function parseZooplaDate(s) {
  var a = s.split(/[^0-9]/);
  var date = new Date (a[0],a[1]-1,a[2],a[3],a[4],a[5] );

  return date;
}

function extractImageURLs(s) {
	var urls = [];
	var url_tag = '<meta property="og:image" content="'
	var startIndex = s.indexOf(url_tag);

	// find all tags
	while (startIndex >= 0) {
		// advance to end of opening tag
		s = s.substr(startIndex + url_tag.length);
		// find closing tag
		var endIndex = s.indexOf('"/>');
		// extract url
		var url = s.substring(0,endIndex);
		// replace image size
		url = url.replace("_80_60", "_645_430");
		// add url
		urls.push(url);
		//f ind start of next opening tag
		startIndex = s.indexOf('<meta property="og:image" content="');
	}

	return urls;
}

function extractAvailabilityDate(s) {
	var moment = require('moment');
	var startIndex = s.indexOf("available immediately");

	if (startIndex >= 0)
		return new Date();

	var startIndex = Math.max(s.indexOf("available from"),0);
	var text = s.substr(startIndex);

	var now = moment(text,"DD MMM YYYY");
	
	//if year missing set to current
	now.year((new Date()).getFullYear());

	return now.toDate();
}

function extractFeatures(s, list) {
	var _ = require('underscore');

	return _.filter(list, function(word){return (s.indexOf(word) >= 0)});
}

function extractFurnishedStatus(s) {
	var obj = new Object;

	var unfurnished = "unfurnished",
		furnished = "furnished";

	var startIndex = s.indexOf(unfurnished);
	if (startIndex >= 0) {
		obj[unfurnished] = true;
	}

	// find all occurances of 'furnished'
	startIndex = s.indexOf(furnished);
	while (startIndex >= 0) {
		// make sure it's not as a substring of 'unfurbished'
		if (startIndex < 2) {
			obj[furnished] = true;

			return obj;
		}
		
		// extract word that might be 'unfurbished'
		var str = s.substr(startIndex - 2, unfurnished.length);
		if (unfurnished != str) {
			obj[furnished] = true;

			return obj;
		}

		s = s.substr(startIndex + furnished.length);
		startIndex = s.indexOf(furnished);
	}

	return obj;
}

function trimText(s) {
	var startIndex = Math.max(s.indexOf("Interested in this property"), 0);
	var endIndex = Math.max(s.lastIndexOf("tab-market"), 0);

	if (startIndex < endIndex)
		return s.substring(startIndex, endIndex);

	return s;
}

var Listing = Parse.Object.extend("Listing");

// Enforce uniqueness based on the listing_id column.
Parse.Cloud.beforeSave("Listing", function(request, response) {
	var query = new Parse.Query(Listing);
	query.equalTo("listing_id", request.object.get("listing_id"));
	query.first({
	  success: function(object) {
	    if (object) {
	      	response.error("Listing already exists");
	    } else {
	      	response.success();
	    }
	  },
	  error: function(error) {
	    response.error("Could not validate uniqueness for this Listing object.");
	  }
	});
});

Parse.Cloud.define("parseDate", function(request, response) {
	var moment = require('moment');

	var now = moment("<li>Available from 8th Oct 2014</li>",["DD MMM YYYY", "MMM DD YYYY", "MM-DD-YYYY", "YYYY-MM-DD"]);

	now.year(2014);
	console.log(now.toDate().toString());

	response.success('done');
});

Parse.Cloud.define("scrape", function(request, response) {
    var urls = [
                'http://www.zoopla.co.uk/to-rent/details/34739986',
                'http://www.zoopla.co.uk/to-rent/details/11444525',
                'http://www.zoopla.co.uk/to-rent/details/19117018'];

    var promises = []

    for (var i = 0; i < urls.length; i++) {
        promises.push(
            Parse.Cloud.httpRequest({
              url: urls[i]
            })
        );
    }

    Parse.Promise.when(promises).then(function() {
        for (var i = 0; i < arguments.length; i++) {
            console.log(arguments[i].text.length);
        }
        
        console.log("hola");
        response.success('Scrapes done');
    });
});