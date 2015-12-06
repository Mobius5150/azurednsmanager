var utility = require('./utility.js');
var util = require('util');
var _ = require('underscore');

var RecordTypeData = utility.RecordTypeData();

var RecordSet = function RecordSetConstructor(subscriptionOrBaseRecordSet, resourceGroup, zoneName, type, path, options) {
	var subscription = subscriptionOrBaseRecordSet;

	if (null !== subscription && typeof subscription === 'object') {
		options = subscription;

		if (utility.nullOrBadType(options.id, 'string')) {
			throw new Error('Recordset options requres id');
		}

		if (utility.nullOrBadType(options.type, 'string')) {
			throw new Error('Recordset options require type');
		}

		if (utility.nullOrBadType(options.name, 'string')) {
			if (!utility.nullOrBadType(options.path, 'string')) {
				options.name = options.path;
			} else {
				throw new Error('recordset options require name (path)');
			}
		}

		type = options.type;
		path = options.path;
	} else {
		if (utility.nullOrBadType(subscription, 'string')) {
			throw new Error('Recordset subscription cannot be null');
		}

		if (utility.nullOrBadType(resourceGroup, 'string')) {
			throw new Error('Recordset resourceGroup cannot be null');
		}

		if (utility.nullOrBadType(zoneName, 'string')) {
			throw new Error('Recordset zoneName cannot be null');
		}

		if (utility.nullOrBadType(type, 'string')) {
			throw new Error('Recordset type cannot be null');
		}

		if (utility.nullOrBadType(RecordTypeData[type], 'object')) {
			throw new Error('Recordset unknown record type: ' + type);
		}

		if (utility.nullOrBadType(path, 'string')) {
			throw new Error('Recordset path cannot be null');
		}

		if (typeof options !== 'object' || options === null) {
			options = {};
		}
	}

	var opts = _.extend({
		name: path,
		type: "Microsoft.Network/dnszones/" + type,
		location: 'global',
		tags: [],
		eTag: null,
		id: util.format(
				"/subscriptions/%s/resourceGroups/%s/providers/Microsoft.Network/dnszones/%s/%s/%s",
				subscription,
				resourceGroup,
				zoneName,
				type,
				path),
	}, options);

	this.id = opts.id;
	this.name = opts.name;
	this.location = opts.location;
	this.type = opts.type;
	this.shortType = type;
	this.tags = opts.tags;
	this.eTag = opts.eTag;

	this.properties = _.extend({
        "aaaaRecords":[],
        "aRecords": [],
        "mxRecords": [],
        "nsRecords": [],
        "ptrRecords": [],
        "srvRecords": [],
        "txtRecords": [],
        "ttl": 600
     }, options.properties);
}

RecordSet.prototype.StripUnusedProperties = function () {
	var removeProps = [];
	for (var p in this.properties) {
		if (typeof this.properties[p] !== 'object') {
			continue;
		}

		if (this.properties[p] === null || this.properties[p].length === 0) {
			removeProps.push(p);
		}
	}

	for (var i in removeProps) {
		delete this.properties[removeProps[i]];
	}
}

RecordSet.prototype.AddProperty = function (value) {
	var propName = RecordTypeData[this.shortType].propertyName;

	if (typeof this.properties[propName] === 'undefined') {
		this.properties[propName] = [];
	}

	if (this.shortType === 'TXT') {
		console.log('TXT record length: ', value.value.length);
	}

	var added = false;
	if (this.shortType === 'TXT' && typeof value.value !== 'object') {
		var valuestr = value.value;
		var strs = [];

		while (valuestr.length > 255) {
			strs.push(valuestr.substring(0, 255));
			valuestr = valuestr.substring(255, valuestr.length);
		}

		if (strs.length > 0) {
			if (valuestr.length !== 0) {
				strs.push(valuestr);
			}

			for (var s in strs) {
				this.properties[propName].push({ value: strs[s] });
			}

			added = true;
		}
	}

	if (!added) {
		this.properties[propName].push(value);
	}
}

module.exports = RecordSet;