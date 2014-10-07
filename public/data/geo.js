
function locationInBorough(borough, location){
	var length=borough.boundary.length;
	var counter=0;
	var x_inter;
	var p1=borough.boundary[0];

	for(var i=1;i<=length;i++){
		var p2=borough.boundary[i%length];

		if(location.latitude>Math.min(p1.latitude,p2.latitude)){
			if(location.latitude<=Math.max(p1.latitude,p2.latitude)){
				if(location.longitude<=Math.max(p1.longitude,p2.longitude)){
					if(p1.latitude!=p2.latitude){
						x_inter=(location.latitude-p1.latitude)*(p2.longitude-p1.longitude)/(p2.latitude-p1.latitude)+p1.longitude;
						if(p1.longitude==p2.longitude||location.longitude<=x_inter){
							counter++;
						}
					}
				}
			}
		}
		p1=p2;
	}

	return(counter%2==1);
}

function getBorough(location) {
	for(var i = 0; i < boroughs.length; i++) {
		var borough = boroughs[i];
		if (locationInBorough(borough, location))
			return borough.name;
	}

	return null;
}

function createGeoJSON() {
	var obj = {
		type: "FeatureCollection",
		features: []
	};

	for(var i = 0; i < boroughs.length; i++) {
		var borough = boroughs[i];
		var bObj = {
			type: "Feature",
			properties: {
				name: borough.name,
				color: "blue",
			},
			geometry: {
				type: "Polygon",
				coordinates: [[]]
			}
		};

		for (var j = 0; j < borough.boundary.length; j++) {
			bObj.geometry.coordinates[0].push([borough.boundary[j].longitude,borough.boundary[j].latitude]);
		}

		obj.features.push(bObj);
	}

	var url = 'data:text/json;charset=utf8,' + encodeURIComponent(JSON.stringify(obj));
	window.open(url, '_blank');
	window.focus();
}

function createBoroughNames() {
	var obj = [];
	for(var i = 0; i < boroughs.length; i++) {
		obj.push(boroughs[i].name);
	}

	var url = 'data:text/json;charset=utf8,' + encodeURIComponent(JSON.stringify(obj));
	window.open(url, '_blank');
	window.focus();
}

createBoroughNames();