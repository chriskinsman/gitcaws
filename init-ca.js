#!/usr/bin/env node
'use strict';
//
// Initialize the CA and store the private key in AWS Secrets Manager
// -- don't allow overwriting an existing key value
// -- assumes there is no pki directory
// -- ca.crt needs to be used when creating client vpn endpoint
//
require('dotenv').config();
const easyrsa = require('./lib/easyrsa');

(async () => {
    try {
        console.log('Starting');
        await easyrsa.buildCA();
        console.log('CA created and private key saved');
        process.exit(0);
    }
    catch (e) {
        console.error('Problems creating CA', e);
        process.exit(1);
    }
})();