$( document ).ready(function() {
	/* dev */
	Parse.initialize("5ITlOKP4A8ggw5KYLJnsHYyOoQ9CZydXeUDSqjiQ",
		"lsm1ZGuKXFw1PLaU6WYHHSLN2o2V6FQd8675nfmi");
	/* prod */
	// Parse.initialize("5ITlOKP4A8ggw5KYLJnsHYyOoQ9CZydXeUDSqjiQ", 
	// 	"lsm1ZGuKXFw1PLaU6WYHHSLN2o2V6FQd8675nfmi");
	$('.carousel').carousel({
  		interval: 3500
	});

	var Email = Parse.Object.extend("Email");
	var query = new Parse.Query(Email);
	query.count({
	  success: function(count) {
	    // The count request succeeded. Show the count
		var string = "Join " + (603 + count) + " others and get early access";
		$("#join-text").text(string);
	  },
	  error: function(error) {
	    // The request failed
	    alert(error);
	  }
	});

	$('#email-form').submit(function(event) {
		event.preventDefault();
		submit();
	});
});

function submit() {
	var email = $("#email").val();
	console.log(email);

  $(".h5").remove();
  $(".h3").text("Great! Look out for our email in a few hours.");
  $(".h3").css("color","#27ae60");
  $("#sign-up-box").remove();

	var EmailObject = Parse.Object.extend("Email");
	var emailObject = new EmailObject();
	emailObject.save({email: email}).then(function(object) {
	
	});
}