"use strict";

//
// Revokes a certificate, generates a CRL and uploads to Client Endpoint
//
require("dotenv").config();
const easyrsa = require("./lib/easyrsa");

(async () => {
  try {
    console.log(`Regenerating crl.pem`);
    await easyrsa.regenCrl();
    process.exit(0);
  } catch (e) {
    console.error("Problems regenerating crl.pem", e);
    process.exit(1);
  }
})();
