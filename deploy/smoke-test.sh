#!/usr/bin/env bash
# End-to-end smoke test against a running stack (needs curl).
#   BASE_URL=http://localhost WADDLE_ADMIN_USER=admin WADDLE_ADMIN_PASSWORD=... deploy/smoke-test.sh
# Creates a throwaway duck (DP-9xxx), duck type (smoke-xxx) with ZZ- serials, an owner account and a
# find; safe to run repeatedly.
set -euo pipefail

BASE="${BASE_URL:-http://localhost}"
ADMIN_USER="${WADDLE_ADMIN_USER:?set WADDLE_ADMIN_USER}"
ADMIN_PASSWORD="${WADDLE_ADMIN_PASSWORD:?set WADDLE_ADMIN_PASSWORD}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); printf '  ok   %s\n' "$*"; }
bad() { FAIL=$((FAIL + 1)); printf '  FAIL %s\n' "$*"; }

# req METHOD PATH [curl args...] -> sets STATUS, BODY file, HEADERS file
req() {
  local method="$1" path="$2"
  shift 2
  STATUS="$(curl -sS -o "$WORK/body" -D "$WORK/headers" -w '%{http_code}' -X "$method" "$@" "$BASE$path")"
}
body() { cat "$WORK/body"; }
expect() {
  local want="$1" label="$2"
  if [[ "$STATUS" == "$want" ]]; then ok "$label ($STATUS)"; else bad "$label: expected $want, got $STATUS: $(head -c 300 "$WORK/body")"; fi
}
expect_json_error() {
  local want="$1" label="$2"
  if [[ "$STATUS" == "$want" ]] && grep -q '"error":{"code":"[a-z_]*","message":' "$WORK/body" && ! grep -qi 'stack\|\.js:[0-9]' "$WORK/body"; then
    ok "$label ($STATUS JSON error)"
  else
    bad "$label: expected $want JSON error, got $STATUS: $(head -c 300 "$WORK/body")"
  fi
}
json_field() { sed -n "s/.*\"$1\":\"\\([^\"]*\\)\".*/\\1/p" "$WORK/body" | head -n 1; }
json_num() { sed -n "s/.*\"$1\":\\([0-9][0-9]*\\).*/\\1/p" "$WORK/body" | head -n 1; }

echo "Smoke testing $BASE"

req GET /api/health
expect 200 "GET /api/health"
if grep -q '"db":"ok"' "$WORK/body" && grep -q '"storage":"ok"' "$WORK/body"; then ok "health reports db and storage reachable"; else bad "health body: $(body)"; fi

for path in /duck/DP-9999 /no-such-page /my-flock /admin; do
  req GET "$path"
  if [[ "$STATUS" == 200 ]] && grep -q '<div id="root">' "$WORK/body"; then ok "GET $path serves the SPA"; else bad "GET $path: $STATUS"; fi
done
req GET /assets/duckport/sunny-hero.png
if [[ "$STATUS" == 200 ]] && grep -qi 'content-type: image/png' "$WORK/headers"; then ok "artwork served"; else bad "artwork: $STATUS"; fi

# Auth
req POST /api/auth/login -H 'content-type: application/json' --data "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\"}"
expect 200 "admin login"
COOKIE_LINE="$(grep -i '^set-cookie:' "$WORK/headers" | head -n 1 | tr -d '\r')"
if [[ "$COOKIE_LINE" == *HttpOnly* && "$COOKIE_LINE" == *SameSite=Lax* ]]; then ok "session cookie is HttpOnly; SameSite=Lax"; else bad "cookie: $COOKIE_LINE"; fi
ADMIN_COOKIE="$(printf '%s' "$COOKIE_LINE" | sed 's/^[Ss]et-[Cc]ookie: //; s/;.*//')"

req GET /api/admin/stats
expect_json_error 401 "admin stats without session"
req GET /api/admin/stats -H "cookie: $ADMIN_COOKIE"
expect 200 "admin stats with admin session"

SUFFIX="$(printf '%03d' $((RANDOM % 1000)))"
CODE="DP-9$SUFFIX"
OWNER="smoke-owner-$SUFFIX$RANDOM"
req POST /api/admin/users -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data "{\"username\":\"$OWNER\",\"password\":\"owner-password-1\"}"
expect 201 "admin creates owner $OWNER"
req POST /api/admin/ducks -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data "{\"code\":\"$CODE\",\"name\":\"Smokey\",\"color\":\"Blue\",\"owner\":\"$OWNER\"}"
if [[ "$STATUS" == 409 ]]; then ok "duck $CODE already exists (re-run)"; else expect 201 "admin creates duck $CODE"; fi

