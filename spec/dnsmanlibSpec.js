var lib = require('../lib/dnsmanlib.js');

describe("lib", function() {
  it("init", function() {
    expect(typeof lib.init).toBe('function');
  });
});