"use strict";

const AWS = require("aws-sdk");
const debug = require("debug")("gitcaws:easyrsa");
const fs = require("fs").promises;
const fsConstants = require("fs").constants;
const path = require("path");
const Secrets = require("./secrets");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const certManager = new AWS.ACM();
const ec2 = new AWS.EC2();

const vpnClientEndpointId = process.env.VPN_CLIENT_ENDPOINT_ID;
debug(`Using vpn client endpoint id: ${vpnClientEndpointId}`);
const easyrsa3Path = "easyrsa3";
debug(`Using easyrsa path: ${easyrsa3Path}`);
const easyrsaShellScript = "easyrsa";
const pkiPath = path.join(__dirname, "..", easyrsa3Path, "pki");
debug(`Using pki path: ${pkiPath}`);
const secrets = new Secrets(pkiPath);

const serverCN = process.env.SERVER_CN;
const caCN = process.env.CA_CN;

async function easyrsa(environment, ...args) {
  const defaultEnvironment = { EASYRSA_BATCH: "true" };
  const commandEnvironment = { ...defaultEnvironment, ...(environment || {}) };
  let commandWithArgs = `./${easyrsaShellScript} ${args.join(" ")}`;
  debug(`Executing ${commandWithArgs}`);
  try {
    const { stdout, stderr } = await exec(commandWithArgs, {
      cwd: easyrsa3Path,
      env: commandEnvironment,
    });
    debug(`stdout: ${stdout}`);
    debug(`stderr: ${stderr}`);
    return;
  } catch (e) {
    console.error("Problems running easyrsa", e);
    throw e;
  }
}

module.exports.checkPKI = async function checkPKI() {
  debug("Checking for pki directory");
  try {
    await fs.access(pkiPath, fsConstants.F_OK);
    return true;
  } catch (e) {
    debug("PKI missing");
    return false;
  }
};

module.exports.buildCA = async function buildCA() {
  debug("Checking pki directory existence");
  const pkiExists = await module.exports.checkPKI();
  if (pkiExists) {
    throw new Error(
      "You cannot initialize the CA since a pki directory already exists in the project.  If you really want to do this you will need to remove the pki directory first."
    );
  }

  debug("Checking CA private key existence...");
  const caPrivateKeyExists = await secrets.doesCAPrivateKeyExist();
  if (caPrivateKeyExists) {
    throw new Error(
      "You cannot initialize the CA since a private key already exists in Secrets Manager.  If you really want to do this you will need to eliminate the private key from secrets manager first."
    );
  }

  debug("Initializing pki");
  await easyrsa(null, "init-pki");
  debug("Build out the CA and create a new private key");
  await easyrsa({ EASYRSA_REQ_CN: caCN }, "build-ca", "nopass");
  debug("reading ca cert");
  const caCert = await fs.readFile(path.join(pkiPath, `ca.crt`), "utf8");
  debug("reading ca private key");
  const caPrivateKey = await fs.readFile(
    path.join(pkiPath, `private`, `ca.key`),
    "utf8"
  );
  debug("Uploading certs to AWS");
  await certManager
    .importCertificate({
      Certificate: caCert,
      PrivateKey: caPrivateKey,
      CertificateChain: caCert,
    })
    .promise();
  debug("Saving off CA private key");
  await secrets.saveAndDeleteCAPrivateKeyFromFileToSecretsManager();
};

module.exports.createServer = async function createServer() {
  try {
    debug("Checking server private key existence...");
    const serverPrivateKeyExists = await secrets.doesServerPrivateKeyExist();
    if (serverPrivateKeyExists) {
      throw new Error(
        "You cannot create a server certificate because one already exists in Secrets Manager.  If you really want to do this you will need to eliminate the private key from secrets manager first."
      );
    }

    debug("Getting CA private key");
    await secrets.getCAPrivateKeyToFile();
    debug("Creating server cert");
    await easyrsa({}, "build-server-full", serverCN, "nopass");
    debug("Saving off server private key");
    await secrets.saveAndDeleteServerPrivateKeyFromFileToSecretsManager(
      serverCN
    );
    debug("Deleting CA private key");
    await secrets.deleteCAPrivateKeyFromFile();
    debug("reading server private key");
    const privateKey = await secrets.getServerPrivateKeyFromSecretsManager();
    debug("reading server cert");
    const cert = await fs.readFile(
      path.join(pkiPath, "issued", `${serverCN}.crt`),
      "utf8"
    );
    debug("reading ca cert");
    const caCert = await fs.readFile(path.join(pkiPath, `ca.crt`), "utf8");
    debug("Uploading certs to AWS");
    await certManager
      .importCertificate({
        Certificate: cert,
        PrivateKey: privateKey,
        CertificateChain: caCert,
      })
      .promise();
  } catch (e) {
    debug("Deleting CA private key");
    await secrets.deleteCAPrivateKeyFromFile();
    throw e;
  }
};

