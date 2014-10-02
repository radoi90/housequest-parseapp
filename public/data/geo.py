from xml.dom import minidom
import numpy as np
import json
from StringIO import StringIO

io = StringIO()

xmldoc = minidom.parse('london_boroughs.kml')

boroughList = xmldoc.getElementsByTagName('Placemark')

boroughObjArray = []

for borough in boroughList:
	#get NAME
	nameElement = borough.getElementsByTagName('name')[0]
	boroughName = nameElement.firstChild.nodeValue

	#get COORD array
	coordElement = borough.getElementsByTagName('coordinates')[0]
	coordStringArray = coordElement.firstChild.nodeValue
	coordPairStringArray = coordStringArray.split(' ')
	coordObjArray = []

	for coordPairString in coordPairStringArray:
		coordPair = coordPairString.split(',')
		lon = float(coordPair[0])
		lat = float(coordPair[1])

		coordObj = {"longitude": lon, "latitude": lat}
		coordObjArray.append(coordObj)

	boroughObjArray.append({"name": boroughName, "boundary": coordObjArray})

objJSON = json.dumps(boroughObjArray,separators=(',', ': '))

with open("boroughs.json", "w") as text_file:
    text_file.write("{0}".format(objJSON))