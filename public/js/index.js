var log = console.log.bind(console);

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

$(function() {

	Parse.$ = jQuery;

	// Initialize Parse with your Parse application javascript keys
	Parse.initialize("5ITlOKP4A8ggw5KYLJnsHYyOoQ9CZydXeUDSqjiQ",
	               "lsm1ZGuKXFw1PLaU6WYHHSLN2o2V6FQd8675nfmi");

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

  var MainView = Parse.View.extend({
    actionTemplate: _.template($('#action-box-welcome-template').html()),

    events: {
      "click .log-out": "logOut"
    },

    el: ".button-container",

    initialize: function() {
      this.render();
      _.bindAll(this, "logOut", "render");
    },

    logOut: function(e) {
      Parse.User.logOut();
      new LogInView();
      this.undelegateEvents();
      delete this;
    },

    render: function() {
      var self = this;
      this.$el.html(_.template($("#mainview-template").html()));
      $('#action-box').html(self.actionTemplate());

      this.delegateEvents();
    }
  });

	var LogInView = Parse.View.extend({
    actionTemplate: _.template($('#action-box-people-template').html()),

    events: {
      "click .login-fb": "logInFb",
    },

    el: ".button-container",
    
    initialize: function() {
      _.bindAll(this, "logInFb", "render");
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
              new MainView();
              self.undelegateEvents();
              delete self;
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

    render: function() {
      var self = this;
      this.$el.html(_.template($("#login-template").html()));
      $('#action-box').html(self.actionTemplate());
      this.delegateEvents();
    }
  });

	// The main view for the app
	var AppView = Parse.View.extend({
		// Instead of generating a new element, bind to the existing skeleton of
		// the App already present in the HTML.
		el: $("#mainapp"),

		initialize: function() {
		  this.render();
		},

		render: function() {
      if (Parse.User.current()) {
        new MainView();
      } else {
        new LogInView();
      }
		}
	});

	new AppView;
});