'use strict';

const AWS = require('aws-sdk');
const debug = require('debug')('gitcaws:secrets');
const fs = require('fs').promises;
const path = require('path');

const secretsManager = new AWS.SecretsManager();

const caPrivateKeyName = process.env.SECRETS_MANAGER_CA_KEY;
debug(`CA private key stored in SecretId: ${caPrivateKeyName}`);
const serverPrivateKeyName = process.env.SECRETS_MANAGER_SERVER_KEY;
debug(`Server private key stored in SecretId: ${serverPrivateKeyName}`);

class Secrets {
    constructor(pkiPath) {
        this.pkiPath = pkiPath;
    }

    async doesSecretExist(secretName) {
        try {
            const secret = await secretsManager.describeSecret({ SecretId: secretName }).promise();
            return true;
        }
        catch (e) {
            if (e.code === 'ResourceNotFoundException') {
                return false;
            }
            else {
                throw e;
            }
        }
    }

    async doesCAPrivateKeyExist() {
        const exists = await this.doesSecretExist(caPrivateKeyName);
        return exists;
    };

    async doesServerPrivateKeyExist() {
        const exists = await this.doesSecretExist(serverPrivateKeyName);
        return exists;
    };

    async savePrivateKeyFromFileToSecretsManager(privateKeyCN, secretName) {
        const secretValue = await this.getPrivateKeyFromFile(privateKeyCN);
        await secretsManager.createSecret({ Name: secretName, SecretString: secretValue }).promise();
    }

    async saveAndDeleteCAPrivateKeyFromFileToSecretsManager() {
        await this.savePrivateKeyFromFileToSecretsManager('ca', caPrivateKeyName);
        await this.deleteCAPrivateKeyFromFile();
    }

    async getCAPrivateKeyFromSecretsManager() {
        const secretValue = await secretsManager.getSecretValue({ SecretId: caPrivateKeyName }).promise();
        return secretValue.SecretString;
    }

    async getCAPrivateKeyToFile() {
        const privateKeyPath = path.join(this.pkiPath, 'private/ca.key');
        const secretValue = await this.getCAPrivateKeyFromSecretsManager();
        await fs.writeFile(privateKeyPath, secretValue, "utf8");
    }

    async doesCAPrivateKeyExistOnDisk() {
        const privateKeyPath = path.join(this.pkiPath, 'private/ca.key');
        try {
            await fs.access(privateKeyPath, require('fs').constants.F_OK);
            return true;
        }
        catch (e) {
            return false;
        }
    }

    async deleteCAPrivateKeyFromFile() {
        const privateKeyPath = path.join(this.pkiPath, 'private/ca.key');
        try {
            const exists = await this.doesCAPrivateKeyExistOnDisk();
            if (exists) {
                await fs.unlink(privateKeyPath);
            }
        }
        catch (e) {
            console.error(`CA Private Key not deleted from ${privateKeyPath}!!!`);
            throw e;
        }
    }

    async getServerPrivateKeyFromSecretsManager() {
        const secretValue = await secretsManager.getSecretValue({ SecretId: serverPrivateKeyName }).promise();
        return secretValue.SecretString;
    }

    async saveServerPrivateKeyFromFileToSecretsManager(serverCN) {
        await this.savePrivateKeyFromFileToSecretsManager(serverCN, serverPrivateKeyName);
    }

    async writeSecretToFile(secretName, filePath) {
        const secretValue = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
        await fs.writeFile(filePath, secretValue.SecretString);
    }

    async getPrivateKeyFromFile(commonName) {
        const privateKeyPath = path.join(this.pkiPath, `private/${commonName}.key`);
        const privateKey = await fs.readFile(privateKeyPath, "utf8");
        return privateKey;
    }

    async getCertFromFile(commonName) {
        const certPath = path.join(this.pkiPath, `issued/${commonName}.crt`);
        const cert = await fs.readFile(certPath, "utf8");
        return cert;
    }

    async getCACertFromFile(commonName) {
        const certPath = path.join(this.pkiPath, 'ca.crt');
        const cert = await fs.readFile(certPath, "utf8");
        return cert;
    }

}

module.exports = Secrets;