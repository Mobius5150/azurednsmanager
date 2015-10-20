var utility = require('../lib/utility.js');

describe("nullOrBadType", function() {
	it("should be true on inputs", function() {
		expect(utility.nullOrBadType()).toBe(true);
		expect(utility.nullOrBadType(null, 'string')).toBe(true);
		expect(utility.nullOrBadType({}, 'string')).toBe(true);
		expect(utility.nullOrBadType(0, 'string')).toBe(true);
	});

	it("should be false on inputs", function() {
		expect(utility.nullOrBadType("", 'string')).toBe(false);
		expect(utility.nullOrBadType({}, 'object')).toBe(false);
		expect(utility.nullOrBadType(1, 'number')).toBe(false);
	});
});