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
    // FB.ui({
    //   method: 'send',
    //   link: 'http://housequest.parseapp.com',
    // });
  };
 
  (function(d, s, id){
    var js, fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) {return;}
    js = d.createElement(s); js.id = id;
    js.src = "//connect.facebook.net/en_US/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
  }(document, 'script', 'facebook-jssdk'));

	var LogInView = Parse.View.extend({
    events: {
      "click #login-fb-btn": "logInFb",
    },

    el: ".content",
    
    initialize: function() {
      _.bindAll(this, "logInFb");
      this.render();
    },

    logInFb: function(e) {
      var self = this;

      Parse.FacebookUtils.logIn('public_profile,email,user_friends', {
			  success: function(user) {
			    if (!user.existed()) {
            console.log(Parse.User.current());
            FB.api('/me', function(fbData) {
              var current = Parse.User.current();
              current.set("email", fbData.email);
              current.set("first_name", fbData.first_name);
              current.set("last_name", fbData.last_name);
              current.set("gender", fbData.gender);
              var userACL = new Parse.ACL();
              userACL.setRoleReadAccess("Administrator", true);
              current.set("ACL", userACL);
              current.save();
            });
			    }
			  },
			  error: function(user, error) {
			    self.$(".login-form button").removeAttr("disabled");
			  }
			});

      this.$(".login-form button").attr("disabled", "disabled");

      return false;
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
		el: $("#mainapp"),

		initialize: function() {
		  this.render();
		},

		render: function() {
      if (Parse.User.current()) {
      } else {
        new LogInView();
      }
		}
	});

	new AppView;
});