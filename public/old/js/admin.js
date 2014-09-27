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
  console.log(id);

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

var map, inputProperty, hook, markers = [];

function initializeMap() {
  var mapOptions = {
    zoom: 11,
    center: new google.maps.LatLng(51.5072, -0.1275)
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

// Add a marker to the map and push to the array.
function addMarker(view) {
  var property =  view.model;
  var myLatLng = new google.maps.LatLng(property.get('content').latitude, property.get('content').longitude);

  var image = {
    url: 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=' +
    ($("#"+ view.el.id).index() + 1 ) +
    '|428bca|FFFFFF',
    // This marker is 20 pixels wide by 32 pixels tall.
    size: new google.maps.Size(21, 34),
    // The origin for this image is 0,0.
    origin: new google.maps.Point(0,0),
    // The anchor for this image is the base of the flagpole at 0,32.
    anchor: new google.maps.Point(11, 34)
  };

  var marker = new google.maps.Marker({
    position: myLatLng,
    map: map,
    icon: image,
    title: "" + $("#"+ view.el.id).index(),
    zIndex: -$("#"+ view.el.id).index()
  });

  markers.push(marker);
}

// Sets the map on all markers in the array.
function setAllMap(map) {
  for (var i = 0; i < markers.length; i++) {
    markers[i].setMap(map);
  }
}

// Removes the markers from the map, but keeps them in the array.
function clearMarkers() {
  setAllMap(null);
}

// Deletes all markers in the array by removing references to them.
function deleteMarkers() {
  clearMarkers();
  markers = [];
}

$(function() {

  Parse.$ = jQuery;

  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("5ITlOKP4A8ggw5KYLJnsHYyOoQ9CZydXeUDSqjiQ",
                   "lsm1ZGuKXFw1PLaU6WYHHSLN2o2V6FQd8675nfmi");

  // Property Model
  // ----------

  // The Property model represents a listing
  var Property = Parse.Object.extend("Property", {
    // Default attributes for the property.
    defaults: {
      hidden: false,
      starred: false,
      booked: false,
    },

    // Ensure that each property created has `content`.
    initialize: function() {
      for (var key in defaults) {
        this.set({key: defaults[key]});
      }
    },

    initialize: function(data) {
      this.set(data);

      this.set({"content": data});
    },

    // Toggle the `starred` state of this property item.
    star: function() {
      this.save({starred: !this.get("starred")});
    },

    // Toggle the `hidden` state of this property item.
    hide: function() {
      this.save({hidden: !this.get("hidden")});
    },

    // Toggle the `starred` state of this property item.
    book: function() {
        this.save({booked: true});
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
    potential: function() {
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
      "click .book"          : "toggleBooked",
      "click .star"              : "toggleStar",
      "click .hide"              : "toggleHidden",
      "mouseleave .listing"      : "highlight"
    },

    // The PropertyView listens for changes to its model, re-rendering. Since there's
    // a one-to-one correspondence between a Property and a PropertyView in this
    // app, we set a direct reference on the model for convenience.
    initialize: function() {
      _.bindAll(this, 'render');
      this.model.bind('change', this.render);
      this.el.id = this.model.get("content").listing_id;
    },

    // Re-render the contents of the property item.
    render: function() {
      $(this.el).html(this.template(this.model.toJSON()));

      $("#" + this.el.id + " h4").text(
        ($("#"+ this.el.id).index() + 1) +". " +$("#" + this.el.id + " h4").text());
      return this;
    },

    // Toggle the `"star"` state of the model.
    toggleStar: function() {
      this.model.star();
    },

    // Toggle the `"hidden"` state of the model.
    toggleHidden: function() {
      this.model.hide();
    },

    // Toggle the `"booked"` state of the model.
    toggleBooked: function() {
      this.model.book();
    },

    highlight: function() {
      console.log("hover");
    }

  });

  // The Application
  // ---------------

  // The main view that lets a user manage their property items
  var ManagePropertiesView = Parse.View.extend({

    // Our template for the line of statistics at the bottom of the app.
    statsTemplate: _.template($('#stats-template').html()),

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "keypress #new-property":  "createOnEnter",
      "click .log-out": "logOut",
      "click ul#filters a": "selectFilter",
      "change #selectUser": "selectUser"
    },

    el: ".content",

    currentUser: undefined,

    // At initialization we bind to the relevant events on the `Properties`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting properties that might be saved to Parse.
    initialize: function(user) {
      var self = this;

      this.currentUser = user;

      _.bindAll(this, 'addOne', 'addAll', 'addActive', 'addSome', 'render', 'logOut', 'createOnEnter');

      // Main property management template
      this.$el.html(_.template($("#manage-properties-template").html()));
      
      this.input = this.$("#new-property");

      var users = state.get("users");
      var select = document.getElementById("selectUser"); 

      for(var i = 0; i < users.length; i++) {
        var u = users[i];
        var el = document.createElement("option");
        el.textContent = u.attributes.username;
        el.value = u.id;
        el.selected = this.currentUser == u;
        select.appendChild(el);
      }
      
      if (this.currentUser) {
        // Create our collection of Properties
        this.properties = new PropertyList;

        initializeMap();

        // Setup the query for the collection to look for properties from the current user
        this.properties.query = new Parse.Query(Property);
        this.properties.query.equalTo("user", this.currentUser);
          
        this.properties.bind('add',     this.addOne);
        this.properties.bind('reset',   this.addActive);
        this.properties.bind('all',     this.render);

        // Fetch all the properties items for this user
        this.properties.fetch();
      }

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
      var starred = this.properties.starred().length;
      var hidden = this.properties.hidden().length;
      var booked = this.properties.booked().length;

      this.$('#property-stats').html(this.statsTemplate({
        total:      this.properties.length,
        starred:    starred, 
        hidden:     hidden,
        booked:   booked
      }));

      this.delegateEvents();
    },

    selectUser: function(e) {
      var uid = $("#selectUser option:selected")[0].value;
      var newUser = (state.get("users").filter(function(u) { return u.id == uid}))[0];

      new ManagePropertiesView(newUser);
      this.undelegateEvents();
      delete this;
    },

    // Filters the list based on which type of filter is selected
    selectFilter: function(e) {
      var el = $(e.target.parentElement);
      var filterValue = el.attr("id");
      state.set({filter: filterValue});
      Parse.history.navigate(filterValue);
    },

    filter: function() {
      var filterValue = state.get("filter");
      this.$("ul#filters li").removeClass("selected");
      this.$("ul#filters li#" + filterValue).addClass("selected");
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
      this.$("ul#filters li").removeClass("selected");
      this.$("ul#filters li#active").addClass("selected");
      this.addSome(function(item) { return !item.get('hidden') });
    },

    // Add a single property item to the list by creating a view for it, and
    // appending its element to the `<ul>`.
    addOne: function(property) {
      var view = new PropertyView({model: property});
      this.$("#property-list").append(view.render().el);

      $("#" + view.el.id + " h4").text(
        ($("#"+ view.el.id).index() + 1) +". " +$("#" + view.el.id + " h4").text());
      
      addMarker(view);
    },

     // Add all items in the Properties collection at once.
    addAll: function(collection, filter) {
      this.$("#property-list").html("");
      deleteMarkers();
      this.properties.each(this.addOne);
    },

    // Add all active items in the Properties collection at once.
    addActive: function(collection, filter) {
      this.addSome(function(item) { return !item.get('hidden') });
    },

    // Only adds some properties, based on a filtering function that is passed in
    addSome: function(filter) {
      var self = this;
      this.$("#property-list").html("");
      deleteMarkers();
      this.properties.chain().filter(filter).each(function(item) { self.addOne(item) });
    },

    // If you hit return in the main input field, create new Property model
    createOnEnter: function(e) {
      hook = this;
      if (e.keyCode != 13) return;

      var zooplaAPI = 'http://api.zoopla.co.uk/api/v1/property_listings.js?listing_id=' +
                      getZooplaID(this.input.val()) +
                      '&api_key=kwt27yfdcvd6ek4gq2bqy2z5&callback=?';

      this.input.val('');
      getJSONP(zooplaAPI, function(data) {      
        var propACL = new Parse.ACL(hook.currentUser);
        propACL.setRoleReadAccess("Administrator",true);
        propACL.setRoleWriteAccess("Administrator",true);

        var newProp =  new Property(data.listing[0]);
        newProp.set({"ACL": propACL});
        newProp.set({"user": hook.currentUser});

        hook.properties.create(newProp);

        hook.resetFilters();
      });
    }
  });

  var LogInView = Parse.View.extend({
    events: {
      "submit form.login-form": "logIn",
      "click a.reset-password": "resetPassword"
    },

    el: ".content",
    
    initialize: function() {
      _.bindAll(this, "logIn");
      this.render();
    },

    logIn: function(e) {
      var self = this;
      var email = this.$("#login-email").val();
      var password = this.$("#login-password").val();
      
      Parse.User.logIn(email, password, {
        success: function(user) {
          var query = (new Parse.Query(Parse.Role));
          query.equalTo("name", "Administrator");
          query.equalTo("users", Parse.User.current());
          query.first().then(function(adminRole) {
              if (adminRole) {
                  new ManagePropertiesView();
                  self.undelegateEvents();
                  delete self;
              } else {
                self.$(".login-form .success").hide();  
                self.$(".login-form .error").html("No admin rights.").show();
                self.$(".login-form button").removeAttr("disabled");
              }
          });
          
        },

        error: function(user, error) {
          self.$(".login-form .success").hide();  
          self.$(".login-form .error").html("Invalid email or password. Please try again. Or, <a class='reset-password'>reset password</a>.").show();
          self.$(".login-form button").removeAttr("disabled");
        }
      });

      this.$(".login-form button").attr("disabled", "disabled");

      return false;
    },

    resetPassword: function() {
      var email = this.$("#login-email").val();

      Parse.User.requestPasswordReset(email, {
        success: function() {
          self.$(".login-form .success").html("We've sent you a password reset email to " + email).show();
          self.$(".login-form .error").hide();
        },
        error: function(error) {
          self.$(".login-form .success").hide();
          if(email.length > 0) {
            self.$(".login-form .error").html("There is no user assigned to " + email).show();
          } else {
            self.$(".login-form .error").html("To reset your password enter the email you used to sign up.").show();
          }          
          self.$(".login-form button").removeAttr("disabled");
        }
      });
    },

    render: function() {
      this.$el.html(_.template($("#login-template").html()));
      this.delegateEvents();
    }
  });

  // The main view for the app
  var AppView = Parse.View.extend({
    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#propertyapp"),

    initialize: function() {
      var self = this;
      var usersQuery = new Parse.Query(Parse.User);
      var users = usersQuery.find({
        success: function(list) {
          state.set({ users: list});
          self.render(list);
        }
      });
    },

    render: function(list) {
      if (Parse.User.current()) {
        new ManagePropertiesView();
      } else {
        new LogInView();
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