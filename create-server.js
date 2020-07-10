#!/usr/bin/env node
'use strict';

//
// Create the server certificate needed by VPN client endpoints.  
//
require('dotenv').config();
const easyrsa = require('./lib/easyrsa');

(async () => {
    try {
        console.log('Starting');
        await easyrsa.createServer();
        console.log('Server cert created and private key saved');
        process.exit(0);
    }
    catch (e) {
        console.error('Problems creating server cert', e);
        process.exit(1);
    }
})();

