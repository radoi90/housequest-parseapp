import csv

# station_file  = csv.DictReader(open("stations.csv"))
# routes_file	  = csv.DictReader(open("routes.csv"))
# line_def_file = csv.DictReader(open("line_definitions.csv"))

# lines = {}

# for routes_row in routes_file:
# 	lines[routes_row['line']] = routes_row['name']

# station_lines = {}

# for line_def_row in line_def_file: 
# 	lines1 = station_lines.get(line_def_row["station1"], [])
# 	if (lines[line_def_row["line"]] not in lines1):
# 		lines1.append(lines[line_def_row["line"]])
# 		station_lines[line_def_row["station1"]] = lines1

# 	lines2 = station_lines.get(line_def_row["station2"], [])
# 	if (lines[line_def_row["line"]] not in lines2):
# 		lines2.append(lines[line_def_row["line"]])
# 		station_lines[line_def_row["station2"]] = lines2

# stations = {}

# for station_row in station_file:
#     station = {}
    
#     station["name"] = station_row["name"]
#     station["zone"] = float(station_row["zone"])
#     station["num_lines"] = int(station_row["total_lines"])
#     station["lines"] = station_lines[station_row["id"]]
#     station["is_railstation"] = (station_row["rail"] == 1)
#     station["latitude"] = float(station_row["latitude"])
#     station["longitude"] = float(station_row["longitude"])

#     stations[station_row["id"]] = station


# from collections import OrderedDict
# ordered_fieldnames = OrderedDict([
# 		('name',None),
# 		('zone',None),
# 		('num_lines',None),
# 		('lines',None),
# 		('is_railstation',None),
# 		('latitude',None),
# 		('longitude',None)
# 	])

# with open("stations_lines.csv",'wb') as fou:
#     dw = csv.DictWriter(fou, delimiter='\t', fieldnames=ordered_fieldnames)
#     dw.writeheader()

#     for station_id in stations:
# 		dw.writerow(stations[station_id])

stationreader = csv.DictReader(open('station_lines_csv.csv', 'rb'), delimiter=';', quoting=csv.QUOTE_NONE)

stations = []

for station_row in stationreader:
	station = {}
	
	station["name"] = station_row["name"]
	station["zone"] = float(station_row["zone"])
	station["lines"] = (station_row["lines"]).split(',')
	station["num_lines"] = len(station["lines"])
	station["is_railstation"] = (station_row["is_railstation"] == 'TRUE')
	station["latitude"] = float(station_row["latitude"])
	station["longitude"] = float(station_row["longitude"])

	stations.append(station)

import json

print json.dumps(stations, separators=(',', ': '))