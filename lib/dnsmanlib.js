/**
	Copyright 2015 Michael Blouin contact@michaelblouin.ca
	
	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at
	
	    http://www.apache.org/licenses/LICENSE-2.0
	
	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
	*/

var fs = require('fs');
var azureCommon = require('azure-common');
var azureDns = require('azure-arm-dns');
var csv = require('csv');
var Table = require('cli-table');
var util = require('util');
var utility = require('./utility.js');
var path = require('path');
var cli = null;
var RecordSet = require('./recordSet.js');
var _ = require('underscore');

var azCliLibDir = path.dirname(require.resolve('azure-cli'));
var azCliAdalAuthPath = path.join(azCliLibDir, "/util/authentication/adalAuth.js");
var azCliProfilePath = path.join(azCliLibDir, "/util/profile/profile.js");

var auth = require(azCliAdalAuthPath);
var profile = require(azCliProfilePath);

var credentials = null;
var options = null;

var ParseRecordsOptions = {
	comment: '#',
	delimiter: ' ',
	trim: true,
	columns: [
		'path',
		'type',
		'ttl', 
		'data',
		'unknownFirst', // MX Priority 
		'unknownSecond', // SRV Weight
		'unknownThird', // SRV priority
	]
};

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

function loadDefaultProfile(callback) {
	if (typeof callback !== 'function') {
		throw new Error('loadDefaultProfile callback must be a function')
	}

	// cli.info(profile.current);
	var subscription = null;
	for (var s in profile.current.subscriptions) {
		if (profile.current.subscriptions[s].isDefault) {
			subscription = profile.current.subscriptions[s];
			break;
		}
	}

	if (subscription === null) {
		cli.error('Could not find default subscription. Please run `azure login` and select one.');
		return true;
	}

	auth.tokenCache.find({ tokenType: 'Bearer', tenantId: subscription.tenantId }, getUserAuthToken);

	var credentials = null;
	function getUserAuthToken(error, tokens) {
		// This token is stored inside the operating systems secure token store on supported systems. There's a property within called "accessToken" that contains the value.
		// I guess I'll just rip this from the Azure CLI
		// See https://github.com/Azure/azure-xplat-cli/blob/dev/lib/util/authentication/adalAuth.js

		if (error) {
			callback(error, null);
			return;
		}

		var token = null;
		for (var t in tokens) {
			if (tokens[t].expiresOn < (new Date())) {
				continue;
			}

			token = tokens[t];
			break;
		}

		if (token === null) {
			cli.error('Could not find valid Azure auth token from Azure CLI. Please run `azure login` and try again.');
			callback(true, null);
			return;
		}

		callback(null, new azureCommon.TokenCloudCredentials({
			subscriptionId: subscription.id,
			authorizationScheme: 'Bearer',
			token: token.accessToken,
			fullToken: token,
		}));
	}
}

function getAzureDNSRecords(resourceGroup, zoneName, callback) {
	if (typeof callback !== 'function') {
		throw new Error('Type of callback must be function');
	}

	var dnsManager = azureDns.createDnsManagementClient(credentials);
	dnsManager.recordSets.listAll(resourceGroup, zoneName, function (err, recordSets) {
		if (err) {
			callback(err, null);
			return;
		}

		var records = {};
		for (var d in recordSets.recordSets) {
			var recordSet = recordSets.recordSets[d];

			var path = recordSet.name;
			var type = getLocalTypeNameFromAzureTypeName(recordSet.type);

			if (typeof records[path] !== 'object') {
				records[path] = {};
			}

			if (typeof records[path][type] !== 'object') {
				records[path][type] = { values: [], ttl: recordSet.properties.ttl, _azRecordSet: recordSet };
			}

			for (var propName in recordSet.properties) {
				if (typeof recordSet.properties[propName] !== 'object' || propName === 'soaRecord') {
					continue;
				}

				if (type === null) {
					throw new Error('Unknown azure property: ' + propName);
				}

				if (recordSet.properties[propName].length === 0) {
					continue;
				}

				for (var record in recordSet.properties[propName]) {
					records[path][type].values.push(recordSet.properties[propName][record]);
				}
			}
		}

		callback(null, records);
	});
}

