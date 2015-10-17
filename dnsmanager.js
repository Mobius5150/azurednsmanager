#!/usr/bin/env node

var lib = null;

var options = null;

var parsedCSVRecords = null;
var parsedAzureRecords = null;

var util = require('util');
var cli = require('cli')
	.enable('status')
	.setUsage('dnsmanager [resourceGroup] [zoneName] [OPTIONS]');
cli .parse({
	    recordsFile:   ['f', 'The path to the file with DNS Records', 'file', './records.txt'],
	    fileEncoding:  ['e', 'The encoding for the DNS Records Text File', 'string', 'utf8'],
	    summarizeCharLimit: ['s', 'The maximum number of characters in a value before truncation (0 for unlimited)', 'number', 0],
	});

cli.main(function Main(args, opts) {
	options = opts;

	if (cli.args.length < 1) {
		cli.error('resourceGroup must be specified. Use -h for help.');
		return;
	}

	if (cli.args.length < 2) {
		cli.error('zoneName must be specified. Use -h for help.');
		return;
	}

	options.resourceGroup = cli.args.shift();
	options.zoneName = cli.args.shift();

	lib = require('./dnsmanlib.js').init(options, cli, null);

	lib.loadDefaultProfile(function(error, creds) {
		if (error) {
			if (error === true) return;
			throw error;
		}

		credentials = creds;
		lib.setCredentials(credentials);

		cli.info(util.format('Loaded credential for "%s"', credentials.credentials.fullToken.userId));
		// cli.info('Loading records file and querying Azure for DNS Information...')
		// cli.spinner('');

		cli.spinner('Loading records file...');
		lib.parseRecordsFile(options.recordsFile, function() {
			cli.spinner('Loading records file... Done!', true);
			handleParseRecordsComplete.apply(this, arguments);

			cli.spinner('Querying Azure for DNS Information...');

			lib.getAzureDNSRecords(options.resourceGroup, options.zoneName, function() {
				cli.spinner('Querying Azure for DNS Information... Done!', true);
				handleParseAzureRecordsComplete.apply(this, arguments);
			});
		});
	});
});

function handleParseRecordsComplete(error, records) {
	if (error) {
		throw error;
	}

	parsedCSVRecords = records;

	lib.compareRecordSetsAndGetActions(parsedCSVRecords, parsedAzureRecords);
}

function handleParseAzureRecordsComplete(error, records) {
	if (error) {
		throw error;
	}

	parsedAzureRecords = records;

	lib.compareRecordSetsAndGetActions(parsedCSVRecords, parsedAzureRecords);
}