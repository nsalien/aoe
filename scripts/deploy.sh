#!/usr/bin/env bash
# Zet het spel online op Cloudflare Pages + D1.
# Wordt automatisch uitgevoerd door de GitHub-actie (.github/workflows/deploy.yml),
# maar werkt ook lokaal na `npx wrangler login`:  npm run deploy
#
# Doet alles wat nodig is, ook de allereerste keer:
#   1. zoekt de D1-database (of maakt ze aan) en vult de id in wrangler.toml in
#   2. voert nieuwe database-migraties uit (map migrations/)
#   3. maakt het Pages-project aan als het nog niet bestaat
#   4. zet de beheerderssleutel (ADMIN_KEY) als die is meegegeven
#   5. publiceert de map public/ + functions/ als productieversie
#   6. zet de meldingen-worker (cron/, elke minuut) online; lukt dat niet, dan gaat de rest gewoon door
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${PAGES_PROJECT:-rijken-van-de-vallei}"
DB="${D1_DATABASE:-rijken-db}"
W=(npx --no-install wrangler)

# haalt een JSON-lijst uit de uitvoer van wrangler (die soms tekst ervoor zet)
json_find() { # $1 = sleutel om op te zoeken, $2 = waarde, $3 = sleutel om terug te geven
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const a = s.indexOf("["), b = s.lastIndexOf("]");
      if (a < 0 || b < a) process.exit(0);
      const list = JSON.parse(s.slice(a, b + 1));
      const hit = list.find((x) => x[process.argv[1]] === process.argv[2]);
      if (hit) console.log(hit[process.argv[3]]);
    });' "$1" "$2" "$3"
}

echo "▶ Database '$DB' zoeken…"
DB_ID="$("${W[@]}" d1 list --json | json_find name "$DB" uuid)"
if [ -z "$DB_ID" ]; then
  echo "  bestaat nog niet, wordt aangemaakt"
  "${W[@]}" d1 create "$DB" >/dev/null
  DB_ID="$("${W[@]}" d1 list --json | json_find name "$DB" uuid)"
fi
[ -n "$DB_ID" ] || { echo "Kon de database niet vinden of aanmaken." >&2; exit 1; }
echo "  id: $DB_ID"
sed -i.bak -E "s/^database_id = \".*\"/database_id = \"$DB_ID\"/" wrangler.toml && rm -f wrangler.toml.bak

echo "▶ Database-migraties uitvoeren…"
"${W[@]}" d1 migrations apply "$DB" --remote

echo "▶ Pages-project '$PROJECT' controleren…"
if [ -z "$("${W[@]}" pages project list --json | json_find "Project Name" "$PROJECT" "Project Name")" ]; then
  echo "  bestaat nog niet, wordt aangemaakt"
  "${W[@]}" pages project create "$PROJECT" --production-branch main
fi

if [ -n "${ADMIN_KEY:-}" ]; then
  echo "▶ Beheerderssleutel instellen…"
  printf '%s' "$ADMIN_KEY" | "${W[@]}" pages secret put ADMIN_KEY --project-name "$PROJECT" >/dev/null
fi

echo "▶ Publiceren…"
"${W[@]}" pages deploy --project-name "$PROJECT" --branch main --commit-dirty=true \
  ${COMMIT_MSG:+--commit-message "$COMMIT_MSG"}

echo "✔ Online: https://$PROJECT.pages.dev"

echo "▶ Meldingen-worker (elke minuut) online zetten…"
sed -i.bak -E "s/^database_id = \".*\"/database_id = \"$DB_ID\"/" cron/wrangler.toml && rm -f cron/wrangler.toml.bak
if "${W[@]}" deploy --config cron/wrangler.toml; then
  echo "  ✔ meldingen worden elke minuut verstuurd"
else
  echo "::warning::De meldingen-worker kon niet online. Geef het Cloudflare-token ook het recht 'Account · Workers Scripts · Edit'. Tot dan gaan meldingen enkel uit als iemand het spel open heeft."
fi
