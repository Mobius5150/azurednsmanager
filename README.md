# Azure DNS Manager and Importer

[![Build Status](https://travis-ci.org/Mobius5150/azurednsmanager.svg)](https://travis-ci.org/Mobius5150/azurednsmanager)

A simple script to make managing DNS with Azure easier for the rest of US. Also supports importing your existing DNS entries from your DNS server, or creating a text file of the existing entries in your Azure DNS.

Note that this project is still in development, and should be used only carefully. At the moment the tests do not fully test the actualy functioning of the DNS integration.

# Usage

For a quick usage tutorial [check out this blog post](http://michaelblouin.ca/blog/2015/12/06/managing-azure-dns-easy/).

```
$ node dnsmanager.js --help

Usage:
  dnsmanager.js [OPTIONS] [ARGS]

Options: 
  -g, --resourceGroup STRINGThe Azure resource group to query
  -n, --zoneName STRING  The Azure zone name to query
  -f, --recordsFile [FILE]The path to the file with DNS Records (Default is ./records.txt)
  -e, --fileEncoding [STRING]The encoding for the DNS Records Text File  (Default is utf8)
  -c, --summarizeCharLimit NUMBERThe maximum number of characters in a value 
                                 before truncation (0 for unlimited) 
      --dryrun BOOL      Outputs only what actions would be taken, but does not 
                         perform them 
  -i, --import BOOL      Whether to run in import mode
  -s, --source [STRING]  The source when running an import. Can be "DNS" or 
                         "Azure"  (Default is Azure)
      --outfile STRING   The file to output records to if in import mode, or 
                         "stdout" to pipe to stdout 
  -t, --ttl NUMBER       The default TTL to use for entries during a DNS import. 
  -p, --paths STRING     A csv list of subdomains/prefixes to query for during 
                         a DNS import. Should not include the TLD. Example: 
                         -p="foo,hello.world" to import the records from 
                         foo.example.com and hello.world.example.com 
  -k, --no-color         Omit color from output
      --debug            Show debug information
  -h, --help             Display help and usage details

```

## Import DNS Records from DNS Server

You may import existing DNS records from a DNS server using the following command:

```
node dnsmanager.js -n <domainName> -i -s DNS --outfile importedRecords.txt -t 3600 -p <csvOfPaths>
```

Parameters Explained:
 - `-n <domainName>` - The domain name to import from. Ex: michaelblouin.ca
 - `-i` - Run in import mode
 - `-s DNS` - Import from existing DNS server
 - `--outfile` - The text file to save imported records to
 - `-t 3600` - Default to a TTL of 3600 seconds on imported records
 - `-p <csvOfPaths>` - Specifies the paths (ie subdomains) to import as a csv. For example `-p ex1,ex2` to import from ex1.example.com and ex2.example.com

## Import DNS Record from Azure

```
node dnsmanager.js -g <resourceGroup> -n <domainName> -i -s Azure --outfile importedRecords.txt
```

Parameters Explained:
 - `-g <resourceGroup>` - The Azure resource group to import from.
 - `-n <domainName>` - The domain name to import from. Ex: michaelblouin.ca
 - `-i` - Run in import mode
 - `-s Azure` - Import records from Azure
 - `--outfile` - The text file to save imported records to

## Apply DNS Records to Azure

```
node dnsmanager.js -g <resourceGroup> -n <domainName> -f importedRecords.txt -c 50 --dryrun
```

*Remove --dryrun to apply your changes.* I highly recommend using `--dryrun` to preview the changes before you apply them. With this option the tool will not make any changes to your DNS records in Azure, but will just print out the actions it would perform. Remove the option to apply changes.

Parameters Explained:
 - `-g <resourceGroup>` - The Azure resource group to use
 - `-n <domainName>` - The Azure DNS zone to save records in
 - `-f importedRecords.txt` - The file to read records from
 - `-c 50` - Maximum length of record (50 chars) value to print out in action summary. Does not affect the records applied to Azure.
 - `--dryrun` - Only perform a dry run. Do not modify Azure DNS

## Format of the text file

The text file records are stored in is a TSV (Tab Seperated Value) file that supports bash style comments. See below for TSV columns:

```bash
# Below are all possible TSV columns - parameter1, parameter2, and parameter3 aren't needed for all record types and can be left out.
<path> <type> <ttl> <value> <parameter1> <parameter2> <parameter3>

# An NS record
# <path> NS <ttl> <value>
@ NS 3600 ns1-04.azure-dns.com.  

# An A record
# <path> A <ttl> <ipv4Address>
@ A 3600 1.1.1.1   

# An MX record (parameter1 is used for the MX Server Priority)
# <path> MX <ttl> <exchange> <priority>
@ MX 3600 ASPMX.L.GOOGLE.com 1  

# A TXT record (values with spaces should be quoted. Values without spaces can have quotes, but don't need them.)
# <path> TXT <ttl> <value>
@ TXT 3600 "v=spf1 +a +mx +include:_spf.google.com -all"   

# A CNAME record for subdomain.example.com that points to example.com
# <path> CNAME <ttl> <cname>
subdomain CNAME 3600 example.com

# An SRV record
# <path> SRV <ttl> <target> <port> <weight> <priority>
_sip._tcp.example.com SRV 86400 0 5 5060 sipserver.example.com

# An AAAA record
# <path> AAAA <ttl> <ipv6Address>
@ AAAA 3600 2601:600:8200:58f:ae87:a3ff:fe11:2c8c

# A PTR record
# <path> PTR <ttl> <ptrdname>
170.112.167.104.in-addr.arpa PTR 3600 git.michaelblouin.ca
```

### A Note on TXT Records

If you're familiar with DNS you probably know that TXT records have a max length of 255 characters, after which they must be broken up. The Azure DNS Manager will do this for you automatically -- so in your records text file you may have TXT records of unlimited length, and they will be broken up before they are applied to Azure.

# LICENSE
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
