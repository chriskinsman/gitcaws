# gitcaws

gitcaws = git CA for AWS Client VPN Endpoints

AWS Client VPN Endpoints don't provide an easy way to manage the certificates for certificate based mutual authentication.  AWS Certificate Manager Privace Certificate Authority seems like a likely choice but it is expensive and at the time this project was published there was no documentation on how to use it to provision certificates for AWS Client VPN Endpoints.

This project is a lightweight git based CA.  Private keys for the CA and Server certificates are stored in AWS Secrets Manager and never checked into git. Client certificate private keys are not checked into git and are not stored in Secrets Manager.  Typically they are not necessary to keep for most scenarios.

All operations get the private keys to the local file system, use them for the requested operation and then delete them when done. There is a period of time when the keys are stored in the clear in the local system.  If this concerns you, don't use this solution.

## Configuration

Configuration options are in the .env file in the root of the project. Each of these options set environment variables. If you already have an AWS_PROFILE or AWS_REGION defined in your environment you may delete them from the .env file.

## Getting Started

The process to stand up an AWS Client VPN endpoint using gitcaws would be:
1. git clone 
2. npm ci
3. npm link
4. init-ca - Creates the PKI directory, creates the key pair for the CA, stores the private key in Secrets manager, uploads the certificate to ACM and deletes the private key.  Should only be done once.
5. create-server - Creates the server key pair for the client vpn endpoint, stores the private key in Secrets manager, uploads the certificate to ACM and deletes the private key. Should only be done once.
6. Use the gitcaws-server cert in ACM to create a new client VPN endpoint
7. Add VPN_CLIENT_ENDPOINT_ID to the .env file at the root
8. create-client-ovpn firstnamelastname - This will generate the .ovpn file for the user
9. Import the firstnamelastname.ovpn file into your OpenVPN client and connect

After any operation make sure to check in the changes and push them to github.  We need to keep track of the public cert files to enable revocation, etc.

## Revoking access
To revoke access for a user run: 
revoke-client firstnamelastname - to revoke their cert and upload an updated certificate revocation list to the client vpn endpoint.

## If You Need To Start Over
1. Delete the CA and Server private keys from your AWS Secrets Manager.
2. Delete the easyrsa3/pki directory