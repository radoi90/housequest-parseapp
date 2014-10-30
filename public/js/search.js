Parse.View.prototype.close = function(){
  this.remove();
  this.unbind();
  if (this.onClose){
    this.onClose();
  }
}

var QueryString = function () {
  // This function is anonymous, is executed immediately and 
  // the return value is assigned to QueryString!
  var query_string = {};
  var query = window.location.search.substring(1);
  var vars = query.split("&");
  for (var i=0;i<vars.length;i++) {
    var pair = vars[i].split("=");
      // If first entry with this name
    if (typeof query_string[pair[0]] === "undefined") {
      query_string[pair[0]] = pair[1];
      // If second entry with this name
    } else if (typeof query_string[pair[0]] === "string") {
      var arr = [ query_string[pair[0]], pair[1] ];
      query_string[pair[0]] = arr;
      // If third or later entry with this name
    } else {
      query_string[pair[0]].push(pair[1]);
    }
  } 
    return query_string;
} ();

// constants
var CHARING_CROSS = new google.maps.LatLng(51.507222,-0.1275);
var RESULTS_PER_PAGE = 30;

var dateDiff = function(s) {
  var date = new Date (s);
  var milisDiff = new Date() - date, 
        secDiff = milisDiff / 1000,
        minDiff = secDiff / 60,
          hDiff = minDiff / 60,
        dayDiff = hDiff / 24,
       weekDiff = dayDiff/7;

  if (weekDiff >= 2) return Math.floor(weekDiff) + " weeks";
  else if (weekDiff >=1) return "1 week";
  else if (dayDiff >=2) return Math.floor(dayDiff) + " days";
  else if (dayDiff >=1) return "1 day";
  else if (hDiff >=2) return Math.floor(hDiff) + " hours";
  else if (hDiff >=1) return "1 hour";
  else if (minDiff >=30) return Math.floor(minDiff) +  " min";
  else return "moments ago";
}

