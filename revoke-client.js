#!/usr/bin/env node
'use strict';

//
// Revokes a certificate, generates a CRL and uploads to Client VPN Endpoint
//
require('dotenv').config();
const easyrsa = require('./lib/easyrsa');

if (process.argv.length < 3) {
    console.log('Usage: revoke-client firstnamelastname');
    console.log('       Include first and last name with no space');
    process.exit(1);
}

const commonName = process.argv[2];

(async () => {
    try {
        const cn = `${commonName}`;
        console.log(`Revoking certificate issued/${cn}.crt`);
        await easyrsa.revokeClient(cn);
        process.exit(0);
    }
    catch (e) {
        console.error('Problems revoking certificate', e);
        process.exit(1);
    }
})();

