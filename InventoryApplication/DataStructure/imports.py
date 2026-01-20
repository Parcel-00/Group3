import json

with open('imports.json', 'r') as file:
	data = json.load(file)
	
print("First Name:", data["firstName"])