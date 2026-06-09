#!/usr/bin/env bash
# Check domain availability for <prefix><keyword>.com and <keyword><suffix>.com
# using the RapidAPI bulk domain availability check endpoint.
#
# Usage:
#   ./check_domains.sh <keyword> [--prefixes-only | --suffixes-only] [--batch-size N]
#
# Examples:
#   ./check_domains.sh rocket
#   ./check_domains.sh cloud --prefixes-only
#   ./check_domains.sh lab --batch-size 30
#
# Output: available_<keyword>.txt with all available domains

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load environment variables
if [[ -f "$SCRIPT_DIR/.env" ]]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

PREFIX_FILE="$SCRIPT_DIR/prefixes.txt"
SUFFIX_FILE="$SCRIPT_DIR/suffixes.txt"
API_URL="https://bulk-domain-name-availability-check.p.rapidapi.com/domains/availability"
API_KEY="2Kb8UFywFZmshk1mFL38ybdtdgbep19hhn5jsnb5C9msji5tkQ"
API_HOST="bulk-domain-name-availability-check.p.rapidapi.com"
BATCH_SIZE=100
MODE="both"  # both | prefixes | suffixes

# --- Parse arguments ---
KEYWORD=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --prefixes-only) MODE="prefixes"; shift ;;
        --suffixes-only) MODE="suffixes"; shift ;;
        --batch-size)    BATCH_SIZE="$2"; shift 2 ;;
        -*)              echo "Unknown option: $1" >&2; exit 1 ;;
        *)               KEYWORD="$1"; shift ;;
    esac
done

if [[ -z "$KEYWORD" ]]; then
    echo "Usage: $0 <keyword> [--prefixes-only | --suffixes-only] [--batch-size N]"
    exit 1
fi

OUTPUT_FILE="$SCRIPT_DIR/available_${KEYWORD}.txt"
> "$OUTPUT_FILE"

# --- Build domain list ---
DOMAINS_FILE=$(mktemp)
trap 'rm -f "$DOMAINS_FILE"' EXIT

if [[ "$MODE" != "suffixes" ]] && [[ -f "$PREFIX_FILE" ]]; then
    while IFS= read -r prefix; do
        echo "${prefix}${KEYWORD}.com"
    done < "$PREFIX_FILE" >> "$DOMAINS_FILE"
fi

if [[ "$MODE" != "prefixes" ]] && [[ -f "$SUFFIX_FILE" ]]; then
    while IFS= read -r suffix; do
        echo "${KEYWORD}${suffix}.com"
    done < "$SUFFIX_FILE" >> "$DOMAINS_FILE"
fi

TOTAL=$(wc -l < "$DOMAINS_FILE")
echo "Checking $TOTAL domain combinations for keyword '$KEYWORD' (batch size: $BATCH_SIZE)..."

# --- Check in batches ---
CHECKED=0
AVAILABLE=0

while true; do
    # Read next batch using sed to avoid broken pipe with tail|head
    START=$((CHECKED + 1))
    END=$((CHECKED + BATCH_SIZE))
    BATCH=$(sed -n "${START},${END}p" "$DOMAINS_FILE")
    [[ -z "$BATCH" ]] && break

    BATCH_COUNT=$(echo "$BATCH" | wc -l)

    # Build JSON payload
    JSON_ARRAY=$(echo "$BATCH" | python3 -c "
import sys, json
domains = [line.strip() for line in sys.stdin if line.strip()]
print(json.dumps({'domains': domains}))
")

    # Call API
    RESPONSE=$(curl -s --request POST \
        --url "$API_URL" \
        --header "Content-Type: application/json" \
        --header "x-rapidapi-host: $API_HOST" \
        --header "x-rapidapi-key: $API_KEY" \
        --data "$JSON_ARRAY")

    # Parse available domains
    FOUND=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('status') == 'success':
        for r in data['results']:
            if r.get('available'):
                print(r['domain'])
    else:
        print(f'API error: {data}', file=sys.stderr)
except Exception as e:
    print(f'Parse error: {e}', file=sys.stderr)
" 2>&1)

    # Check for errors
    if echo "$FOUND" | grep -q "^API error\|^Parse error"; then
        echo "  ERROR at batch $((CHECKED / BATCH_SIZE + 1)): $FOUND" >&2
        # Brief pause before retrying might help with rate limits
        sleep 2
    else
        if [[ -n "$FOUND" ]]; then
            echo "$FOUND" >> "$OUTPUT_FILE"
            BATCH_AVAILABLE=$(echo "$FOUND" | wc -l)
            AVAILABLE=$((AVAILABLE + BATCH_AVAILABLE))
        fi
    fi

    CHECKED=$((CHECKED + BATCH_COUNT))
    PERCENT=$((CHECKED * 100 / TOTAL))
    printf "\r  Progress: %d/%d (%d%%) — %d available so far" "$CHECKED" "$TOTAL" "$PERCENT" "$AVAILABLE"

    # Small delay to avoid overwhelming the API
    sleep 0.1
done

echo ""
echo ""
echo "Done! Found $AVAILABLE available domains out of $TOTAL checked."
echo "Results saved to: $OUTPUT_FILE"

if [[ "$AVAILABLE" -gt 0 ]]; then
    echo ""
    echo "Available domains:"
    cat "$OUTPUT_FILE"
fi

# Send Pushover notification
if [[ -n "${PUSHOVER_TOKEN:-}" ]] && [[ -n "${PUSHOVER_USER:-}" ]]; then
    curl -s --request POST \
        --url "https://api.pushover.net/1/messages.json" \
        --form-string "token=$PUSHOVER_TOKEN" \
        --form-string "user=$PUSHOVER_USER" \
        --form-string "title=Domain Check Complete" \
        --form-string "message=Finished checking '$KEYWORD': $AVAILABLE available out of $TOTAL domains." \
        > /dev/null
    echo "Pushover notification sent."
fi