function getLocalTypeNameFromAzureTypeName(azTypeName) {
	for (var typeName in RecordTypeData) {
		if (RecordTypeData[typeName].typeName === azTypeName) {
			return typeName;
		}
	}

	throw new Error('Unkown Azure type name: ' + azTypeName);
}

function getTypeNameFromAzurePropertyName(propName) {
	for (var type in RecordTypeData) {
		if (RecordTypeData[type].propertyName === propName) {
			return type;
		}
	}

	return null;
}

function compareRecordSetsAndGetActions(parsedCSVRecords, parsedAzureRecords) {
	if (parsedCSVRecords === null) {
		return;
	}

	if (parsedAzureRecords === null) {
		return;
	}

	var recordSetActions = {
		createAndUpdate: [],
		remove: [], // Not supported
	};

	var recordActions = {
		createAndUpdate: [],
		remove: [], // Not supported
	}

	// Find records to add/update
	for (var path in parsedCSVRecords) {
		for (var type in parsedCSVRecords[path]) {
			var azRecordSet = null;
			if (typeof parsedAzureRecords[path] !== 'undefined' && typeof parsedAzureRecords[path][type] !== 'undefined') {
				azRecordSet = parsedAzureRecords[path][type];
			}

			// If the record doesn't exist, it will need to be added
			if (azRecordSet === null || typeof azRecordSet === 'undefined') {
				recordSetActions.createAndUpdate.push({ path: path, type: type, reason: 'new', record: parsedCSVRecords[path][type] });

				for (var record in parsedCSVRecords[path][type].values) {
					recordActions.createAndUpdate.push({ path: path, type: type, reason: 'new-record-set', record: parsedCSVRecords[path][type].values[record] });
				}
			} else {
				if (azRecordSet.ttl != parsedCSVRecords[path][type].ttl) {
					recordSetActions.createAndUpdate.push({ path: path, type: type, reason: 'update-ttl', record: parsedCSVRecords[path][type] });
				}

				// Loop through the individual records in the record set and mark actions
				for (var record in parsedCSVRecords[path][type].values) {
					var azRecord = getAzureRecordFromRecordSet(parsedCSVRecords[path][type].values[record], azRecordSet);

					if (null === azRecord) {
						recordActions.createAndUpdate.push({
							path: path,
							type: type,
							reason: 'no-matching-remote-record',
							record: parsedCSVRecords[path][type].values[record],
							_azRecordSet: azRecordSet, });
					}
				}
			}
		}
	}

	// Find records to remove
	for (var path in parsedAzureRecords) {
		for (var type in parsedAzureRecords[path]) {
			var recordSet = null;
			if (typeof parsedCSVRecords[path] !== 'undefined' && typeof parsedCSVRecords[path][type] !== 'undefined') {
				recordSet = parsedCSVRecords[path][type];
			}

			// If the record doesn't exist, it will need to be added
			if (recordSet === null || typeof recordSet === 'undefined') {
				recordSetActions.remove.push({ path: path, type: type, reason: 'no-matching-local-record-set', record: parsedAzureRecords[path][type] });

				for (var record in parsedAzureRecords[path][type].values) {
					recordActions.remove.push({ path: path, type: type, reason: 'remove-record-set', record: parsedAzureRecords[path][type].values[record] });
				}
			} else {
				// Loop through the individual records in the record set and mark actions
				for (var record in parsedAzureRecords[path][type].values) {
					var azRecord = getAzureRecordFromRecordSet(parsedAzureRecords[path][type].values[record], recordSet);

					if (null === azRecord) {
						recordActions.remove.push({ path: path, type: type, reason: 'no-matching-local-record', record: parsedAzureRecords[path][type].values[record] });
					}
				}
			}
		}
	}

	// Display the actions to be performed
	var table = new Table({
	    head: ['Action', 'Type', 'Name', 'TTL', 'Value', 'Reason']
	});

	// cli.info('recordSets: ', JSON.stringify(recordSetActions));
	for (var create in recordSetActions.createAndUpdate) {
		var set = recordSetActions.createAndUpdate[create];
		table.push(['CREATE RECORD SET', set.type, set.path, set.record.ttl, '-', set.reason]);
	}

	for (var remove in recordSetActions.remove) {
		var set = recordSetActions.remove[remove];
		table.push(['REMOVE RECORD SET', set.type, set.path, set.record.ttl, '-', set.reason]);
	}

	// cli.info('records: ', JSON.stringify(recordActions));
	for (var create in recordActions.createAndUpdate) {
		var set = recordActions.createAndUpdate[create];
		table.push(['CREATE RECORD', set.type, set.path, '-', summarizeRecordValue(set.record), set.reason]);
	}

	for (var remove in recordActions.remove) {
		var set = recordActions.remove[remove];
		table.push(['REMOVE RECORD', set.type, set.path, '-', summarizeRecordValue(set.record), set.reason]);
	}

	if (table.length > 0) {
		cli.info("======== Actions to be taken ========");
		console.log(table.toString());
	} else {
		cli.info("DNS records in sync. No actions to perform.")
	}

	return {
		recordActions: recordActions,
		recordSetActions: recordSetActions,
	};
}

