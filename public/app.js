$( document ).ready(function() {
	Parse.initialize("5ITlOKP4A8ggw5KYLJnsHYyOoQ9CZydXeUDSqjiQ", "lsm1ZGuKXFw1PLaU6WYHHSLN2o2V6FQd8675nfmi");
	$('.carousel').carousel({
  		interval: 3500
	});

	$("#email-form").submit(function( event ) {
		var email = $("#email").val();
		console.log(email);

		var EmailObject = Parse.Object.extend("Email");
		var emailObject = new EmailObject();
		emailObject.save({email: email}).then(function(object) {
		  $(".h5").remove();
		  $(".h3").text("Great! Look out for our email in a few hours.");
		  $(".h3").css("color","#27ae60");
		});
	});
});