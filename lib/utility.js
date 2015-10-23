var _ = require('underscore');

var RecordTypeData = {
	'NS':    { dataMap: { nsdname: 'data' }, typeName: 'Microsoft.Network/dnszones', propertyName: 'nsRecords' },
	'A':     { dataMap: { ipv4Address: 'data' }, typeName: 'Microsoft.Network/dnszones/A', propertyName: 'aRecords' },
	'MX':    { dataMap: { exchange: 'data', preference: { name: 'unknownFirst', parser: parseInt, dnsName: 'priority' } }, typeName: 'Microsoft.Network/dnszones/MX', propertyName: 'mxRecords' },
	'AAAA':  { dataMap: { ipv6Address: 'data' }, typeName: 'Microsoft.Network/dnszones/AAAA', propertyName: 'aaaaRecords' },
	'PTR':   { dataMap: { ptrdname: 'data' }, typeName: 'Microsoft.Network/dnszones/PTR', propertyName: 'ptrRecords' },
	'SRV':   { 
		dataMap: { 
			target: 'data', 
			port: 'unknownFirst', 
			weight: 'unknownSecond', 
			priority: 'unknownThird' }, typeName: 'Microsoft.Network/dnszones/SRV', propertyName: 'srvRecords' },
	'TXT':   { dataMap: { value: 'data' }, typeName: 'Microsoft.Network/dnszones/TXT', propertyName: 'txtRecords' },
	'CNAME': { dataMap: { cname: 'data' }, typeName: 'Microsoft.Network/dnszones/CNAME', propertyName: 'cnameRecords' },
};

function nullOrBadType(thing, type) {
	return typeof thing !== type || null === thing;
}

module.exports = {
	nullOrBadType: nullOrBadType,
	RecordTypeData: function getRecordTypeData() {
		var typeData = _.extend({}, RecordTypeData);

		for (var t in typeData) {
			typeData[t].reverseMap = {};

			for (var propName in typeData[t].dataMap) {
				var index = typeData[t].dataMap[propName];
				if (typeof index === 'object') {
					index = index.name;
				}

				typeData[t].reverseMap[index] = propName;
			}
		}

		return typeData;
	}
};