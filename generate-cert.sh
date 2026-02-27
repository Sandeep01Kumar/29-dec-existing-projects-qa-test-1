#!/bin/bash

# generate-cert.sh
# Generates self-signed TLS certificates for HTTPS development support
# WARNING: These certificates are for development use only.
# For production, use certificates from a trusted Certificate Authority.

set -e

# Create certs directory if it doesn't exist
CERT_DIR="./certs"
mkdir -p "$CERT_DIR"

# Generate self-signed certificate and private key
echo "Generating self-signed TLS certificate..."

openssl req -x509 \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=Development/L=Local/O=Development/CN=localhost"

echo ""
echo "Certificate generated successfully!"
echo "  Private key: $CERT_DIR/key.pem"
echo "  Certificate: $CERT_DIR/cert.pem"
echo "  Validity: 365 days"
echo ""
echo "WARNING: These certificates are self-signed and for development use only."
echo "For production, use certificates from a trusted Certificate Authority."