# Duck types and serials (needs migration 005)
req GET "/api/ducks/$CODE"
if grep -q "\"serial\":\"$CODE\"" "$WORK/body" && grep -q '"type":{"slug":"[a-z0-9-]*"' "$WORK/body"; then ok "duck $CODE has a serial and a type"; else bad "duck type/serial: $(head -c 300 "$WORK/body")"; fi
req GET /api/duck-types
expect 200 "GET /api/duck-types"
TYPE_SLUG="smoke-$SUFFIX"
req POST /api/admin/duck-types -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data "{\"slug\":\"$TYPE_SLUG\",\"name\":\"Smoke\",\"color\":\"Blue\"}"
if [[ "$STATUS" == 409 ]]; then ok "type $TYPE_SLUG already exists (re-run)"; else expect 201 "admin creates type $TYPE_SLUG"; fi
req POST /api/admin/duck-types -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data "{\"slug\":\"$TYPE_SLUG\",\"name\":\"Smoke\",\"color\":\"Blue\"}"
expect_json_error 409 "duplicate type slug"
req POST /api/admin/duck-types -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data '{"slug":"Not A Slug","name":"X","color":"Blue"}'
expect_json_error 400 "invalid type slug"
req POST "/api/admin/duck-types/$TYPE_SLUG/ducks" -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data '{"count":2,"prefix":"ZZ"}'
expect 201 "batch-register 2 $TYPE_SLUG ducks"
BATCH_SERIAL="$(sed -n 's/.*"serials":\["\([A-Z]*-[0-9]*\)".*/\1/p' "$WORK/body")"
req POST "/api/admin/duck-types/$TYPE_SLUG/ducks" -H "cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data '{"count":0}'
expect_json_error 400 "batch count 0"
req GET "/api/duck-types/$TYPE_SLUG"
if [[ "$STATUS" == 200 && -n "$BATCH_SERIAL" ]] && grep -q "\"serial\":\"$BATCH_SERIAL\"" "$WORK/body"; then ok "type page lists $BATCH_SERIAL"; else bad "type listing: $STATUS $(head -c 300 "$WORK/body")"; fi

req POST /api/auth/login -H 'content-type: application/json' --data "{\"username\":\"$OWNER\",\"password\":\"owner-password-1\"}"
expect 200 "owner login"
OWNER_COOKIE="$(grep -i '^set-cookie:' "$WORK/headers" | head -n 1 | tr -d '\r' | sed 's/^[Ss]et-[Cc]ookie: //; s/;.*//')"
req GET /api/admin/finds -H "cookie: $OWNER_COOKIE"
expect_json_error 403 "admin queue with owner session"
req GET /api/my/ducks -H "cookie: $OWNER_COOKIE"
expect 200 "owner my-flock"
if grep -q "\"$CODE\"" "$WORK/body"; then ok "owner sees $CODE in their flock"; else bad "flock: $(body)"; fi

# Finds + photos
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00smoke-test-jpeg\xff\xd9' >"$WORK/duck.jpg"
req POST "/api/ducks/$CODE/finds" -F name="Smoke Tester" -F place="Nassau, Bahamas" -F note="Hello from the smoke test" -F rehidden=yes -F "photo=@$WORK/duck.jpg;type=image/jpeg"
expect 201 "submit find with JPEG"
FIND_ID="$(json_num id)"
PHOTO_URL="$(json_field photoUrl)"
if grep -q '"status":"pending"' "$WORK/body"; then ok "find is pending"; else bad "find status: $(body)"; fi
req GET "/api/ducks/$CODE/finds"
if grep -q "\"id\":$FIND_ID," "$WORK/body"; then bad "pending find is public"; else ok "pending find absent from public list"; fi
req GET "$PHOTO_URL"
expect_json_error 404 "pending photo is not public"
req POST "/api/admin/finds/$FIND_ID/approve" -H "cookie: $ADMIN_COOKIE"
expect 200 "admin approves find $FIND_ID"
req GET "/api/ducks/$CODE/finds"
if grep -q "\"id\":$FIND_ID," "$WORK/body"; then ok "approved find is public"; else bad "approved find missing: $(body)"; fi
req GET "$PHOTO_URL"
if [[ "$STATUS" == 200 ]] && grep -qi 'content-type: image/jpeg' "$WORK/headers" && cmp -s "$WORK/body" "$WORK/duck.jpg"; then
  ok "photo URL loads the uploaded bytes"
else
  bad "photo: $STATUS"
fi

printf 'definitely not an image' >"$WORK/fake.jpg"
req POST "/api/ducks/$CODE/finds" -F name=A -F place=B -F note=C -F "photo=@$WORK/fake.jpg;type=image/jpeg"
expect_json_error 415 "non-image upload"
{ printf '\xff\xd8\xff\xe0'; head -c 9000000 /dev/zero; } >"$WORK/big.jpg"
req POST "/api/ducks/$CODE/finds" -F name=A -F place=B -F note=C -F "photo=@$WORK/big.jpg;type=image/jpeg"
expect_json_error 413 "oversized upload (9 MB)"
{ printf '\xff\xd8\xff\xe0'; head -c 14000000 /dev/zero; } >"$WORK/huge.jpg"
req POST "/api/ducks/$CODE/finds" -F name=A -F place=B -F note=C -F "photo=@$WORK/huge.jpg;type=image/jpeg"
expect_json_error 413 "oversized upload past the nginx limit (14 MB)"

# Errors
req POST /api/auth/login -H 'content-type: application/json' --data '{not json'
expect_json_error 400 "malformed JSON"
req GET /api/no-such-route
expect_json_error 404 "unknown API route"
req GET /api/ducks/DP-9999
expect_json_error 404 "unknown duck"

echo "passed: $PASS  failed: $FAIL"
[[ "$FAIL" == 0 ]]
