#!/usr/bin/env bash
# Made By Eng Nayer Nader
# The C Lounge — external keep-alive, for any host with cron.
#
#   crontab -e
#   */10 * * * * /path/to/ping.sh >> /var/log/clounge-keepalive.log 2>&1
#
# Exits non-zero if a service could not be reached, so cron mails you.

set -u

TARGETS=(
  "https://thecloungeworld.com/keepalive"
  "https://clounge-ai.onrender.com/keepalive"
)

status=0
for url in "${TARGETS[@]}"; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' \
           --max-time 90 --retry 3 --retry-delay 15 --retry-all-errors \
           -A 'clounge-cron-keepalive' "$url" || echo 000)
  printf '%s  %s -> %s\n' "$(date -u +%FT%TZ)" "$url" "$code"
  case "$code" in
    2*|3*) ;;
    *) status=1 ;;
  esac
done
exit "$status"
