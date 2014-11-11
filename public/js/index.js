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

  var userView = Parse.View.extend({
    actionTemplate: _.template($('#action-box-welcome-template').html()),

    joinGroupModalTemplate: _.template($('#join-group-modal-template').html()),

    inviteModalTemplate: _.template($('#invite-modal-template').html()),

    events: {
      "click .join-group": "showJoinGroupModal",
      "click .log-out": "logOut"
    },

    el: ".button-container",

    initialize: function() {
      var self = this;
      _.bindAll(this, "logOut", "showJoinGroupModal", "showInviteModal", "render");
      
      var Group = Parse.Object.extend("Group");
      var groupQuery = new Parse.Query(Group);
      groupQuery.equalTo("users", Parse.User.current());
      groupQuery.select(["group_name"]);

      groupQuery.first()
      .then( function (group) {
        if (group) {
          state.set("group", group);
          $('.user-invite').bind("click", $.proxy(self.showInviteModal, self));
        }
      });

      this.render();

      if (QueryString.invite) {
        this.joinGroup(QueryString.invite);
      }
    },

    joinGroupManual: function() {
      var codeField = $("#invite-code");

      codeField.val() && this.joinGroup(codeField.val());
    },

    joinGroup: function (code) {
      Parse.Cloud.run("joinGroup", {code: code})
      .done( function (group) {
        // reload page if user joined group succesfully
        window.location = window.location.origin + window.location.pathname;
      });
    },

    showJoinGroupModal: function() {
      var self = this;

      // Insert modal and load it
      $('body').append(self.joinGroupModalTemplate());
      $('#joinGroupModal').modal();
        
      // Since the modal is inserted after jQuery loads we need to re-bind
      // the click events which close the modal (outside model, on 'x' sign)
      $('html').bind("click", self.hidejoinGroupModal);
      $('button.close').bind("click", self.hidejoinGroupModal);
      $('.action-modal-dialog').bind("click", function(event){
          event.stopPropagation();
      });

      // bind the login with facebook button
      $('.btn-join').bind("click", $.proxy(self.joinGroupManual, self));

      return false;
    },

    hidejoinGroupModal: function() {
      // Unbind the click events
      $('html').unbind("click");
      $('button.close').unbind("click");
      $('.action-modal-dialog').unbind("click");

      // Remove modal and opaque backdrop
      $('#joinGroupModal').modal('hide');
      $('#joinGroupModal').remove();
      $('.modal-backdrop').remove();
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

    logOut: function(e) {
      Parse.User.logOut();
      new noUserView();
      this.undelegateEvents();
      delete this;
    },

    render: function() {
      var self = this;
      this.$el.html(_.template($("#user-view-template").html()));
      $('#action-box').html(self.actionTemplate());

      this.delegateEvents();
    }
  });

	var noUserView = Parse.View.extend({
    actionTemplate: _.template($('#action-box-people-template').html()),

    loginModalTemplate: _.template($('#login-modal-template').html()),

    events: {
      "click .login-fb": "showLoginModal",
      "click .btn-fb": "loginFb"
    },

    el: ".button-container",
    
    initialize: function() {
      _.bindAll(this, "showLoginModal", "loginFb", "render");
      this.render();

      if (QueryString.invite) {
        this.showLoginModal("to join group");
      }
    },

    showLoginModal: function(e) {
      var self = this;
      var reason = (typeof e === "string") ? e : "";

      // Insert modal and load it
      $('body').append(self.loginModalTemplate({loginReason: reason}));
      $('#loginModal').modal();
        
      // Since the modal is inserted after jQuery loads we need to re-bind
      // the click events which close the modal (outside model, on 'x' sign)
      $('html').bind("click", self.hideLoginModal);
      $('button.close').bind("click", self.hideLoginModal);
      $('.action-modal-dialog').bind("click", function(event){
          event.stopPropagation();
      });

      // bind the login with facebook button
      $('.btn-fb').bind("click", $.proxy(self.loginFb, self));

      return false;
    },

    hideLoginModal: function() {
      // Unbind the click events
      $('html').unbind("click");
      $('button.close').unbind("click");
      $('.action-modal-dialog').unbind("click");

      // Remove modal and opaque backdrop
      $('#loginModal').modal('hide');
      $('#loginModal').remove();
      $('.modal-backdrop').remove();
    },

    loginFb: function() {
      var self = this;
      self.hideLoginModal();

      //Ask for default permissions
      Parse.FacebookUtils.logIn('public_profile,email,user_friends', {
        success: function(user) {
          // fetch the FB user data
          Parse.User.current().fetch().then(
            function() {
              new userView();
              self.undelegateEvents();
              delete self;
            }
          );
        }
      });
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
        new userView();
      } else {
        new noUserView();
      }
		}
	});

  // This is the transient application state, not persisted on Parse
  var AppState = Parse.Object.extend("AppState", {
    defaults: {
      group: undefined,
    }
  });

  var state = new AppState;

	new AppView;
});