function applyActions(parsedCSVRecords, parsedAzureRecords, actions, callback) {
	if (typeof callback !== 'function') {
		throw new Error('applyActions callback must be a function');
	}

	var recordActions = actions.recordActions;
	var recordSetActions = actions.recordSetActions;

	var dnsManager = azureDns.createDnsManagementClient(credentials);

	var actionCount = 
		recordActions.createAndUpdate.length + 
		recordActions.remove.length + 
		recordSetActions.createAndUpdate.length + 
		recordActions.remove.length;

	var completeActionCount = 0;

	if (actionCount === 0) {
		cli.info("No actions to apply.");
		callback(null);
		return;
	}

	cli.info("Applying actions...");
	cli.progress(completeActionCount/actionCount)

	// Apply record set create and update actions
	for (var a in recordSetActions.createAndUpdate) {
		var set = recordSetActions.createAndUpdate[a];
		var recordSet = 
			new RecordSet(
				credentials.credentials.subscriptionId, 
				options.resourceGroup, 
				options.zoneName,
				set.type, 
				set.path, 
				{ properties: { ttl: set.record.ttl } });

		recordSet.StripUnusedProperties();

		dnsManager.recordSets.createOrUpdate(
			options.resourceGroup,
			options.zoneName,
			set.path,
			set.type,
			{ recordSet: recordSet },
			function handleRecordSetActionComplete(error, result) {
				console.error(error);
				if (error) {
					throw error;
				}

				cli.progress(++completeActionCount/actionCount);

				if (completeActionCount === actionCount) {
					callback(null);
				}
			});
	}
}

function summarizeRecordValue(record, type) {
	var keys = Object.keys(record);
	if (keys.length === 0) {
		return '-';
	}

	var summary = [];
	for (var prop in record) {
		var value = record[prop];

		if (options.summarizeCharLimit > 0 && record[prop].length > options.summarizeCharLimit) {
			value = record[prop].substring(0, options.summarizeCharLimit) + "...";
		}

		summary.push(util.format('%s: %s', prop, value));
	}

	return summary.join(', ');
}

function getAzureRecordFromRecordSet(matchRecord, recordSet) {
	for (var val in recordSet.values) {
		var found = true;

		for (var prop in matchRecord) {
			if (recordSet.values[val][prop] !== matchRecord[prop]) {
				found = false;
				break;
			}
		}

		if (found) {
			return recordSet.values[val];
		}
	}

	return null;
}

