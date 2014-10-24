var zoopla_api_key = 'ws9n766jdafxqb5btb6ad7v8',
	zoopla_api_url = 'http://api.zoopla.co.uk/api/v1/property_listings.json';

var facebook_api = 'https://graph.facebook.com/v2.1/';

var featureList = ["dishwasher","garden","parking","balcony","gym","swimming pool","gated","bills included"];

var HQNotificationTypes = {
	HQNotificationTypeLike          : 0,
    HQNotificationTypeComment       : 1,
    HQNotificationTypeNewProperty   : 2,
    HQNotificationTypeAvailability  : 3,
    HQNotificationTypeViewingBooked : 4
}

Parse.Cloud.job("zooplaClone", function(request, status) {
	Parse.Cloud.useMasterKey();

	console.log("Fetching last fetch job information");
	
	var FetchJob = Parse.Object.extend("FetchJob");
	var jobQuery = new Parse.Query(FetchJob);
	jobQuery.descending("createdAt");

	jobQuery.first()
	.then(function (latestJob) {
	console.log("Setting up current fetch job");
		var currentJob = createJob(latestJob);

		console.log("Cloning up to ID: " + currentJob.get("limitId") +
					 " or date: " + currentJob.get("limitDate"));

		return currentJob.save();
	})
	.then(function (currentJob) {
		// Zoopla queries show max 100 results per page
		var pageNumber = 1, pageSize = 100;

		console.log("Beginning fetch");
		return fetchPage(pageNumber, pageSize, currentJob);
	})
	.then(function (completedJob) {
		console.log("Getting batch size");
		var promise = new Parse.Promise();
		var statsQuery = new Parse.Query(Listing);
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
	})
	.then(function(completedJob) {
		console.log("Saving job, finished at " + completedJob.get("finishedAt"));
		
		return completedJob.save();
	})
	.then(function(savedJob) {
		console.log("Successful job, added " + savedJob.get("batchSize") + ". Sending search alerts.");
		return sendNotifications(savedJob.get("batchNo"));
	})
	.then(
		function (result) {
			console.log(result);
			console.log("Job finished successfully. Exiting");
			status.success("Cloning finished.");
		},
		function(error) {
			console.error('Error ' + error.code + " " + error.message);
			status.error("Cloning failed, error sending alerts.");
		}
	);
});

function createJob(prevJob) {
	Parse.Cloud.useMasterKey();
	var FetchJob = Parse.Object.extend("FetchJob");
	var newJob = new FetchJob();
	
	// Date limit is properties 3 days old, applies to inception job.
	var dateLimit = new Date();
	dateLimit.setDate(dateLimit.getDate() - 1);
	
	newJob.set({
		source		: "Zoopla",
		batchNo		: prevJob.get("batchNo") + 1,
		batchSize	: 0,
		startedAt	: new Date(),
		firstId		: prevJob.get("firstId"),	//in case of empty batch
		limitId		: prevJob.get("firstId"),
		limitDate	: dateLimit,
		ACL 		: new Parse.ACL()
	});

	return newJob;
}

function createListingObject(zooplaData) {
	Parse.Cloud.useMasterKey();
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
	delete zooplaData.price_modifier;
	delete zooplaData.rental_prices;

	listing.set(zooplaData);
	listing.set("source","Zoopla");
	listing.set("num_likes", 0);
	listing.set("num_seen", 0);

	//Only allow read access to Listing model
	var listingACL = new Parse.ACL();
	listingACL.setPublicReadAccess(true);
	listingACL.setPublicWriteAccess(false);

	listing.setACL(listingACL);

	return listing;
}

var reachedLimit = false;
// Zoopla API doesn't return listings sorted by *_published_date, check a few pages after limit
var extraPagesToGo = 3;

