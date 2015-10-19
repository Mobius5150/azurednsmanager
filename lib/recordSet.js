var utility = require('./utility.js');

var RecordSet = function RecordSetConstructor(subscriptionOrBaseRecordSet, resourceGroup, zoneName, type, path, options) {
	var subscription = subscriptionOrBaseRecordSet;

	if (null !== subscription && typeof subscription === 'object') {
		options = subscription;
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

module.exports = RecordSet;