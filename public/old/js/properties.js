var dateDiff = function(s) {
  var a = s.split(/[^0-9]/);
  var date = new Date (a[0],a[1]-1,a[2],a[3],a[4],a[5] );
  var milisDiff = new Date() - date, 
        secDiff = milisDiff / 1000,
        minDiff = secDiff / 60,
          hDiff = minDiff / 60,
        dayDiff = hDiff / 24,
       weekDiff = dayDiff/7;

  if (weekDiff >= 2) return Math.floor(weekDiff) + " weeks ago";
  else if (weekDiff >=1) return "1 week ago";
  else if (dayDiff >=2) return Math.floor(dayDiff) + " days ago";
  else if (dayDiff >=1) return "1 day ago";
  else if (hDiff >=2) return Math.floor(hDiff) + " hours ago";
  else if (hDiff >=1) return "1 hour ago";
  else if (minDiff >=2) return Math.floor(minDiff) +  " minutes ago";
  else if (minDiff >=1) return "1 minute ago";
  else if (secDiff >=2) return Math.floor(secDiff) + " seconds ago";
  else return "moments ago";
}

//http://www.zoopla.co.uk/for-sale/details/14959841?featured=1&utm_content=featured_listing
function getZooplaID(s) {
  var detailsString = "details/";
  var found = false;

  while (!found && detailsString.length > 0) {
    found = s.indexOf(detailsString) > -1;
    if (!found) detailsString = detailsString.substring(1, detailsString.length);
  }

  if (found) {
    s = s.substring(s.indexOf(detailsString) + detailsString.length, s.length);
  }

  var i = 0, id = "";
  while (!isNaN(parseInt(s[i])) && i < s.length) {
    id += s[i];
    i += 1;
  }

  return id;
}

var getJSONP = function(url, success) {
  var ud = '_' + +new Date,
      script = document.createElement('script'),
      head = document.getElementsByTagName('head')[0] 
             || document.documentElement;

  window[ud] = function(data) {
      head.removeChild(script);
      success && success(data);
  };

  script.src = url.replace('callback=?', 'jsonp=' + ud);
  head.appendChild(script);
};

var map, hook, CHARING_CROSS = new google.maps.LatLng(51.507222,-0.1275);

function initializeMap() {
  var mapOptions = {
    zoom: 14,
    center: CHARING_CROSS
  }
  
  map = new google.maps.Map(document.getElementById('map-canvas'),
                                mapOptions);

  var transitLayer = new google.maps.TransitLayer();
  transitLayer.setMap(map);

  var control = document.getElementById('transit-wpr');
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(control);

  google.maps.event.addDomListener(control, 'click', function() {
    transitLayer.setMap(transitLayer.getMap() ? null : map);
  });
};