function parseRecordsFile(fileFullPath, callback) {
	if (typeof fileFullPath !== 'string') {
		throw new Error('Records fileFullPath cannot be null', typeof fileFullPath, fileFullPath);
	}

	if (typeof callback !== 'function') {
		throw new Error('parseRecordsFile callback must be a function');
	}

	fs.readFile(fileFullPath, options.fileEncoding, function(error, fileData) {
		if (error) {
			callback(new Error('Error reading file data: ', error, fileData), null);
		}

		// Parse out whitespace lines
		var fileSplit = fileData.split('\n');
		var fileOut = [];
		for (var l in fileSplit) {
			if (!/^\s*$/.test(fileSplit[l])) {
				fileOut.push(fileSplit[l]);
			}
		}

		csv
			.parse(fileOut.join('\n'), ParseRecordsOptions, function (error, data) {
				if (error) {
					callback(new Error('CSV Parse Error: ', error), null);
				}

				var records = {};
				for (var d in data) {
					var item = data[d];
					if (!item.path) {
						callback(new Error('Path cannot be null in CSV', item), null);
					}

					if (!item.type) {
						callback(new Error('Type cannot be null in CSV', item), null);
					}

					if (typeof RecordTypeData[item.type] === 'undefined') {
						callback(new Error('Unknown or unsupported record type in CSV', item), null);
					}

					item.ttl = parseInt(item.ttl);
					if (!item.ttl || item.ttl <= 0) {
						callback(new Error('TTL must be integer > 0 in CSV', item), null);
					}

					if (!item.data) {
						callback(new Error('Data must not be empty in CSV', item), null);
					}

					if (typeof records[item.path] !== 'object') {
						records[item.path] = {};
					}

					if (typeof records[item.path][item.type] !== 'object') {
						records[item.path][item.type] = { values: [], ttl: 0 };
					}
					
					if (records[item.path][item.type].ttl !== 0 && item.ttl !== records[item.path][item.type].ttl) {
						callback(new Error('Conflicting TTLs for ' + item.path + ' of type ' + item.type + ': ' + records[item.path][item.type].ttl + ' and ' + item.ttl), null);
					}

					records[item.path][item.type].ttl = item.ttl;

					records[item.path][item.type].values.push(getRecordTypeValue(item));
				}

				callback(null, records);
			});
	});
}

function writeRecordsFile(fileFullPath, records, prefix, callback) {
	if (typeof fileFullPath !== 'string') {
		throw new Error('writeRecordsFile fileFullPath should be of type string.');
	}
	
	if (typeof records !== 'object') {
		throw new Error('writeRecordsFile records should be an array of objects.');
	}

	if (typeof prefix !== 'string') {
		throw new Error('writeRecordsFile prefix should be of type string.');
	}

	if (typeof callback !== 'function') {
		throw new Error('writeRecordsFile callback should be of type function.');
	}

	var csvArray = [];

	for (var path in records) {
		for (var type in records[path]) {
			for (var v in records[path][type].values) {
				var obj = {
					'path': path,
					'type': type,
					'ttl': records[path][type].ttl,
				};

				for (var srcField in RecordTypeData[type].dataMap) {
					var destField = RecordTypeData[type].dataMap[srcField];

					if (typeof destField === 'object') {
						obj[destField.name] = records[path][type].values[v][srcField];
					} else {
						obj[destField] = records[path][type].values[v][srcField];
					}
				}

				csvArray.push(obj);
			}
		}
	}

	csv.stringify(csvArray, ParseRecordsOptions, function writeCSVRecordsToFile(error, dataStr) {
		if (error) {
			callback(error);
		}

		if (null !== prefix && prefix.length !== 0 && prefix[prefix.length - 1] !== '\n') {
			prefix = prefix + '\n';
		}

		if (fileFullPath === 'stdout') {
			console.log(prefix + dataStr);
			callback(null);
		} else {
			fs.writeFile(fileFullPath, prefix + dataStr, options.fileEncoding, function csvRecordsWrittenToFile(error) {
				callback(error);
			});
		}
	});
}

// Gets the value object for the API for the given record type
function getRecordTypeValue(recordData) {
	if (typeof RecordTypeData[recordData.type] === 'undefined') {
		throw new Error('Unknown record type ' + recordData.type)
	}

	var returnValue = {};
	for (var propName in RecordTypeData[recordData.type].dataMap) {
		var type = RecordTypeData[recordData.type].dataMap[propName];
		var name = type;

		if (typeof type !== 'string') {
			name = type.name;
		}

		if (typeof recordData[name] === 'undefined') {
			throw new Error("Property " + propName + " cannot be empty for DNS " + recordData.type + " record")
		}

		if (typeof type === 'string') {
			returnValue[propName] = recordData[name];
		} else {
			returnValue[propName] = type.parser(recordData[name]);
		}
	}

	return returnValue;
}

