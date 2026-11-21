#!/usr/bin/env bash
# Setzt eine neue Versionsnummer in index.html, app.js und version.json.
# Aufruf: ./bump-version.sh            -> Datum + laufende Nummer (z. B. 2026.11.16-1)
#         ./bump-version.sh 2026.12.1  -> feste Version
set -euo pipefail
cd "$(dirname "$0")"
old=$(sed -n "s/^const APP_VERSION = '\(.*\)';/\1/p" app.js)
if [ $# -ge 1 ]; then new=$1; else
  today=$(date +%Y.%m.%d | sed 's/\.0/./g')
  if [[ $old == "$today"-* ]]; then new="$today-$(( ${old##*-} + 1 ))"; else new="$today-1"; fi
fi
sed -i "s/^const APP_VERSION = '.*';/const APP_VERSION = '$new';/" app.js
sed -i -E "s/(styles\.css|[a-z0-9-]+\.js|[a-z0-9-]+\.png|favicon\.ico)\?v=[^\"]*/\1?v=$new/g" index.html
printf '{ "version": "%s" }\n' "$new" > version.json
echo "$old -> $new"