function fetchPage(pageNumber,pageSize,currentJob) {
	Parse.Cloud.useMasterKey();
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
			latitude		: 51.507222,
			longitude		: -0.1275,
			radius			: 17,
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
			Parse.Cloud.useMasterKey();

			console.log("Scraping listing HTML pages");
			// Parse the html for all the visited pages, add data to listing object
			for(var i = 0; i < arguments.length; i++) {
				var listing = listingsToSave[i];
				var connectionStatus = arguments[i].status; //200 OK, 300 listing gone
				var htmlString = arguments[i].text;
				delete arguments[i].text;

				if (connectionStatus == "200") {
					var imageUrlArray = extractImageURLs(htmlString);
					listing.set("image_urls", imageUrlArray); 
					listing.set("num_images", imageUrlArray.length);
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
	var startIndex = Math.max(s.indexOf("available immediately"), s.indexOf("available now"));

	if (startIndex >= 0)
		return new Date();

	var startIndex = s.indexOf("available from");
	if (startIndex >= 0) {
		var text = s.substr(startIndex);
		var now = moment(text,"DD MMM YYYY");
		
		//if year missing set to current
		now.year((new Date()).getFullYear());

		return now.toDate();
	}

	return new Date();
}

function extractFeatures(s, list) {
	var _ = require('underscore');

	return _.filter(list, function (word) {return (s.indexOf(word) >= 0)});
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

var FeedEntry = Parse.Object.extend("FeedEntry");

// Enforce uniqueness based on the listing_id column, perform other checks
Parse.Cloud.beforeSave("Listing", function (request, response) {
	Parse.Cloud.useMasterKey();

	// Object is new if added by scraper (or Data Manager)
	if (request.object.isNew()) {
		// make sure listing is in London
		if (!request.object.has("borough")) {
			response.error("Listing is not within a London Borough.");
		}
		
		// check if this listing_id already exists
		var query = new Parse.Query(Listing);
		query.equalTo("listing_id", request.object.get("listing_id"));
		query.first({
		  success: function  (object) {
		    if (object) {
		    	// check if there have been any updates to the version we already have 
		    	if (object.get("last_published_date").toString() !== request.object.get("last_published_date").toString()) {
		    		// add fields that might have been updated
		    		object.set("last_published_date", 	request.object.get("last_published_date"));
		    		object.set("price_per_month", 		request.object.get("price_per_month"));
		    		object.set("price_per_week", 		request.object.get("price_per_week"));
		    		object.set("description", 			request.object.get("description"));
		    		object.set("image_url", 			request.object.get("image_url"));
		    		object.set("image_urls",			request.object.get("image_urls"));
		    		object.set("num_images",			request.object.get("num_images"));
		    		object.set("thumbnail_url", 		request.object.get("thumbnail_url"));
		    		object.set("available_from", 		request.object.get("available_from"));
		    		object.set("batchNo", 				request.object.get("batchNo"));

		    		// save updates to existing object, block the new object from being saved
		    		object.save({
		    			success: function(listing) {
		    				response.error("Updated existing listing " + listing.get("listing_id"));
		    			},
		    			error: function() {
		    				response.error("Failed to update listing " + request.object.get("listing_id"));
		    			}
		    		});
		    	} else {
		    		// trying to save a duplicate, block
		    		response.error("Listing already exists");
		    	}
		    } else {
		    	// saving listing_id for the first time, allow
		      	response.success();
		    }
		  },
		  error: function(error) {
		    response.error("Could not validate uniqueness for this Listing object.");
		  }
		});
	} else {
		// if Object is not new, its attr are being updated, allow
		response.success();
	}
});

// Parse.User checks

// Only allow FB users
Parse.Cloud.beforeSave(Parse.User, function (request, response) {
	Parse.Cloud.useMasterKey();
	
	if (Parse.FacebookUtils.isLinked(request.object)) {
		response.success(request.object);
	} else {
		response.error("User signup rejected.");
	}
});

// Make sure each user belongs to a group, grab FB data
Parse.Cloud.afterSave(Parse.User, function (request) {
	Parse.Cloud.useMasterKey();

	if (!request.object.existed()) {
		var Group = Parse.Object.extend("Group");
		var userGroup = new Group();
		userGroup.addUnique("users", request.object);
					
		userGroup.save();

		Parse.Cloud.httpRequest({
			url: facebook_api + request.user.get("authData").facebook.id,
			headers: {
	    		'Content-Type': 'application/json;charset=utf-8'
	  		},
			params: {
			    fields 			: 'picture.width(200).height(200),first_name,last_name,email,gender',
			    access_token	: request.user.get("authData").facebook.access_token
		  	}
		}).then(
			function(httpResponse) {
				var userACL = new Parse.ACL(request.user);
				request.user.setACL(userACL);
				request.user.set("first_name", httpResponse.data.first_name);
				request.user.set("last_name", httpResponse.data.last_name);
				request.user.set("email", httpResponse.data.email);
				request.user.set("gender", httpResponse.data.gender);
				request.user.set("profile_image_url", httpResponse.data.picture.data.url);

				request.user.save();
			}
		);
	}
});

// Group checks

// Generate group name
Parse.Cloud.beforeSave("Group", function (request, response) {
	if (request.object.isNew()) {
		var groupName = "";

		// Generate random code, length 5
		for (var i = 0; i < 5; i++) {
			groupName += (Math.floor(Math.random() * 10)).toString();
		}

		request.object.set("group_name", groupName);

		response.success();
	} else {
		response.success();
	}
});

// Delete empty Groups
Parse.Cloud.afterSave("Group", function (request) {
	Parse.Cloud.useMasterKey();
	
	if (request.object.get("users").length == 0) {
		request.object.destroy()
		.then( function() {
			console.log("Group " + groupName + " empty. Removed.");
		});
	}
});

// Delete Search, FeedEntries after deleting Group
Parse.Cloud.afterDelete("Group", function (request) {
	Parse.Cloud.useMasterKey();
	
	if (request.object.has("search")) {
		request.object.get("search").destroy();
	}

	var FeedEntry = Parse.Object.extend("FeedEntry");
	var feedEntryQuery = new Parse.Query(FeedEntry);
	feedEntryQuery.equalTo("group", request.object);

	feedEntryQuery.each(function (feedEntry) {
		feedEntry.destroy();
	});
});

// add a user to a group based on the invite code (= group_name)
Parse.Cloud.define("joinGroup", function (request, response) {
	// the request must come from a logged in user
	if (request.user && request.user.authenticated()) {
		Parse.Cloud.useMasterKey();

		var Group = Parse.Object.extend("Group");
		var newGroup;
		var newGroupQuery = new Parse.Query(Group);
		newGroupQuery.equalTo("group_name", request.params.code);

		// check if user is trying to join an existing group
		newGroupQuery.first()
		.then( function (groupToJoin) {
			if (groupToJoin) {
				groupToJoin.addUnique("users", request.user);
				newGroup = groupToJoin;

				// remove from current Group
				var currentGroupQuery = new Parse.Query(Group);
				currentGroupQuery.equalTo("users", request.user);

				return currentGroupQuery.each( function (currentGroup) {
					currentGroup.remove("users", request.user);
					return currentGroup.save();
				});
			} else {
				var error = new Parse.Promise();
				error.reject("Error, group not found");
				
				return error;
			}
		})
		.then( function () {
			if (newGroup) {
				return newGroup.save();	
			}
		})
		.then(
			function (currentGroup) {
				response.success(currentGroup);
			},
			function (error) {
				response.error(error);
			}
		);

	} else {
		response.error("Error, user must be authenticated");
	}
});

// Search checks

// Create Search Alerts for each new Search
Parse.Cloud.afterSave("Search", function (request) {
	Parse.Cloud.useMasterKey();

	if (!request.object.existed()) {
		var SearchAlert = Parse.Object.extend("SearchAlert");
		var searchAlert = new SearchAlert({
			search: request.object,
			ACL: new Parse.ACL()
		});

		searchAlert.save();
	}
});

// Delete SearchAlert after deleting Search
Parse.Cloud.afterDelete("Search", function (request) {
	Parse.Cloud.useMasterKey();

	var SearchAlert = Parse.Object.extend("SearchAlert");
	var searchAlertQuery = new Parse.Query(SearchAlert);
	searchAlertQuery.equalTo("search", request.object);

	searchAlertQuery.each( function (searchAlert) {
		searchAlert.destroy();
	})
	.then( function() {
		console.log("Removed search Alerts");
	});
});

// SearchAlert checks

// initialize with current FetchJob number
Parse.Cloud.beforeSave("SearchAlert", function (request, response) {
	Parse.Cloud.useMasterKey();

	if (request.object.isNew()) {
		var FetchJob = Parse.Object.extend("FetchJob");
		var latestJobQuery = new Parse.Query(FetchJob);
		latestJobQuery.descending("createdAt");

		latestJobQuery.first()
		.then( function (latestJob) {
			var fifteenMinutesAgo = new Date();
			tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 15);

			request.object.set({
				lastBatchChecked: latestJob.get("batchNo"),
				lastPushAt 		: fifteenMinutesAgo,
				ACL 			: new Parse.ACL()
			});
			response.success();
		});
	} else {
		response.success();
	}
});

// FeedEntry checks

// Propagate FeedEntry changes to the Listing model if needed, send notificaitons
Parse.Cloud.beforeSave("FeedEntry", function (request, response) {
	var _ = require("underscore");

	// check if any changes to Listing are needed
	if (request.user) {
		request.object.get("group").fetch()
		.then(function() {
			Parse.Cloud.useMasterKey();

			var listingNeedsUpdate = false;
			var notificationMessage = "";
			var notificaitonType;

			// can't 'unsee' a listing, can only increment users_seen
			if (request.object.dirty("users_seen")) {
				listingNeedsUpdate = true;
				request.object.get("listing").increment("num_seen");
			}

			// check if user liked (added to users_liked)
			// or unliked (removed from users_liked)
			if (request.object.dirty("users_liked")) {
				listingNeedsUpdate = true;
				var diff = _.chain(request.object.get("users_liked"))
					.map(function(user) { return user.id })
					.contains(request.user.id)
					.value() ? 1 : -1;

				request.object.get("listing").increment("num_likes", diff);

				notificaitonType = HQNotificationTypes.HQNotificationTypeLike;
				notificationMessage = request.user.get("first_name") + 
					(diff > 0 ? " liked " : " unliked ") + "a property.";
			}

			if (request.object.dirty("availability")) {
				notificaitonType = HQNotificationTypes.HQNotificationTypeAvailability;
				notificationMessage = request.user.get("first_name") + 
					" changed the availability on a property";
			}

			if (request.object.dirty("num_comments")) {
				notificaitonType = HQNotificationTypes.HQNotificationTypeComment;
				notificationMessage = request.user.get("first_name") + 
					" commented on a property";
			}
			
			var query = new Parse.Query(Parse.Installation);
			console.log(request.object.get("group"));
			query.containedIn('userId', request.object.get("group").get("users"));
			query.notEqualTo('userId', request.user);

			console.log(query.toJSON());

			Parse.Push.send({
			  where: query,
			  data: {
			  	alert: notificationMessage,
			  	type: notificaitonType,
			  	sound: "default",
			  	value: {
			  		name: request.user.get("first_name")
			  	}
			  }
			})
			.then( function() {
				if (listingNeedsUpdate) {
					return request.object.get("listing").save();
				}
			})
			.then(
				function(){response.success();},
				function(){response.success();}
			);
		});
	} else {
		response.success();
	}
});

// Delete Comments after deleting 
Parse.Cloud.afterDelete("FeedEntry", function (request) {
	Parse.Cloud.useMasterKey();

	var Comment = Parse.Object.extend("Comment");
	var commentQuery = new Parse.Query(Comment);
	commentQuery.equalTo("feed_entry", request.object);

	commentQuery.each( function (comment) {
		comments.destroy();
	});
});

// Comment checks

// Increment comment count on the corresponding FeedEntry
Parse.Cloud.afterSave("Comment", function(request) {
	if (!request.object.existed()) {
		var feedEntry = request.object.get("feed_entry");
		feedEntry.increment("num_comments");
		feedEntry.save();
	}
});

// Limit comment length to 1200 characters
Parse.Cloud.beforeSave("Comment", function(request, response) {
	if (request.user && request.user.authenticated()) {
		var content = request.object.get("comment");
		content && request.object.set("comment", content.substr(0,1200));

		response.success();
	} else {
		response.error("Must be logged in to comment.");
	}
});

// Parse.Installation checks

// Link each Installation to its User
Parse.Cloud.beforeSave(Parse.Installation, function (request,response) {
	Parse.Cloud.useMasterKey();

	// If installation is saved on client side
	if (request.user) {
		request.object.set("userId", request.user);
		response.success();
	} else {
		response.success();	
	}
});

function buildListingQuery (searchParams) {
	var query = new Parse.Query(Listing);

	if (searchParams.num_beds.length > 0) {
		var beds = searchParams.num_beds;
        _.contains(beds, 4) && beds.push(5,6,7,8,9,10);

        query.containedIn("num_bedrooms", beds);
	}

	if (searchParams.areas.length > 0) {
		query.containedIn("borough", searchParams.areas);
	}

	query.greaterThanOrEqualTo("price_per_month", searchParams.price_min);

	if (searchParams.price_max < 6000) {
		query.lessThanOrEqualTo("price_per_month", searchParams.price_max);
	}

	if (searchParams.with_photos) {
		query.greaterThan("num_images",0);
	}

	return query;
}

var FeedEntry = Parse.Object.extend("FeedEntry", {
    defaults: {
      num_comments: 0,
      availability: "1",
      users_liked: [],
      users_seen: []
    }
});

// send push notifications between 8AM and 10PM
function isInNotificationHours(date) {
	return (date.getHours() > 6 && date.getHours() < 21);
}

// enforce a 30 min spacing between pushes
function okToPush(searchAlert) {
	var minutesBetweenPushes = 30;
	var lastPushDate = new Date(searchAlert.get("lastPushAt").toJSON());
	var diff = Math.abs(new Date() - lastPushDate);
	var diffMinutes = Math.floor(diff/1000/60);

	return (diffMinutes >= minutesBetweenPushes);
}

function sendNotifications (currentBatchNumber) {
	var alertsSentPromise = new Parse.Promise();

	// check if it's OK to alert users
	if ( isInNotificationHours(new Date()) ) {
		var SearchAlert = Parse.Object.extend("SearchAlert");
		var searchAlertQuery = new Parse.Query(SearchAlert);
		searchAlertQuery.include("search");

		var alertsUpdatedPromises = [];

		console.log("Fetching all SearchAlerts");
		searchAlertQuery.each(
			function (searchAlert) {
				if (okToPush(searchAlert)) {
					var alertUpdatedPromise = new Parse.Promise();
					alertsUpdatedPromises.push(alertUpdatedPromise);

					// build the listings query for each search
					var listingQuery = buildListingQuery(searchAlert.get("search").toJSON());

					// query all properties added since last checked batch
					listingQuery.greaterThan("batchNo", searchAlert.get("lastBatchChecked"));

					var count_to_send;

					// fetch the number of new listings matching search parameters
					listingQuery.count()
					.then(function (num_new_listings) {
						count_to_send = num_new_listings;

						if (num_new_listings > 0) {
							// get the group that needs to receive the notification
							var groupQuery = new Parse.Query("Group");
							groupQuery.equalTo("search", searchAlert.get("search"));

							return groupQuery.first();
						}
					})
					.then(function (group) {
						if (group) {
							var pushQuery = new Parse.Query(Parse.Installation);
							pushQuery.containedIn("userId", group.get("users"));
							
							return Parse.Push.send({
							  where: pushQuery,
							  data: {
							  	alert: "Surprise! You got " + count_to_send + 
							  		" new propert" + (count_to_send == 1 ? "y!" : "ies!"),
							  	type: HQNotificationTypes.HQNotificationTypeNewProperty,
							  	sound: "default",
							  	value: {}
							  }
							});
						}
					})
					.then(function () {
						// save batchNumber in searchAlert
						searchAlert.save({
							lastBatchChecked: currentBatchNumber,
							lastPushAt 		: new Date() 	
						});
					})
					.then(
						function (updatedAlert) {
							alertUpdatedPromise.resolve(updatedAlert);
						},
						function (error) {
							console.log("Error updating SearchAlert " + error.message);
							alertUpdatedPromise.reject(error);
						}
					);
				}
			}
		)
		.then(
			function() {
				console.log("Waiting for all SearchAlerts to be updated");

				return Parse.Promise.when(alertsUpdatedPromises);
			},
			function (error) {
				console.error("Error fetching SearchAlerts, message:" + error.message);
			}
		)
		.then(
			function() {
				alertsSentPromise.resolve("Sent push notifications for all saved alerts");
			},
			function (error) {
				alertsSentPromise.reject("Error sending push notifications, message: " + error.message);
			}
		);
	} else {
		alertsSentPromise.resolve("Outside notification hours, skip push.");
	}

	return alertsSentPromise;
}