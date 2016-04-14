var lib = require('../lib/dnsmanlib.js');

describe("lib", function() {
	it("init", function() {
		expect(typeof lib.init).toBe('function');
	});
});

describe("lib-azure-interface", function() {
	var lib;

	beforeEach(function() {
		var openlib = require('../lib/dnsmanlib.js');

		lib = openlib.init({//dnsManager.recordSets.createOrUpdate
			dnsManager: {
				recordSets: {
					createOrUpdate: function () { console.log("Called!"); },
					listAll: function (group, zone) { console.log('listAll', group, zone); },
				}
			},
		}, {}, null);
	});

	it("init", function () {

	});

	it("getAzureDNSRecords", function () {
		// function getAzureDNSRecords(resourceGroup, zoneName, callback) {
		lib.getAzureDNSRecords('testGroup', 'testZoneName', function () {
			console.log('Received azure dns records');
		})
	});
});