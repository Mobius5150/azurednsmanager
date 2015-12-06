#!/usr/bin/env node

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

var lib = null;

var options = null;

var parsedCSVRecords = null;
var parsedAzureRecords = null;

var util = require('util');
var cli = require('cli')
	.enable('status')
cli .parse({
		resourceGroup:      ['g', 'The Azure resource group to query', 'string'],
		zoneName: 		    ['n', 'The Azure zone name to query', 'string'],
	    recordsFile:        ['f', 'The path to the file with DNS Records', 'file', './records.txt'],
	    fileEncoding:       ['e', 'The encoding for the DNS Records Text File', 'string', 'utf8'],
	    summarizeCharLimit: ['c', 'The maximum number of characters in a value before truncation (0 for unlimited)', 'number', 0],
	    dryrun:				[false, 'Outputs only what actions would be taken, but does not perform them', 'bool', false],

	    import: 			['i', 'Whether to run in import mode', 'bool', false],
	    source: 			['s', 'The source when running an import. Can be "DNS" or "Azure"', 'string', 'Azure'],
	    outfile:            [false, 'The file to output records to if in import mode, or "stdout" to pipe to stdout', 'string'],
	    ttl: 				['t', 'The default TTL to use for entries during a DNS import.', 'int'],
	    paths: 				['p', 'A csv list of subdomains/prefixes to query for during a DNS import. Should not include the TLD. Example: -p="foo,hello.world" to import the records from foo.example.com and hello.world.example.com', 'string']
	});

cli.main(function Main(args, opts) {
	options = opts;

	if (!options.import && null !== options.outfile) {
		cli.fatal('Refusing to do anything because an output file was specific but CLI is not in import mode. Please remove the --outfile option or specify -i true');
	} else if (options.import && null === options.outfile) {
		cli.fatal('You must specify an outfile to run in import mode. See --help.');
	}

	lib = require('./lib/dnsmanlib.js').init(options, cli, null);

	if (options.import) {
		runImportMode(options);
	} else {
		runActionMode(options);
	}
});

function runActionMode(options) {
	if (typeof options.resourceGroup !== 'string') {
		cli.fatal('resourceGroup must be specified. Use -h for help.');
		return;
	}

	if (typeof options.zoneName !== 'string') {
		cli.fatal('zoneName must be specified. Use -h for help.');
		return;
	}

	if (options.dryrun) {
		cli.info('Running in action dry run mode');
	} else {
		cli.info('Running in action application mode');
	}

	loadDefaultAzureCredential(function(error, creds) {
		if (error) {
			if (error === true) return;
			throw error;
		}

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
}

function runImportMode(options) {
	if (options.source !== 'Azure' && options.source !== 'DNS') {
		cli.fatal('Import source must be either "Azure" or "DNS"');
	}

	if (options.source === 'Azure' && typeof options.resourceGroup !== 'string') {
		cli.fatal('resourceGroup must be specified. Use -h for help.');
	}

	if (typeof options.zoneName !== 'string') {
		if (options.source === 'Azure') {
			cli.fatal('zoneName must be specified. Use -h for help.');
			return;
		} else if (options.source === 'DNS') {
			cli.fatal('DNS name must be specific with the -n option. Use -h for help.');
		}
	}

	if (options.source === 'DNS' && (typeof options.ttl !== 'number' || options.ttl <= 0)) {
		cli.fatal('TTL must be given with the -t or --ttl flags, and must be greater than zero when doing a DNS import.');
	}

	cli.info('Running in import mode');

	var prefix = "# Imported DNS records from ";
	if (options.source === 'DNS') {
		prefix += options.zoneName + " DNS";
	} else {
		prefix += options.zoneName + 'zone in Azure';
	}

	if (options.source === 'Azure') {
		loadDefaultAzureCredential(function(error, creds) {
			if (error) {
				if (error === true) return;
				throw error;
			}
			lib.getAzureDNSRecords(options.resourceGroup, options.zoneName, function importHandleAzureRecords(error, records) {
				if (error) {
					throw error;
				}

				lib.writeRecordsFile(options.outfile, records, prefix, handleImportRecordsWritten);
			});
		});
	} else if (options.source === 'DNS') {
		var paths = [ '@' ];

		if (options.paths !== null) {
			var pathList = options.paths.split(',');
			for (var p in pathList) {
				paths.push(pathList[p]);
			}
		}

		lib.getSourceDNSRecords(options.zoneName, paths, function importHandleSourceDNSRecords(error, records) {
			if (error) {
				throw error;
			}

			for (var path in records) {
				for (var type in records[path]) {
					records[path][type].ttl = options.ttl;
				}
			}

			lib.writeRecordsFile(options.outfile, records, prefix, handleImportRecordsWritten);
		});
	}
}

function handleImportRecordsWritten(error) {
	if (error) {
		throw error;
	}

	cli.ok('Import complete! Results written to ' + options.outfile);
}

function handleParseRecordsComplete(error, records) {
	if (error) {
		throw error;
	}

	parsedCSVRecords = records;

	var actions = lib.compareRecordSetsAndGetActions(parsedCSVRecords, parsedAzureRecords);

	if (null !== actions && typeof actions !== 'undefined') {
		if (!options.dryrun) {
			lib.applyActions(parsedCSVRecords, parsedAzureRecords, actions, handleActionsApplied);
		} else {
			cli.info('Exiting without applying actions');
		}
	}
}

function handleParseAzureRecordsComplete(error, records) {
	if (error) {
		throw error;
	}

	parsedAzureRecords = records;

	var actions = lib.compareRecordSetsAndGetActions(parsedCSVRecords, parsedAzureRecords);

	if (null !== actions && typeof actions !== 'undefined') {
		if (!options.dryrun) {
			lib.applyActions(parsedCSVRecords, parsedAzureRecords, actions, handleActionsApplied);
		} else {
			cli.info('Exiting without applying actions');
		}
	}
}

function handleActionsApplied(error) {
	if (error) {
		throw error;
	}

	cli.info('Actions applied without error.');
}

function loadDefaultAzureCredential(callback) {
	if (typeof callback !== 'function') {
		throw new Error('loadDefaultAzureCredential callback must be a function');
	}

	lib.loadDefaultProfile(function(error, creds) {
		if (error) {
			callback(error);
			return;
		}

		credentials = creds;
		lib.setCredentials(credentials);

		cli.ok(util.format('Loaded credential for "%s"', credentials.credentials.fullToken.userId));

		callback(null);
	});
}