function getSourceDNSRecords(dnsName, paths, callback) {
	if (typeof dnsName !== 'string') {
		throw new Error('getSourceDNSRecords dnsName must be a string');
	} else if (typeof callback !== 'function') {
		throw new Error('getSourceDNSRecords callback must be a function');
	}

	var records = {};

	if (Object.keys(paths).length === 0) {
		console.warn('Did not run DNS queries for any paths');
		callback(null, {});
		return;
	}

	for (var p in paths) {
		getSourceDNSRecordsForPath(dnsName, paths[p], function handleDnsForPath(error, path, pathRecords) {
			if (error) {
				callback(error, null);
				return;
			}

			records[path] = pathRecords;

			if (Object.keys(records).length === paths.length) {
				callback(null, records);
			}
		});
	}
}

function getSourceDNSRecordsForPath(dnsName, path, callback) {
	var dns = require('dns');

	var index = -1;

	var types = Object.keys(RecordTypeData);

	if (types.length === 0) {
		throw new Error('Expected more record types... This is a code error.');
	}

	var pathRecords = {};

	var resolvePath = util.format('%s.%s', path, dnsName);

	if (path === '@') {
		resolvePath = dnsName;
	}

	function next(error, addrs) {
		if (error && error.code !== dns.NODATA) {
			callback(error);
			return;
		}
		
		if (null !== addrs && typeof addrs === 'object' && addrs.length > 0) {
			pathRecords[types[index]] = { values: applyObjectField(types[index], addrs) };
		}

		++index;

		if (types[index] === 'PTR') {
			++index;
		}

		if (index === types.length) {
			callback(null, path, pathRecords);
			return;
		}

		cli.info(util.format('Querying %s %s records...', resolvePath, types[index]));
		dns.resolve(resolvePath, types[index], next);
	}

	function applyObjectField(type, values) {
		var outvals = [];

		if (Object.keys(RecordTypeData[type].reverseMap).length !== 1) {
			for (var v in values) {
				var obj = {};

				for (var propName in RecordTypeData[type].dataMap) {
					var sourceName = propName;

					if (typeof RecordTypeData[type].dataMap[propName] === 'object' && typeof RecordTypeData[type].dataMap[propName].dnsName === 'string') {
						sourceName = RecordTypeData[type].dataMap[propName].dnsName;
					}

					obj[propName] = values[v][sourceName];
				}

				outvals.push(obj);
			}
		} else {
			for (var v in values) {
				var obj = {};

				if (type === 'TXT') {
					obj[RecordTypeData[type].reverseMap['data']] = values[v].join('');
				} else {
					obj[RecordTypeData[type].reverseMap['data']] = values[v];
				}
				
				outvals.push(obj);
			}
		}

		return outvals;
	}

	next(null, null);
}



function setOptions (opts) { options = opts; }
function setCredentials (creds) { credentials = creds; }
function setCLI (c) { cli = c; }

module.exports = {
	init: function init(opts, cli, creds) {
		setOptions(opts);
		setCredentials(creds);
		setCLI(cli);

		for (var t in RecordTypeData) {
			RecordTypeData[t].reverseMap = {};

			for (var propName in RecordTypeData[t].dataMap) {
				var index = RecordTypeData[t].dataMap[propName];
				if (typeof index === 'object') {
					index = index.name;
				}

				RecordTypeData[t].reverseMap[index] = propName;
			}
		}

		return {
			RecordTypeData: RecordTypeData,
			setCLI: setCLI,
			setOptions: setOptions,
			setCredentials: setCredentials,
			loadDefaultProfile: loadDefaultProfile,
			getAzureDNSRecords: getAzureDNSRecords,
			getTypeNameFromAzurePropertyName: getTypeNameFromAzurePropertyName,
			compareRecordSetsAndGetActions: compareRecordSetsAndGetActions,
			summarizeRecordValue: summarizeRecordValue,
			getAzureRecordFromRecordSet: getAzureRecordFromRecordSet,
			parseRecordsFile: parseRecordsFile,
			getRecordTypeValue: getRecordTypeValue,
			writeRecordsFile: writeRecordsFile,
			getSourceDNSRecords: getSourceDNSRecords,
			applyActions: applyActions,
		};
	}
};
