#!/usr/bin/env bash
# Parse marcanuy's gist of LeanDomainSearch top 5000 prefix/suffix list.
# Source: https://gist.github.com/marcanuy/06cb00bc36033cd12875
#
# Format: multi-column rows like "1. my+  1001. se+  2001. thedaily+ ..."
# Prefixes end with +, suffixes start with +.

set -euo pipefail

URL="https://gist.githubusercontent.com/marcanuy/06cb00bc36033cd12875/raw"
PREFIX_FILE="prefixes_v2.txt"
SUFFIX_FILE="suffixes_v2.txt"

echo "Downloading gist..."
DATA=$(curl -sL "$URL")

# Extract every token that matches a keyword pattern (word with + on one side),
# strip the rank numbers, classify by + position.
echo "$DATA" \
  | grep -oP '(\+[\w]+|[\w]+\+)' \
  | sort -u \
  | while read -r token; do
      if [[ "$token" == +* ]]; then
        echo "${token#+}" >> "$SUFFIX_FILE.tmp"
      elif [[ "$token" == *+ ]]; then
        echo "${token%+}" >> "$PREFIX_FILE.tmp"
      fi
    done

# Sort and deduplicate
sort -u "$PREFIX_FILE.tmp" > "$PREFIX_FILE" && rm "$PREFIX_FILE.tmp"
sort -u "$SUFFIX_FILE.tmp" > "$SUFFIX_FILE" && rm "$SUFFIX_FILE.tmp"

PREFIX_COUNT=$(wc -l < "$PREFIX_FILE")
SUFFIX_COUNT=$(wc -l < "$SUFFIX_FILE")

echo "Done."
echo "  $PREFIX_FILE: $PREFIX_COUNT keywords"
echo "  $SUFFIX_FILE: $SUFFIX_COUNT keywords"
