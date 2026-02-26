#!/usr/bin/env bash
set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for tools/railway/smoke-health.sh"
  exit 1
fi

BASE_URL="${1:-${RAILWAY_APP_URL:-${APP_URL:-}}}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: bash tools/railway/smoke-health.sh <base-url>"
  echo "Or set RAILWAY_APP_URL / APP_URL."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for tools/railway/smoke-health.sh"
  exit 1
fi

BASE_URL="${BASE_URL%/}"
MAX_RETRIES="${MAX_RETRIES:-30}"
SLEEP_SECONDS="${SLEEP_SECONDS:-10}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-20}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

fetch_with_retry() {
  local path="$1"
  local expected_status="$2"
  local body_file="$3"
  local status_file="$4"
  local url="${BASE_URL}${path}"

  local i
  for ((i = 1; i <= MAX_RETRIES; i++)); do
    local status_code
    status_code=$(
      curl -sS \
        -L \
        --max-time "${CURL_TIMEOUT_SECONDS}" \
        -o "${body_file}" \
        -w "%{http_code}" \
        "${url}" || true
    )

    echo "${status_code}" >"${status_file}"

    if [[ "${status_code}" == "${expected_status}" ]]; then
      return 0
    fi

    if (( i < MAX_RETRIES )); then
      sleep "${SLEEP_SECONDS}"
    fi
  done

  return 1
}

health_body="${WORKDIR}/health.json"
health_status="${WORKDIR}/health.status"
if ! fetch_with_retry "/api/v1/health" "200" "${health_body}" "${health_status}"; then
  echo "Health check failed after ${MAX_RETRIES} retries"
  echo "URL: ${BASE_URL}/api/v1/health"
  echo "HTTP: $(cat "${health_status}")"
  cat "${health_body}" || true
  exit 1
fi

if [[ "$(jq -r '.status // empty' "${health_body}")" != "OK" ]]; then
  echo "Health endpoint did not return JSON status=OK"
  cat "${health_body}"
  exit 1
fi

info_body="${WORKDIR}/info.json"
info_status="${WORKDIR}/info.status"
if ! fetch_with_retry "/api/v1/info" "200" "${info_body}" "${info_status}"; then
  echo "Info endpoint failed after ${MAX_RETRIES} retries"
  echo "URL: ${BASE_URL}/api/v1/info"
  echo "HTTP: $(cat "${info_status}")"
  cat "${info_body}" || true
  exit 1
fi

jq -e '.' "${info_body}" >/dev/null

index_body="${WORKDIR}/index.html"
index_status="${WORKDIR}/index.status"
if ! fetch_with_retry "/en/" "200" "${index_body}" "${index_status}"; then
  echo "Frontend index page failed after ${MAX_RETRIES} retries"
  echo "URL: ${BASE_URL}/en/"
  echo "HTTP: $(cat "${index_status}")"
  cat "${index_body}" || true
  exit 1
fi

if grep -q '\${languageCode}' "${index_body}"; then
  echo "Frontend index contains unresolved template placeholder: \${languageCode}"
  exit 1
fi

if ! grep -q '../api/assets/en/site.webmanifest' "${index_body}"; then
  echo "Frontend index is missing the localized manifest link"
  exit 1
fi

if grep -q 'http://0\.0\.0\.0' "${index_body}"; then
  echo "Frontend index contains fallback root URL (http://0.0.0.0). Set ROOT_URL in Railway."
  exit 1
fi

manifest_body="${WORKDIR}/manifest.json"
manifest_status="${WORKDIR}/manifest.status"
if ! fetch_with_retry "/api/assets/en/site.webmanifest" "200" "${manifest_body}" "${manifest_status}"; then
  echo "Manifest endpoint failed after ${MAX_RETRIES} retries"
  echo "URL: ${BASE_URL}/api/assets/en/site.webmanifest"
  echo "HTTP: $(cat "${manifest_status}")"
  cat "${manifest_body}" || true
  exit 1
fi

jq -e '.' "${manifest_body}" >/dev/null

if grep -q '\${languageCode}' "${manifest_body}"; then
  echo "Manifest contains unresolved template placeholder: \${languageCode}"
  exit 1
fi

echo "Smoke checks passed for ${BASE_URL}"
