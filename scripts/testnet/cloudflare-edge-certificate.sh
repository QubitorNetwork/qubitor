#!/usr/bin/env bash
set -euo pipefail

API_BASE="${CLOUDFLARE_API_BASE:-https://api.cloudflare.com/client/v4}"
ZONE_NAME="${CLOUDFLARE_ZONE_NAME:-qubitor.org}"
ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [[ "${1:-}" == "--" ]]; then
  shift
fi
ACTION="${1:-status}"
HOSTS_CSV="${QUBITOR_CLOUDFLARE_CERT_HOSTS:-qubitor.org,*.testnet.qubitor.org}"
CERT_AUTHORITY="${QUBITOR_CLOUDFLARE_CERT_CA:-lets_encrypt}"
VALIDATION_METHOD="${QUBITOR_CLOUDFLARE_CERT_VALIDATION:-txt}"
VALIDITY_DAYS="${QUBITOR_CLOUDFLARE_CERT_VALIDITY_DAYS:-90}"

fail() {
  echo "[qubitor-cloudflare-cert] $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_command curl
require_command jq

case "$ACTION" in
  order | status | list | poll) ;;
  *) fail "usage: pnpm testnet:cloudflare-cert -- order|status|poll" ;;
esac

[[ -n "$TOKEN" ]] || fail "CLOUDFLARE_API_TOKEN is required"
case "$TOKEN" in
  your-token | replace-with-* | changeme | CHANGE_ME)
    fail "CLOUDFLARE_API_TOKEN still looks like a placeholder; export a real Cloudflare API token"
    ;;
esac

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local response status body
  if [[ -n "$data" ]]; then
    response="$(curl -sS -X "$method" "$API_BASE$path" \
      -H "authorization: Bearer $TOKEN" \
      -H "content-type: application/json" \
      --data "$data" \
      -w $'\n%{http_code}')" || fail "Cloudflare API $method $path request failed"
  else
    response="$(curl -sS -X "$method" "$API_BASE$path" \
      -H "authorization: Bearer $TOKEN" \
      -H "content-type: application/json" \
      -w $'\n%{http_code}')" || fail "Cloudflare API $method $path request failed"
  fi
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [[ ! "$status" =~ ^2[0-9][0-9]$ ]]; then
    if jq -e . >/dev/null 2>&1 <<<"$body"; then
      jq . <<<"$body" >&2
    else
      printf '%s\n' "$body" >&2
    fi
    fail "Cloudflare API $method $path failed with HTTP $status"
  fi
  printf '%s' "$body"
}

if [[ -z "$ZONE_ID" ]]; then
  zone_response="$(api GET "/zones?name=$ZONE_NAME&status=active")"
  zone_count="$(jq -r '.result | length' <<<"$zone_response")"
  ZONE_ID="$(jq -r '.result[0].id // empty' <<<"$zone_response")"
  if [[ -z "$ZONE_ID" ]]; then
    jq '{ success, errors, resultCount: (.result | length), result: [.result[]? | { id, name, status, account: .account.name }] }' \
      <<<"$zone_response" >&2
    fail "could not resolve Cloudflare zone ID for $ZONE_NAME. Make sure the token can read this zone, or set CLOUDFLARE_ZONE_ID directly."
  fi
  if [[ "$zone_count" != "1" ]]; then
    echo "[qubitor-cloudflare-cert] resolved $ZONE_NAME to zone $ZONE_ID from $zone_count active zones" >&2
  fi
fi

hosts_json() {
  jq -Rn --arg hosts "$HOSTS_CSV" '
    $hosts
    | split(",")
    | map(gsub("^\\s+|\\s+$"; ""))
    | map(select(length > 0))
  '
}

print_response_or_fail() {
  local response="$1"
  if [[ "$(jq -r '.success' <<<"$response")" != "true" ]]; then
    jq . <<<"$response" >&2
    fail "Cloudflare API request failed"
  fi
  jq . <<<"$response"
}

list_packs() {
  local response
  response="$(api GET "/zones/$ZONE_ID/ssl/certificate_packs?status=all")"
  print_response_or_fail "$response" |
    jq '{
      zoneName: env.CLOUDFLARE_ZONE_NAME,
      zoneId: "'"$ZONE_ID"'",
      certificatePacks: [
        .result[]
        | {
            id,
            type,
            status,
            hosts,
            certificateAuthority: .certificate_authority,
            validationMethod: .validation_method,
            validationErrors: .validation_errors,
            certificates: [
              (.certificates // [])[]
              | { id, status, issuer, hosts, expires_on }
            ],
            dcvDelegationRecords: .dcv_delegation_records
          }
      ]
    }'
}

order_pack() {
  local payload response
  payload="$(
    jq -n \
      --argjson hosts "$(hosts_json)" \
      --arg ca "$CERT_AUTHORITY" \
      --arg validation "$VALIDATION_METHOD" \
      --argjson days "$VALIDITY_DAYS" \
      '{
        type: "advanced",
        hosts: $hosts,
        certificate_authority: $ca,
        validation_method: $validation,
        validity_days: $days,
        cloudflare_branding: false
      }'
  )"

  echo "[qubitor-cloudflare-cert] ordering Cloudflare edge certificate for $(jq -r '.hosts | join(", ")' <<<"$payload")"
  response="$(api POST "/zones/$ZONE_ID/ssl/certificate_packs/order" "$payload")"
  print_response_or_fail "$response" |
    jq '{
      id: .result.id,
      type: .result.type,
      status: .result.status,
      hosts: .result.hosts,
      certificateAuthority: .result.certificate_authority,
      validationMethod: .result.validation_method,
      dcvDelegationRecords: .result.dcv_delegation_records,
      validationErrors: .result.validation_errors
    }'
}

case "$ACTION" in
  order)
    order_pack
    ;;
  status | list)
    list_packs
    ;;
  poll)
    for _ in $(seq 1 "${QUBITOR_CLOUDFLARE_CERT_POLL_ATTEMPTS:-30}"); do
      output="$(list_packs)"
      jq . <<<"$output"
      if jq -e --arg host "*.testnet.qubitor.org" '
        .certificatePacks[]
        | select(.hosts | index($host))
        | select(.status == "active")
      ' <<<"$output" >/dev/null; then
        echo "[qubitor-cloudflare-cert] active"
        exit 0
      fi
      sleep "${QUBITOR_CLOUDFLARE_CERT_POLL_SLEEP:-20}"
    done
    fail "certificate did not become active within poll window"
    ;;
esac