module.exports.regenCrl = async function regenCrl() {
  try {
    debug("Getting CA private key");
    await secrets.getCAPrivateKeyToFile();
    debug("Regnerating crl");
    await easyrsa({ EASYRSA_CRL_DAYS: 5000 }, "gen-crl");
    debug("Reading crl.pem");
    const crlPEM = await fs.readFile(path.join(pkiPath, `crl.pem`), "utf8");
    debug("Uploading CRL to vpn");
    await ec2
      .importClientVpnClientCertificateRevocationList({
        CertificateRevocationList: crlPEM,
        ClientVpnEndpointId: vpnClientEndpointId,
      })
      .promise();
  } catch (e) {
    console.error("Error regenerating crl", err);
    debug("Deleting CA private key");
    await secrets.deleteCAPrivateKeyFromFile();
    throw e;
  }
};

module.exports.revokeClient = async function revokeClient(commonName) {
  try {
    if (!vpnClientEndpointId) {
      throw new Error("Add VPN_CLIENT_ENDPOINT_ID to .env file");
    }

    debug("Getting CA private key");
    await secrets.getCAPrivateKeyToFile();
    debug("Revoking cert");
    await easyrsa({ EASYRSA_BATCH: "true" }, "revoke", commonName);
    debug("Regnerating crl");
    await easyrsa({}, "gen-crl");
    debug("Reading crl.pem");
    const crlPEM = await fs.readFile(path.join(pkiPath, `crl.pem`), "utf8");
    debug("Uploading CRL to vpn");
    await ec2
      .importClientVpnClientCertificateRevocationList({
        CertificateRevocationList: crlPEM,
        ClientVpnEndpointId: vpnClientEndpointId,
      })
      .promise();
  } catch (e) {
    debug("Deleting CA private key");
    await secrets.deleteCAPrivateKeyFromFile();
    throw e;
  }
};

module.exports.createClient = async function createClient(commonName) {
  if (!vpnClientEndpointId) {
    throw new Error("Add VPN_CLIENT_ENDPOINT_ID to .env file");
  }

  try {
    debug("Getting CA private key");
    await secrets.getCAPrivateKeyToFile();
    debug(`Creating client cert for commonName: ${commonName}`);
    await easyrsa({}, "build-client-full", `${commonName}`, "nopass");
    debug("Deleting CA private key");
    await secrets.deleteCAPrivateKeyFromFile();
  } catch (e) {
    debug("Deleting CA private key");
    await secrets.deleteCAPrivateKeyFromFile();
    throw e;
  }
};

module.exports.createOVPN = async function createOVPN(commonName) {
  const port = process.env.PORT;
  const protocol = process.env.PROTOCOL;

  debug("reading private key");
  const privateKey = await secrets.getPrivateKeyFromFile(commonName);
  debug("reading cert");
  const cert = await secrets.getCertFromFile(commonName);
  debug("Stripping off prologue");
  const marker = "-----BEGIN CERTIFICATE-----";
  const beginningOfCert = cert.lastIndexOf(marker);
  const pem = cert.substr(beginningOfCert);
  debug("reading ca cert");
  const caCert = await secrets.getCACertFromFile();
  debug("Creating .ovpn file");
  const ovpnTemplate = `
client
dev tun
proto ${protocol}
remote ${commonName}.${vpnClientEndpointId}.prod.clientvpn.${process.env.AWS_REGION}.amazonaws.com ${port}
remote-random-hostname
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
verb 3
<ca>
${caCert}
</ca>

reneg-sec 0

<cert>
${pem}
</cert>
<key>
${privateKey}
</key>
`;
  debug(".ovpn file");
  debug(ovpnTemplate);
  await fs.writeFile(`${commonName}.ovpn`, ovpnTemplate, "utf8");
};
