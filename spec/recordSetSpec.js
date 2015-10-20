var RecordSet = require('../lib/recordSet.js');

describe("RecordSet", function() {
	it("constructor", function() {
		expect(typeof RecordSet).toBe('function');
	});

	it("constructor errors", function() {
		expect(function() { new RecordSet() }).toThrowError(/subscription/);
		expect(function() { new RecordSet(null) }).toThrowError(/subscription/);

		expect(function() { new RecordSet("") }).toThrowError(/resourceGroup/);
		expect(function() { new RecordSet("", null) }).toThrowError(/resourceGroup/);

		expect(function() { new RecordSet("", "") }).toThrowError(/zoneName/);
		expect(function() { new RecordSet("", "", null) }).toThrowError(/zoneName/);

		expect(function() { new RecordSet("", "", "") }).toThrowError(/type/);
		expect(function() { new RecordSet("", "", "", null) }).toThrowError(/type/);

		expect(function() { new RecordSet("", "", "", "") }).toThrowError(/path/);
		expect(function() { new RecordSet("", "", "", "", null) }).toThrowError(/path/);
	});

	it("construct from object", function() {
		var constructObject = {
			'name': 'myName',
			'type': 'myType',
			'location': 'myLocation',
			'tags': [],
			'eTag': 'myETag',
			'id' : 'myId',
		};

		var createdObj = new RecordSet(constructObject);
		expect(createdObj).toEqual(jasmine.objectContaining(constructObject));

		expect(typeof createdObj.properties.ttl).toBe('number');
		expect(createdObj.properties.ttl > 0).toBe(true);
	});
});