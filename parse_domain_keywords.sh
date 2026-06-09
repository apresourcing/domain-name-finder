#!/usr/bin/env bash
# Parse LeanDomainSearch top 5000 prefix/suffix gist into two text files.
# Source: https://gist.github.com/erikig/826f49442929e9ecfab6d7c481870700

set -euo pipefail

URL="https://gist.githubusercontent.com/erikig/826f49442929e9ecfab6d7c481870700/raw"
PREFIX_FILE="prefixes.txt"
SUFFIX_FILE="suffixes.txt"

echo "Downloading gist..."
DATA=$(curl -sL "$URL")

# Skip header, filter by type, strip the + marker, write one keyword per line
echo "$DATA" | tail -n +2 | awk -F'\t' '$2 == "Prefix" { gsub(/\+/, "", $3); print $3 }' > "$PREFIX_FILE"
echo "$DATA" | tail -n +2 | awk -F'\t' '$2 == "Suffix" { gsub(/\+/, "", $3); print $3 }' > "$SUFFIX_FILE"

PREFIX_COUNT=$(wc -l < "$PREFIX_FILE")
SUFFIX_COUNT=$(wc -l < "$SUFFIX_FILE")

echo "Done."
echo "  $PREFIX_FILE: $PREFIX_COUNT keywords"
echo "  $SUFFIX_FILE: $SUFFIX_COUNT keywords"
