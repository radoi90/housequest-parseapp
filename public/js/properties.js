var map, CHARING_CROSS = new google.maps.LatLng(51.507222,-0.1275);

function initializeMap() {
  var mapOptions = {
    zoom: 12,
    minZoom: 10,
    maxZoom: 17,
    center: CHARING_CROSS
  }
  
  map = new google.maps.Map(document.getElementById('map-canvas'),
                                mapOptions);

  var boroughs = new google.maps.KmlLayer({
    url: 'http://housequest.parseapp.com/data/london_boroughs.kml',
    suppressInfoWindows: true,
    preserveViewport: true
  });
  boroughs.setMap(map);

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

  // Search Model
  // ----------

  // The Search model represents a user's search query
  var Search = Parse.Object.extend("Search", {
    // Default query parameters.
    defaults: {
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
      "change .num-beds-select" : "changeNumBeds",
      "change #price-min"       : "changePriceMin",
      "change #price-max"       : "changePriceMax",
      "change #with-photos"     : "changeWithPhotos",
      "click .btn-save"         : "saveSearch",
      "change input"            : "performSearch"
    },

    initialize: function() {
      $(this.el).html(this.template(this.model.toJSON()));

      $( "#price-slider" ).slider({
        range:true,
        min: 0,
        max: 6000,
        step: 50,
        values: [ this.model.get("price_min"), this.model.get("price_max") ],
        slide: function( event, ui ) {
          $( "#price-min" ).val(ui.values[0]);
          $( "#price-min" ).trigger("change");
          
          $( "#price-max" ).val(ui.values[1]);
          $( "#price-max" ).trigger("change");
        }
      });

      _.bindAll(this, 'render');
      this.model.bind('change', this.render);
    },

    render: function() {
      this.delegateEvents();
    },

    changeNumBeds: function(e) {
      var beds = this.model.get("num_beds");
      var value = parseInt(e.target.value);

      beds = e.target.checked ? _.union(beds,[value]) : _.difference(beds,[value]);

      console.log(beds);
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
      console.log("search");

    },

    saveSearch: function() {
      this.model.set({group: Parse.User.current().get("group")});
      console.log(this.model);
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
      initializeMap();
      this.render();
    },

    render: function() {
      if (Parse.User.current()) {
        var searchQuery = new Parse.Query(Search);
        searchQuery.equalTo("group", Parse.User.current().get("group"));

        searchQuery.first({
          success: function(search) {
            if (search) {
              new SearchView({model: search});
            } else {
              new SearchView({model: new Search()});
            }
          }
        });
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