$(function() {
  var boroughnames = new Bloodhound({
    datumTokenizer: Bloodhound.tokenizers.obj.whitespace('name'),
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    prefetch: {
      url: 'data/boroughnames.json',
      filter: function(list) {
        return $.map(list, function(boroughname) {
          return { name: boroughname }; });
      }
    }
  });
  boroughnames.initialize();

  Parse.$ = jQuery;

  // DEV
  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("xLa1kzoH7j1WfrstOdgYj275dAeFonMwBog7ngNK",
                 "0wkQGPbLTA6GxW0o2eqDhAui2faUNWXWPExELxuL");

  // PROD
  // // Initialize Parse with your Parse application javascript keys
  // Parse.initialize("5ITlOKP4A8ggw5KYLJnsHYyOoQ9CZydXeUDSqjiQ",
  //                "lsm1ZGuKXFw1PLaU6WYHHSLN2o2V6FQd8675nfmi");

  window.fbAsyncInit = function() {
    Parse.FacebookUtils.init({ // this line replaces FB.init({
      appId      : 1570124209875630, // Facebook App ID
      cookie     : true, // enable cookies to allow Parse to access the session 
      xfbml      : true,  // parse social plugins on this page
      version    : 'v2.1' // use version 2.1
    });
 
    // Run code after the Facebook SDK is loaded.
  };
 
  (function(d, s, id){
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) {return;}
    js = d.createElement(s); js.id = id;
    js.src = "//connect.facebook.net/en_US/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'facebook-jssdk'));

  var Listing = Parse.Object.extend("Listing");

  // The FeedEntry model is a wrapper to a Listing object
  var FeedEntry = Parse.Object.extend("FeedEntry", {
    defaults: {
      num_comments: 0,
      availability: "1",
      users_liked: [],
      users_seen: [],
      shortlisted: false
    },

    seeDetails: function() {
      if (Parse.User.current() && !(this.seenByCurrentUser())) {
        this.addUnique("users_seen", Parse.User.current());
        this.save();
      }
    },

    // Checks if current signed in User has seen the Listing details
    seenByCurrentUser: function() {
      if (Parse.User.current()) {
        return _.chain(this.get("users_seen"))
                .map(function (user) { return user.id })
                .contains(Parse.User.current().id)
                .value();
      } else {
        return false;
      }
    },

    // Toggle the `like` state of this FeedEntry item.
    like: function() {
      if (Parse.User.current()) {
        // shortlist first if needed
        if (!this.get("shortlisted")) {
          this.set("shortlisted", true);
          this.set("shortlisted_by", Parse.User.current());
        } else {
          if (this.shortlistedByCurrentUser()) {
            this.set("shortlisted", false);
          }
        }
        
        if (this.likedByCurrentUser()) {
          // unlike
          this.remove("users_liked", Parse.User.current());
        } else {
          // like
          this.addUnique("users_liked", Parse.User.current());
        }
        
        this.save({group: state.get("group")});  
      } else {
        //TODO: implement ask user to login
      }
    },

    // Checks if current signed in User likes it
    likedByCurrentUser: function() {
      if (Parse.User.current()) {
        return _.chain(this.get("users_liked"))
                .map(function (user) { return user.id })
                .contains(Parse.User.current().id)
                .value();
      } else {
        return false;
      }
    },

    shortlistedByCurrentUser: function() {
      if (Parse.User.current() && this.get("shortlisted")) {
        return this.get("shortlisted_by").id == Parse.User.current().id;
      } else {
        return false;
      }
    }
  });

  // FeedEntry Collection
  // ---------------

  var Feed = Parse.Collection.extend({

    // Reference to this collection's model.
    model: Listing,

    // // Filter down the list of all todo items that are finished.
    // done: function() {
    //   return this.filter(function(todo){ return todo.get('done'); });
    // },

    // // Filter down the list to only todo items that are still not finished.
    // remaining: function() {
    //   return this.without.apply(this, this.done());
    // },

    // Entries are sorted by the listing published date/price
    comparator: function(entry) {
      //TODO: add more types of compare
      return entry.get('last_published_date');
    }
  });

  // Listing Item View
  // --------------

  // The DOM element for the FeedEntry item..
  var ListingView = Parse.View.extend({

    // Cache the template function for a single item.
    template: _.template($('#listing-template').html()),

    commentTemplate: _.template($('#comment-template').html()),

    events: {
      "mouseenter .listing-container"   : "highlightOn",
      "mouseleave .listing-container"   : "highlightOff",
      "keypress #new-comment"           : "commentOnEnter",
      "click .listing-action.action-shortlist" : "shortlist"
    },

    initialize: function() {
      var self = this;
      _.bindAll(this, 'saveComment');

      this.entry = new FeedEntry({listing: this.model});
      this.comments = [];
      if (state.get("group")) {
        this.entry.set("group", state.get("group"));
      }

      if (Parse.User.current()){
        var feedEntryQuery = new Parse.Query(FeedEntry);
        feedEntryQuery.equalTo("group", state.get("group"));
        feedEntryQuery.equalTo("listing", this.model);

        feedEntryQuery.first()
        .then(function (entry) {
          // re-render to show FeedEntry data
          if (entry) {
            self.entry = entry;
            self.render();

            var commentsQuery = new Parse.Query('Comment');
            commentsQuery.equalTo("feed_entry", entry)
            .include("user")
            .ascending("createdAt");

            return commentsQuery.find();
          }
        })
        .then(function (comments) {
          if (comments) {
            self.comments = comments;
            self.render();
          }
        });
      }
      
      this.renderMarker();
    },

    onClose: function(){
      this.marker.setMap(null);
      this.marker = null;

      this.entry && this.entry.unbind("change", this.render);
    },

    // Re-render the contents of the FeedEntry item.
    render: function() {
      var self = this;
      var listingJSON = this.model.toJSON();
      listingJSON.nearest_station = this.model.get("nearest_station").toJSON();
      listingJSON.nearest_station.distance = 
        this.model.get("location").milesTo(this.model.get("nearest_station").get("location"));
      
      var feedEntryJSON = this.entry.toJSON();
      feedEntryJSON.shortlisted_by_current = this.entry.shortlistedByCurrentUser();
      feedEntryJSON.liked_by_current = this.entry.likedByCurrentUser();

      if (state.get("group") && this.entry.get("shortlisted")) {
        var shortlisted_by_user = _.filter(state.get("group").get("users"), function(user) { 
            return self.entry.get("shortlisted_by").id == user.id;
          })[0];

        feedEntryJSON.user_shortlisted_pic = shortlisted_by_user.get("profile_image_url");
      }

      feedEntryJSON.users_liked_pics = [];
      if (state.get("group")) {
        for (var i = 0; i < this.entry.get("users_liked").length; i++) {
          var liked_by_user = _.filter(state.get("group").get("users"), function(user) { 
            return ((self.entry.get("users_liked")[i].id == user.id) && (self.entry.get("shortlisted_by").id != user.id));
          })[0];

          liked_by_user && feedEntryJSON.users_liked_pics.push(liked_by_user.get("profile_image_url"));
        }
      }
      
      for (var key in feedEntryJSON)
        listingJSON[key] = feedEntryJSON[key];

      $(this.el).html(this.template(listingJSON));
      this.input = this.$('#new-comment');

      this.renderComments();

      return this;
    },

    renderComments: function(comments) {
      this.$('#comments-container').html('');

      for(var i = 0; i < this.comments.length; i++) {
        this.$('#comments-container').append(this.commentTemplate({
          first_name  : this.comments[i].get("user").get("first_name"),
          profile_image_url : this.comments[i].get("user").get("profile_image_url"),
          comment     : this.comments[i].get("comment")
        }));
      }
    },

    renderMarker: function() {
      var self = this;
      var map = self.options.map;

      var myLatLng = new google.maps.LatLng(this.model.get('location').latitude, this.model.get('location').longitude);
      var bounds = map.getBounds();
      
      //if map bounds are on default center map at current marker
      if (map.getCenter() == CHARING_CROSS) {
        map.setCenter(myLatLng);
      } 
      //if markers present check if bounds need altering
      else if (!bounds.contains(myLatLng)) {
        bounds.extend(myLatLng);
        map.fitBounds(bounds);
      }

      this.marker = new google.maps.Marker({
        position: myLatLng,
        map: map,
        title: this.model.get("price_per_month").toString(),
      });

      google.maps.event.addListener(this.marker, 'click', function() {
        // highlight listing container
        $('.highlighted-container').removeClass("highlighted-container");
        $('#' + self.id + ' .listing-container').addClass("highlighted-container");

        // scroll to listing container
        $('.col-content').animate({
          scrollTop: $('.col-content').scrollTop() + $('#search-container').height() - $('.navbar').height() + 
          $('#' + self.id + ' .listing-container').position().top - $('#' + self.id + ' .listing-container').height()
        }, 1000);
      });
    },

    highlightOn: function() {
      var map = this.options.map;

      if (!map.getBounds().contains(this.marker.getPosition())) {
        var bounds = map.getBounds();
        bounds.extend(this.marker.getPosition());

        map.fitBounds(bounds);
      }
      this.marker.setAnimation(google.maps.Animation.BOUNCE);
    },

    highlightOff: function() {
      this.marker.setAnimation(null);
    },

    // If you hit return in the comment input field, save new Comment
    commentOnEnter: function(e) {
      var self = this;

      if (Parse.User.current()) {
        if (e.keyCode != 13) return;

        var Comment = Parse.Object.extend('Comment');
        var comment = new Comment({
          comment:    this.input.val().substr(0, 1200),
          feed_entry: this.entry,
          user:       Parse.User.current()
        });

        this.$('#comments-container').append(this.commentTemplate({
          first_name  : Parse.User.current().get("first_name"),
          profile_image_url : Parse.User.current().get("profile_image_url"),
          comment     : this.input.val().substr(0, 1200)
        }));

        this.saveComment(comment);

        this.input.val('');
      } else {
        //TODO
      }
    },

    saveComment: function(comment) {
      var self = this;

      var savingFE = new Parse.Promise.as(this.entry);

      // save Feed entry first if needed
      if (this.entry.isNew()) {
        savingFE = this.entry.save();
      }

      
      savingFE.then(function (feedEntry) {
        self.entry =  feedEntry;
        comment.set("feed_entry", feedEntry);
        
        return comment.save();
      })
      .then(function () {
          var commentsQuery = new Parse.Query('Comment');
          commentsQuery.equalTo("feed_entry", self.entry)
          .include("user")
          .ascending("createdAt");

          return commentsQuery.find();
      })
      .then(function (comments) {
        if (comments) {
          self.comments = comments;
          self.render();
        }
      },
        function(error) {console.log(error);}
      );
    },

    shortlist: function() {
      if (Parse.User.current()) {
        this.entry.like();
        this.render();
      }
    }
  });

  // Search Model
  // ----------

  // The Search model represents a user's search query
  var Search = Parse.Object.extend("Search", {
    // Default query parameters.
    defaults: {
      areas:        [],
      price_min:    0,
      price_max:    6000,
      num_beds:     [0,1,2,3,4],
      with_photos:  true,
    }
  });

  // Search Item View
  // --------------

  var SearchView = Parse.View.extend({
    el: "#search-container",

    template: _.template($('#search-template').html()),

    transitLayerTemplate: _.template($("#map-buttons-template").html()),

    statsTemplate: _.template($('#stats-template').html()),

    events: {
      "change #areas"           : "changeAreas",
      "change .num-beds-select" : "changeNumBeds",
      "change #price-min"       : "changePriceMin",
      "change #price-max"       : "changePriceMax",
      "change #with-photos"     : "changeWithPhotos"
    },

    initialize: function() {
      // bind events
      _.bindAll(this, 'render', 'performSearch','performNewSearch','initializeMap','saveSearch');
      
      this.$el.html(this.template(this.model.toJSON()));

      // initialize controls
      this.initializeControls();

      // initially get first result page
      this.resultsPage = 0;

      // intialize map
      this.initializeMap();
      google.maps.event.addListenerOnce(this.map, 'idle', this.performNewSearch);
      
      this.model.bind('change', this.performNewSearch);
      this.model.bind('change', this.render);

      this.listingViews = [];
    },

    initializeControls: function() {
      // initialize price slider
      $( ".price-range-slider" ).slider({
        range:true,
        min: 0,
        max: 6000,
        step: 50,
        values: [ this.model.get("price_min"), this.model.get("price_max") ],
        slide: function( event, ui ) {
          $( "#price-min" ).val(ui.values[0]);
          $( "#price-max" ).val(ui.values[1]);

          if (ui.values[1] == 6000)
            $( "#price-max" ).val(ui.values[1] + "+");
        },
        stop: function( event, ui ) {
          // depending on which value changed, trigger event
          if (ui.value == ui.values[0])
            $( "#price-min" ).trigger("change");
          else
            $( "#price-max" ).trigger("change");
        }
      });


      // initialize area tag input
      $('#areas').tagsinput({
        freeInput: false, //only allow typeahead values
        typeaheadjs: {
          name: 'boroughnames',
          displayKey: 'name',
          valueKey: 'name',
          source: boroughnames.ttAdapter()
        }
      });
    },

    initializeMap: function() {
      var self = this;

      var mapOptions = {
        zoom: 12,
        minZoom: 10,
        maxZoom: 17,
        center: CHARING_CROSS
      }
      
      var map = new google.maps.Map(document.getElementById('map-canvas'),
                                    mapOptions);

      this.map = map;

      map.data.loadGeoJson('data/boroughGeo.json');

      map.data.setStyle(function(feature) {
        var strokeOpacity = 0;
        var fillOpacity = 0
        if (feature.getProperty('isSelected')) {
          strokeOpacity = 0.8;
          fillOpacity = 0.1;
        }
        return /** @type {google.maps.Data.StyleOptions} */({
          fillOpacity: fillOpacity,
          fillColor: '#2980b9',
          strokeColor: '#2980b9',
          strokeOpacity: strokeOpacity,
          strokeWeight: 3
        });
      });

      // When the user clicks, set 'isColorful', changing the color of the letters.
      map.data.addListener('click', function(event) {
        var isSelected = !(event.feature.getProperty('isSelected'));
        var feature = event.feature;
        feature.setProperty('isSelected', isSelected);

        // add/remove area name from search tags input
        $('#areas').tagsinput(isSelected ? 'add' : 'remove', event.feature.getProperty('name'));

        // when unselected, remove and add back the polygon
        // this will remove the outline even though the mouse still hovers over it,
        if (!isSelected) {
          map.data.revertStyle();
          map.data.remove(feature);
          map.data.add(feature);
        }
      });

      map.data.addListener('addfeature', function(event) {
        var areas = self.model.get("areas");
        event.feature.setProperty('isSelected', _.contains(areas, event.feature.getProperty("name")));
      });

      // When the user hovers, tempt them to click by outlining the letters.
      // Call revertStyle() to remove all overrides. This will use the style rules
      // defined in the function passed to setStyle()
      map.data.addListener('mouseover', function(event) {
        map.data.revertStyle();
        map.data.overrideStyle(event.feature, {strokeOpacity: 0.8, strokeWeight: 4});
      });

      map.data.addListener('mouseout', function(event) {
        map.data.revertStyle();
      });

      $('#map-container').append(this.transitLayerTemplate());

      var transitLayer = new google.maps.TransitLayer();
      transitLayer.setMap(map);

      var control = document.getElementById('transit-wpr');
      map.controls[google.maps.ControlPosition.TOP_RIGHT].push(control);

      google.maps.event.addDomListener(control, 'click', function() {
        transitLayer.setMap(transitLayer.getMap() ? null : map);
      });
    },

    render: function() {
      var self = this;
      this.delegateEvents();

      this.$('#stats-row').html(this.statsTemplate({
        showingFirst: Math.min(this.count, (this.resultsPage + 1) * RESULTS_PER_PAGE),
        count:      this.count,
        expected:   this.count / 5,
        isNew:      this.model.isNew(),
        hasChanged:    this.model.dirty()
      }));

      $('button.btn-save-search').bind("click", $.proxy(self.saveSearch, self));
    },

    remove: function() {
      this.$el.empty().off()
      return this;
    },

    onClose: function() {
      this.model.unbind('change', this.render);
      this.model.unbind('change', this.performSearch);
      this.clearResults();
    },

    changeAreas: function(e) {
      var areas = [];

      // If any, split the area names into array of strings
      if (e.target.value.length > 0) {
        areas = e.target.value.split(',');
      }

      // pressing backspace in the empty area input causes change event
      // don't updates as it's not necessary, avoid querying
      if (!(areas.length == 0 && this.model.get("areas").length == 0)) {
        this.model.set({areas: areas});
      }
      
      // update map
      var areas = this.model.get("areas");
      this.map.data.forEach(function(feature) {
        feature.setProperty('isSelected', _.contains(areas,feature.getProperty("name")));
      });
    },

    changeNumBeds: function(e) {
      var beds = this.model.get("num_beds");
      var value = parseInt(e.target.value);

      beds = e.target.checked ? _.union(beds,[value]) : _.difference(beds,[value]);
      this.model.set({num_beds: beds});
    },

    changePriceMin: function(e) {
      this.model.set({price_min: parseInt(e.target.value)});
    },

    changePriceMax: function(e) {
      this.model.set({price_max: parseInt(e.target.value)});
    },

    changeWithPhotos: function(e) {
      this.model.set({with_photos: e.target.checked});
    },

    performNewSearch: function() {
      this.resultsPage = 0;

      this.performSearch();
    },

    performSearch: function() {
      var self = this;
      console.log(this.resultsPage);
      this.clearResults();
      
      // remove any old spinners and add a fresh one
      this.removeSpinner();
      $("#list-container #load-more").remove();
      this.insertSpinner();

      //if other search still running remove their callbacks
      if (this.searchPromise)
        this.searchPromise._resolvedCallbacks = [];

      var dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - 5);

      var Listing = Parse.Object.extend("Listing");
      var query = new Parse.Query(Listing);
      query.select(["details_url", "last_published_date", "outcode", "borough",
                    "price_per_month", "image_urls","location","nearest_station","num_likes","num_seen"])
      .include("nearest_station")
      .skip(this.resultsPage * RESULTS_PER_PAGE)
      .descending("last_published_date")
      .greaterThanOrEqualTo("last_published_date", dateLimit);

      if (this.model.get("num_beds").length > 0) {
        //clone this.mode.beds
        var beds = this.model.get("num_beds").slice(0);
        _.contains(beds, 4) && beds.push(5,6,7,8,9,10);

        query.containedIn("num_bedrooms", beds);
      }

      if (this.model.get("areas").length > 0) {
        query.containedIn("borough", this.model.get("areas"));
      } else {
        var SW = this.map.getBounds().getSouthWest();
            SW = new Parse.GeoPoint(SW.lat(), SW.lng());
        var NE = this.map.getBounds().getNorthEast();
            NE = new Parse.GeoPoint(NE.lat(), NE.lng());
        query.withinGeoBox("location", SW, NE)
      }

      query.greaterThanOrEqualTo("price_per_month", this.model.get("price_min"));

      if (this.model.get("price_max") < 6000) {
        query.lessThanOrEqualTo("price_per_month", this.model.get("price_max"));
      }

      if (this.model.get("with_photos")) {
        query.greaterThan("num_images",0);
      }
      
      this.searchPromise = query.count()
      .then(function (count) {
        self.count = count;
        self.render();
        
        query.limit(30);
        return query.find();
      });

      this.searchPromise.done(function (results) {
        self.clearResults();
        self.removeSpinner();
        $("#list-container #load-more").remove();

        for (var i = 0; i < results.length; i++) {
          var view = new ListingView({
            model: results[i],
            id: results[i].id,
            map: self.map
          });
          self.listingViews.push(view);
          this.$("#list-container").append(view.render().el);
        }

        // if there are more results than the ones displayed add show more button
        if (self.count > (self.resultsPage * RESULTS_PER_PAGE + results.length)) {
          this.$("#list-container").append($('#load-more').clone());
          $('#load-more').bind("click", $.proxy(self.advancePage, self));
        }
      });
    },

    advancePage: function() {
      this.resultsPage++;
      this.performSearch();
    },

    insertSpinner: function() {
      $('#list-placeholder').clone().prependTo('#list-container');
    },

    removeSpinner: function() {
      $('#list-container #list-placeholder').remove();
    },

    clearResults: function() {
      // clear results if search parameters changed
      if (this.resultsPage == 0) {
        _.map(this.listingViews, function (view) {
          view.close();
        });

        this.listingViews = [];
      }
      
    },

    saveSearch: function() {
      var self = this;
      // TODO: disable button
      // TODO: hide button
      if (Parse.User.current()) {
        
        // link new search to group
        if (this.model.isNew()) {
          state.get("group").save({
            search: this.model
          })
          .then( function() {
            self.render();
          });
        } else {
          this.model.save()
          .then( function() {
            self.render();
          });
        }

      }

    }

  });

  // The Application
  // ---------------

  // var noUserView = Parse.View.extend({
  //   loginModalTemplate: _.template($('#login-modal-template').html()),

  //   events: {
  //     "click .login-fb": "showLoginModal",
  //     "click .btn-fb": "loginFb"
  //   },

  //   el: ".button-container",
    
  //   initialize: function() {
  //     _.bindAll(this, "showLoginModal", "loginFb", "render");
  //     this.render();

  //     if (QueryString.invite) {
  //       this.showLoginModal("to join group");
  //     }
  //   },

  //   showLoginModal: function(e) {
  //     var self = this;
  //     var reason = (typeof e === "string") ? e : "";

  //     // Insert modal and load it
  //     $('body').append(self.loginModalTemplate({loginReason: reason}));
  //     $('#loginModal').modal();
        
  //     // Since the modal is inserted after jQuery loads we need to re-bind
  //     // the click events which close the modal (outside model, on 'x' sign)
  //     $('html').bind("click", self.hideLoginModal);
  //     $('button.close').bind("click", self.hideLoginModal);
  //     $('.action-modal-dialog').bind("click", function(event){
  //         event.stopPropagation();
  //     });

  //     // bind the login with facebook button
  //     $('.btn-fb').bind("click", $.proxy(self.loginFb, self));

  //     return false;
  //   },

  //   hideLoginModal: function() {
  //     // Unbind the click events
  //     $('html').unbind("click");
  //     $('button.close').unbind("click");
  //     $('.action-modal-dialog').unbind("click");

  //     // Remove modal and opaque backdrop
  //     $('#loginModal').modal('hide');
  //     $('#loginModal').remove();
  //     $('.modal-backdrop').remove();
  //   },

  //   loginFb: function() {
  //     var self = this;
  //     self.hideLoginModal();

  //     //Ask for default permissions
  //     Parse.FacebookUtils.logIn('public_profile,email,user_friends', {
  //       success: function(user) {
  //         // fetch the FB user data
  //         Parse.User.current().fetch().then(
  //           function() {
  //             new userView();
  //             self.undelegateEvents();
  //             delete self;
  //           }
  //         );
  //       }
  //     });
  //   },

  //   render: function() {
  //     var self = this;
  //     this.$el.html(_.template($("#login-template").html()));
  //     this.delegateEvents();
  //   }
  // });

  // The main view for the app
  var AppView = Parse.View.extend({

    inviteModalTemplate: _.template($('#invite-modal-template').html()),

    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#app-container"),

    navEl: ".button-container",

    events: {
      "click .login-fb": "logInFb",
      "click .log-out": "logOut"
    },

    initialize: function() {
      // bind model to UI events
      _.bindAll(this, "logInFb", "logOut", "render");

      // if redirected from landing page prepopulate search fields
      if (QueryString.num_beds) {
        var url_num_beds = _.map(QueryString.num_beds.split(','), function (n) { return parseInt(n) });
        if (url_num_beds.length > 0)
          state.set({ num_beds: url_num_beds });
      }

      this.render();
    },

    logInFb: function(e) {
      var self = this;

      //Ask for default permissions
      Parse.FacebookUtils.logIn('public_profile,email,user_friends', {
        success: function(user) {
          // fetch the FB user data
          Parse.User.current().fetch().then(
            function() {
              if (self.searchView) {
                self.searchView.close();
                delete this.searchView;
              }

              self.render();
            }
          );
        },
        error: function(user, error) {
          self.$("input.login-fb").removeAttr("disabled");
        }
      });

      this.$("input.login-fb").attr("disabled", "disabled");

      return false;
    },

    logOut: function(e) {
      Parse.User.logOut();
      if (this.searchView) {
        this.searchView.close();
        delete this.searchView;
      }

      this.render();
    },

    showInviteModal: function() {
      var self = this;
      
      // Insert modal and load it
      $('body').append(self.inviteModalTemplate({code: state.get("group").get("group_name")}));
      $('#inviteModal').modal();
      
      // Since the modal is inserted after jQuery loads we need to re-bind
      // the click events which close the modal (outside model, on 'x' sign)
      $('html').bind("click", self.hideInviteModal);
      $('button.close').bind("click", self.hideInviteModal);
      $('.action-modal-dialog').bind("click", function(event){
          event.stopPropagation();
      });

      // bind the login with facebook button
      $('.btn-fb').bind("click", $.proxy(self.sendFbMessage, self));

      return false;
    },

    hideInviteModal: function() {
      // Unbind the click events
      $('html').unbind("click");
      $('button.close').unbind("click");
      $('.action-modal-dialog').unbind("click");

      // Remove modal and opaque backdrop
      $('#inviteModal').modal('hide');
      $('#inviteModal').remove();
      $('.modal-backdrop').remove();
    },

    sendFbMessage: function() {
      FB.ui({
        app_id: 1570124209875630,
        method: 'send', 
        link: 'http://www.housequest.co.uk?invite=' 
                + state.get("group").get("group_name")
      });
    },

    render: function() {
      var self = this;

      if (Parse.User.current()) {
        var Group = Parse.Object.extend("Group");
        var groupQuery = new Parse.Query(Group);
        groupQuery.equalTo("users", Parse.User.current());
        groupQuery.include("users");
        groupQuery.include("search");

        groupQuery.first().then( function (group) {
          state.set({ group: group });

          // Show current user, and group members in navbar
          var userNav = _.template($("#nav-main-template").html());

          // Get the array of friend names and profile images
          var friendsData = _.chain(state.get("group").get("users"))
            .filter(function(u) {
              return u.id != Parse.User.current().id
            })
            .map(function (u) { 
              return {
                first_name: u.get("first_name"),
                profile_img: u.get("profile_image_url")
              }
            })
            .value();

          // display navbar
          $(self.navEl).html(userNav({ users: friendsData }));
          $('.user-invite').bind("click", $.proxy(self.showInviteModal, self));

          // If it exists display group's search, default search otherwise
          var search = group.has("search") ? 
            group.get("search") : new Search({ num_beds: state.get("num_beds") });

          self.searchView = new SearchView({
            model: search
          });
        });
      } else {
        $(this.navEl).html(_.template($("#nav-login-template").html()));
        this.searchView = new SearchView({
          model: new Search({num_beds: state.get("num_beds")})
        });
      }

      this.delegateEvents();
    }
  });

  //TODO: routes for embedded query in URL
  // var AppRouter = Parse.Router.extend({
  //   routes: {

  //   },
  // });
  
  // This is the transient application state, not persisted on Parse
  var AppState = Parse.Object.extend("AppState", {
    defaults: {
      group: undefined,
      num_beds: [0, 1, 2, 3, 4]
    }
  });

  var state = new AppState;

  //new AppRouter;
  new AppView;
  //Parse.history.start();
});