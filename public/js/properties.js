var CHARING_CROSS = new google.maps.LatLng(51.507222,-0.1275);

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

  // Initialize Parse with your Parse application javascript keys
  Parse.initialize("5ITlOKP4A8ggw5KYLJnsHYyOoQ9CZydXeUDSqjiQ",
                   "lsm1ZGuKXFw1PLaU6WYHHSLN2o2V6FQd8675nfmi");

  // The FeedEntry model is a wrapper to a Listing object
  var FeedEntry = Parse.Object.extend("FeedEntry", {
    defaults: {
      comments: [],
      users_liked: [],
      users_seen: []
    },

    // Ensure that each todo created has `content`.
    initialize: function(listing) {
      this.set("listing", listing);
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
        
        if (this.likedByCurrentUser()) {
          // unlike
          this.remove("users_liked", Parse.User.current());
        } else {
          // like
          this.addUnique("users_liked", Parse.User.current());
        }
        
        this.save();  
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
    }
  });

  // FeedEntry Collection
  // ---------------

  var Feed = Parse.Collection.extend({

    // Reference to this collection's model.
    model: FeedEntry,

    // Filter down the list of all todo items that are finished.
    done: function() {
      return this.filter(function(todo){ return todo.get('done'); });
    },

    // Filter down the list to only todo items that are still not finished.
    remaining: function() {
      return this.without.apply(this, this.done());
    },

    // We keep the Todos in sequential order, despite being saved by unordered
    // GUID in the database. This generates the next order number for new items.
    nextOrder: function() {
      if (!this.length) return 1;
      return this.last().get('order') + 1;
    },

    // Entries are sorted by the listing published date/price
    comparator: function(entry) {
      //TODO: add more types of compare
      return entry.get('listing').get('last_published_date');
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

  // The DOM element for a property item...
  var SearchView = Parse.View.extend({
    el: "#search-container",

    template: _.template($('#search-template').html()),

    events: {
      "change #areas"           : "changeAreas",
      "change .num-beds-select" : "changeNumBeds",
      "change #price-min"       : "changePriceMin",
      "change #price-max"       : "changePriceMax",
      "change #with-photos"     : "changeWithPhotos",
      "click .btn-save"         : "saveSearch"
    },

    initialize: function() {
      $(this.el).html(this.template(this.model.toJSON()));

      // bind events
      _.bindAll(this, 'render', 'performSearch','initializeMap');
      this.model.bind('change', this.render);
      this.model.bind('change', this.performSearch);

      // initialize price slider
      $( "#price-slider" ).slider({
        range:true,
        min: 0,
        max: 6000,
        step: 50,
        values: [ this.model.get("price_min"), this.model.get("price_max") ],
        slide: function( event, ui ) {
          $( "#price-min" ).val(ui.values[0]);
          $( "#price-max" ).val(ui.values[1]);
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

      // intialize map
      this.initializeMap();
      this.performSearch();
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
        event.feature.setProperty('isSelected', _.contains(areas,event.feature.getProperty("name")));
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

      var transitLayer = new google.maps.TransitLayer();
      transitLayer.setMap(map);

      var control = document.getElementById('transit-wpr');
      map.controls[google.maps.ControlPosition.TOP_RIGHT].push(control);

      google.maps.event.addDomListener(control, 'click', function() {
        transitLayer.setMap(transitLayer.getMap() ? null : map);
      });
    },

    render: function() {
      this.delegateEvents();
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

    performSearch: function() {
      var Listing = Parse.Object.extend("Listing");
      var query = new Parse.Query(Listing);

      if (this.model.get("num_beds").length > 0) {
        query.containedIn("num_bedrooms", this.model.get("num_beds"));
      }

      if (this.model.get("areas").length > 0) {
        query.containedIn("borough", this.model.get("areas"));
      } else {
        var SW = this.map.getBounds().getSouthWest();
            SW = new Parse.GeoPoint(SW.lat(), SW.lng());
        var NE = this.map.getBounds().getNorthEast();
            NE = new Parse.GeoPoint(NE.lat(), NE.lng());
        console.log(SW);
        console.log(NE);
        query.withinGeoBox("location", SW, NE)
      }

      query.greaterThanOrEqualTo("price_per_month", this.model.get("price_min"));

      if (this.model.get("price_max") < 6000) {
        query.lessThanOrEqualTo("price_per_month", this.model.get("price_max"));
      }

      if (this.model.get("with_photos")) {
        query.notEqualTo("image_url","");
      }

      query.find({
        success: function(results) {
          for (var i = 0; i < results.length; i++) {
            console.log(results[i].get("details_url") +" " +results[i].id);
          }
        }
      });
    },

    saveSearch: function() {
      this.model.set({group: Parse.User.current().get("group")});
      this.model.save();
    }
  });

  // The Application
  // ---------------

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
        Parse.User.current().get("group").fetch(
        ).then(
          function(group) {
            return group.get("search").fetch();
          }
        ).then(
          function(search) {
            if (search) {
              new SearchView({model: search});
            } else {
              new SearchView({model: new Search()});
            }
          }
        );
      } else {
        new SearchView({model: new Search()});
      }
    }
  });

  //TODO: routes for embedded query in URL
  // var AppRouter = Parse.Router.extend({
  //   routes: {

  //   },
  // });
  
  // TODO: This is the transient application state, not persisted on Parse
  // var AppState = Parse.Object.extend("AppState", {
  //   defaults: {
  //     TODO: SEARCH QUERY, default London
  //   }
  // });

  // var state = new AppState;

  //new AppRouter;
  new AppView;
  //Parse.history.start();
});