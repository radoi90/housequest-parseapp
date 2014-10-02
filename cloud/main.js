var zoopla_api_key = 'ws9n766jdafxqb5btb6ad7v8',
		zoopla_api_url = 'http://api.zoopla.co.uk/api/v1/property_listings.json';

Parse.Cloud.job("cloneZoopla", function(request, status) {
	Parse.Cloud.useMasterKey();
	var FetchJob = Parse.Object.extend("FetchJob");

	console.log("Fetching last fetch job information");
	
	var jobQuery = new Parse.Query(FetchJob);
	jobQuery.descending("createdAt");

	jobQuery.first({
		success: function(latestJob) {
		  var lastAddedId = latestJob.get("first_id");
			var dateLimit = new Date();
			dateLimit.setDate(dateLimit.getDate() - 3);
			console.log("Cloning up to ID: " + lastAddedId + " or date: " + dateLimit);

			var currentJob = new FetchJob();
			currentJob.set("source", "Zoopla");
			currentJob.set("batch", latestJob.get("batch") + 1);
			currentJob.set("batch_size", 0);
			currentJob.set("started_at", new Date);
			currentJob.set("first_id", lastAddedId);

			// Zoopla queries show max 100 results per page
			var pageNumber = 1, pageSize = 100;

			console.log("Begining fetch");
			fetchZooplaPage(pageNumber, pageSize, lastAddedId, dateLimit, status, currentJob);
		},
		error: function(error) {
			console.error('Error ' + error.code + " " + error.message);
			status.error("Cloning failed, error fetching last job information.");
		}
	});
});

function fetchZooplaPage(pageNumber, pageSize, lastAddedId, dateLimit, status, job) {
	console.log("Fetching listings: " + pageSize * (pageNumber -1 ) + "-" + pageSize * pageNumber);

	var needNextPage = true;

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
	  },
		success: function(httpResponse) {
			console.log("Fetched page: " + pageNumber);
			console.log("Returned " + httpResponse.data.listing.length + " listings");

			var listings = [];

			for (var i = 0; i < httpResponse.data.listing.length; i++) {
				var listingData = httpResponse.data.listing[i];

				if (parseZooplaDate(listingData.last_published_date) < dateLimit) {
					console.log("Reached date limit at listing_id: " + listingData.listing_id);
					needNextPage = false;
					break;
				} else if (listingData.listing_id == lastAddedId) {
					console.log("Reached last added id: " + listingData.listing_id);
					needNextPage = false;			
					break;
				} else {
					var Listing = Parse.Object.extend("Listing");
					var listing = new Listing();

					listing.set(listingData);
					listing.set("source","Zoopla");
					listing.set("batch", job.get("batch"));

					if (i == 0 && pageNumber == 1)
						job.set("first_id", parseInt(listing.get("listing_id")));
					job.set("batch_size", job.get("batch_size") + 1);
					job.set("last_id", parseInt(listing.get("listing_id")));

					listings.push(listing);
				}
			}

			Parse.Object.saveAll(listings,{
				success: function(list) {
					console.log("Finished processing page " + pageNumber);
			
					if (needNextPage) {
						var nextPage = pageNumber + 1;
						console.log("Advancing to page: " + nextPage);

						fetchZooplaPage(nextPage, pageSize, lastAddedId, dateLimit, status, job);
					} else {
						job.set("finished_at", new Date());
						console.log("Saving job, finished at " + job.get("finished_at"));
						job.save(null, {
							success: function(job) {
								console.log("Cloning done. Added: " + job.get("batch_size") + " listings");
								status.success("Finished cloning successfully.");
							},
							error: function(job, error) {
								console.log("error " + error.code + " " + error.message);
							}
						});
					}
				}
			});
		},
		error: function(httpResponse) {
			console.error('Request failed with response code ' + httpResponse.status);
			status.error("Cloning failed, error fetching page " + pageNumber);
		}
	});
}

function parseZooplaDate(s) {
  var a = s.split(/[^0-9]/);
  var date = new Date (a[0],a[1]-1,a[2],a[3],a[4],a[5] );

  return date;
}

Parse.Cloud.define("isInBorough", function(request, response) {
  var data = require('cloud/boroughs.js');

  response.success(data.boroughs.length);
});