$(function() {

  Parse.$ = jQuery;

  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("5ITlOKP4A8ggw5KYLJnsHYyOoQ9CZydXeUDSqjiQ",
                   "lsm1ZGuKXFw1PLaU6WYHHSLN2o2V6FQd8675nfmi");

  if (Parse.User.current()) {
    ga('create', 'UA-37859939-3', { 'userId': Parse.User.current().id });
  } else {
    ga('create', 'UA-37859939-3', 'auto');
  }

  ga('send', 'pageview');

  // Property Model
  // ----------

  // The Property model represents a listing
  var Property = Parse.Object.extend("Property", {
    // Default attributes for the property.
    defaults: {
      content: "empty listing",
      hidden: false,
      starred: false,
      booked: false,
    },

    // Ensure that each property created has `content`.
    initialize: function() {
      if (!this.get("content")) {
        this.set({"content": this.defaults.content});
      }
    },

    // Toggle the `starred` state of this property item.
    star: function() {
      this.save({starred: !this.get("starred")});
      ga('send', 'propertyClick', 'star', Parse.User.current(), this.get("content").details_url);
    },

    // Toggle the `hidden` state of this property item.
    hide: function() {
      this.save({hidden: !this.get("hidden")});
      ga('send', 'propertyClick', 'hide', Parse.User.current(), this.get("content").details_url);
    },

    // Toggle the `booked` state of this property item.
    book: function() {
        this.save({booked: true});
        ga('send', 'propertyClick', 'book', Parse.User.current(), this.get("content").details_url);
        var listing = this.get("content");
        $("#viewing-number").val(listing.agent_phone);
        $("#viewing-address").val(listing.displayable_address);
        $("#viewing-beds").val(listing.num_bedrooms);
        $("#viewing-pcm").val(listing.rental_prices.per_month+' pcm');
        $("#viewing-link").val(listing.details_url);

        $("#viewing-form").submit();
    }
  });

  // This is the transient application state, not persisted on Parse
  var AppState = Parse.Object.extend("AppState", {
    defaults: {
      filter: "active"
    }
  });

  // Property Collection
  // ---------------

  var PropertyList = Parse.Collection.extend({

    // Reference to this collection's model.
    model: Property,

    // Filter down the list of all property items that have been booked.
    booked: function() {
      return this.filter(function(property){ return property.get('booked'); });
    },

     // Filter down the list of all property items that are hidden.
    hidden: function() {
      return this.filter(function(property){ return property.get('hidden'); });
    },

    // Filter down the list to only property items that are not hidden.
    active: function() {
      return this.without.apply(this, this.hidden());
    },

      // Filter down the list of all property items that are starred.
    starred: function() {
      return this.filter(function(property){ return property.get('starred'); });
    },

    // Properties are sorted by their listing date.
    comparator: function(property) {
      var s = property.get('content').last_published_date;
      var a = s.split(/[^0-9]/);
      var date = new Date (a[0],a[1]-1,a[2],a[3],a[4],a[5] );
      return -date;
    }

  });

  // Property Item View
  // --------------

  // The DOM element for a property item...
  var PropertyView = Parse.View.extend({

    //... is a list tag.
    tagName:  "li",

    // Cache the template function for a single item.
    template: _.template($('#item-template').html()),

    // The DOM events specific to an item.
    events: {
      "click .property-box"    : "showDetails",
      "click .book"            : "toggleBooked",
      "click .heart"           : "toggleStar",
      "click .remove"          : "toggleHidden",
      "mouseenter .property-box"   : "highlightOn",
      "mouseleave .property-box"   : "highlightOff",
    },

    marker: google.maps.Marker,

    // The PropertyView listens for changes to its model, re-rendering. Since there's
    // a one-to-one correspondence between a Property and a PropertyView in this
    // app, we set a direct reference on the model for convenience.
    initialize: function() {
      _.bindAll(this, 'render', 'remove');
      this.model.bind('change', this.render);
      this.el.id = this.model.get("content").listing_id;
      this.renderMarker();
    },

    // Re-render the contents of the property item.
    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));

      $("#" + this.el.id + " h4").text(
        ($("#"+ this.el.id).index() + 1) +". " +$("#" + this.el.id + " h4").text());
      return this;
    },

    renderMarker: function() {
      var self = this;
      var myLatLng = new google.maps.LatLng(this.model.get('content').latitude, this.model.get('content').longitude);
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
        title: "" + $("#"+ this.el.id).index(),
        zIndex: -$("#"+ this.el.id).index()
      });

      google.maps.event.addListener(this.marker, 'click', function() {
        $('#list').animate({
          scrollTop: $('#list').scrollTop() + -45 + $(self.el).position().top
        }, 1000);
      });
    },

    // Toggle the `"star"` state of the model.
    toggleStar: function() {
      this.model.star();

      var filterValue = state.get("filter");
      if (filterValue == "starred") {
        this.remove();
      }
    },

    // Toggle the `"hidden"` state of the model.
    toggleHidden: function() {
      var self = this;
      this.model.hide();

      this.remove();
    },

    // Toggle the `"booked"` state of the model.
    toggleBooked: function() {
      this.model.book();
    },

    highlightOn: function() {
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

    remove: function() {
      this.trigger('remove', this);
    },

    removeView: function() {
      this.marker.setMap(null);
      this.marker = null;

      $(this.el).remove();
    },

    showDetails: function(e) {
      var el = $(e.target);
      if (el[0].className == "property") {
        window.open(this.model.get("content").details_url,'_blank');
      }
    }
  });

  // The Application
  // ---------------

  // The main view that lets a user manage their property items
  var ManagePropertiesView = Parse.View.extend({

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "click button.btn-logout": "logOut",
      "click div#filters button": "selectFilter"
    },

    el: ".content",

    views: [],

    // At initialization we bind to the relevant events on the `Properties`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting properties that might be saved to Parse.
    initialize: function() {
      var self = this;
      _.bindAll(this, 'addOne', 'addAll', 'addActive', 'addSome', 'render', 'logOut');

      // Main property management template
      this.$el.html(_.template($("#manage-properties-template").html()));

      // Create our collection of Properties
      this.properties = new PropertyList;

      initializeMap();

      // Setup the query for the collection to look for properties from the current user
      this.properties.query = new Parse.Query(Property);
      this.properties.query.equalTo("user", Parse.User.current());
        
      this.properties.bind('add',     this.addOne);
      this.properties.bind('reset',   this.addActive);
      this.properties.bind('all',     this.render);

      // Fetch all the properties items for this user
      this.properties.fetch({
        success: function(list) {
          if (list.length) $("#list-placeholder").remove();
        }
      });

      state.on("change", this.filter, this);
    },

    // Logs out the user and shows the login view
    logOut: function(e) {
      Parse.User.logOut();
      new LogInView();
      this.undelegateEvents();
      delete this;
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function() {
      this.delegateEvents();
    },

    // Filters the list based on which type of filter is selected
    selectFilter: function(e) {
      var el = $(e.target);
      var filterValue = el.attr("id");
      
      if (!filterValue) {
        el = $(e.target.parentElement);
        filterValue = el.attr("id");
      }
      
      state.set({filter: filterValue});
      Parse.history.navigate(filterValue);
    },

    filter: function() {
      var filterValue = state.get("filter");
      ga('send', 'filter', filterValue, Parse.User.current());

      this.$("div#filters button").removeClass("selected");
      this.$("div#filters button#" + filterValue).addClass("selected");

      if (filterValue === "all") {
        this.addAll();
      } else if (filterValue === "starred") {
        this.addSome(function(item) { return item.get('starred') });
      } else if (filterValue === "hidden") {
        this.addSome(function(item) { return item.get('hidden') });
      } else if (filterValue === "booked") {
        this.addSome(function(item) { return item.get('booked') });
      } else {
        this.addSome(function(item) { return !item.get('hidden') });
      }
    },

    // Resets the filters to display all properties
    resetFilters: function() {
      this.$("div#filters button").removeClass("selected");
      this.$("div#filters button#active").addClass("selected");
      this.addSome(function(item) { return !item.get('hidden') });
    },

    // Add a single property item to the list by creating a view for it, and
    // appending its element to the `<ul>`.
    addOne: function(property) {
      var view = new PropertyView({model: property});
      this.views.push(view);
      this.$("#property-list").append(view.render().el);
      
      view.on('remove', this.removeOne, this);
    },

     // Add all items in the Properties collection at once.
    addAll: function(collection, filter) {
      this.removeAll();
      this.properties.each(this.addOne);
    },

    // Add all active items in the Properties collection at once.
    addActive: function(collection, filter) {
      this.addSome(function(item) { return !item.get('hidden') });
    },

    // Only adds some properties, based on a filtering function that is passed in
    addSome: function(filter) {
      var self = this;
      this.removeAll();

      this.properties.chain().filter(filter).each(function(item) { self.addOne(item) });
    },

    removeOne: function(view) {
      var index = this.views.indexOf(view);

      if (index > -1) {
        view.removeView();
        this.views.splice(index,1);
      }

      //if no properties are present reset map center to Charing Cross
      if (this.views.length == 0) {
        map.setCenter(CHARING_CROSS);
        map.setZoom(14);
      }
    },

    removeAll: function() {
      while (this.views.length > 0) {
        this.removeOne(this.views[0]);
      }

      map.setCenter(CHARING_CROSS);
      map.setZoom(14);
    }
  });

  // The main view for the app
  var AppView = Parse.View.extend({
    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#app-container"),

    initialize: function() {
      this.render();
    },

    render: function() {
      if (Parse.User.current()) {
        $("#user-name").html("<span class='user-icon glyphicon glyphicon-user'></span>"+ Parse.User.current().get("first_name") +"'s feed");
        $("#options-panel").hide();
        new ManagePropertiesView();
      } else {
        window.location.href ="index.html";
      }
    }
  });

  var AppRouter = Parse.Router.extend({
    routes: {
      "active": "active",
      "all": "all",
      "starred": "starred",
      "hidden": "hidden",
      "booked": "booked"
    },

    initialize: function(options) {
      state.set({ filter: "active" });
    },

    all: function() {
      state.set({ filter: "all" });
    },

    active: function() {
      state.set({ filter: "active" });
    },

    starred: function() {
      state.set({ filter: "starred" });
    },

    hidden: function() {
      state.set({ filter: "hidden" });
    },

    booked: function() {
      state.set({ filter: "booked" });
    }
  });

  var state = new AppState;

  new AppRouter;
  new AppView;
  Parse.history.start();
});