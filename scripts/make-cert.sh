#!/bin/bash
# scripts/make-cert.sh — Create a self-signed code-signing identity for local
# Sotto builds, once.
#
# Why: electron-builder can't use a self-signed certificate, so local builds get
# an ad-hoc signature that changes on every build. macOS ties Screen Recording,
# Microphone and Accessibility grants to the signature, so it forgets them after
# each rebuild. Signing every build with this one identity (scripts/sign-mac.mjs)
# keeps the grants.
#
# The key is created with codesign pre-authorized (-T), so signing doesn't
# stop on a keychain prompt.
set -euo pipefail

NAME="${CERT_NAME:-Sotto Local Signing}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-certificate -c "$NAME" "$KEYCHAIN" >/dev/null 2>&1; then
  echo "Identity '$NAME' already exists."
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS="$(/usr/bin/openssl rand -hex 16)"

cat > "$WORK/cert.cnf" <<CNF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CNF

# LibreSSL (/usr/bin/openssl) writes PKCS#12 with ciphers that `security import` reads.
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" -config "$WORK/cert.cnf" 2>/dev/null
/usr/bin/openssl pkcs12 -export -inkey "$WORK/key.pem" -in "$WORK/cert.pem" \
  -name "$NAME" -passout "pass:$PASS" -out "$WORK/id.p12"

security import "$WORK/id.p12" -k "$KEYCHAIN" -P "$PASS" -T /usr/bin/codesign >/dev/null

echo "Created '$NAME' in the login keychain."
