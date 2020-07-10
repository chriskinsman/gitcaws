#!/usr/bin/env node
'use strict';

//
// Create a client .ovpn file for use on a device
//
require('dotenv').config();
const easyrsa = require('./lib/easyrsa');

if (process.argv.length < 3) {
    console.log('Usage: create-client-ovpn firstnamelastname');
    console.log('       Include first and last name with no space');
    process.exit(1);
}

const commonName = process.argv[2];

(async () => {
    try {
        const cn = `${commonName}`;
        console.log(`Creating .ovpn file for commonName: ${cn}`);
        await easyrsa.createClient(cn);
        await easyrsa.createOVPN(cn)
        process.exit(0);
    }
    catch (e) {
        console.error('Problems creating .ovpn file', e);
        process.exit(1);
    }
})();

