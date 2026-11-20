# Rijken van de Vallei — instructies voor Claude

Browser-strategiespel (isometrisch, "bouw je rijk") voor een kleine vriendengroep.
Draait op **Cloudflare Pages + Pages Functions + D1** (gratis plan). Alle tekst in het spel is **Nederlands**.

## Zo komt een wijziging online (automatisch)

1. Je werkt op je eigen sessie-branch (`claude/...` of `ccr-...`) en pusht daarheen.
2. De GitHub-actie `.github/workflows/deploy.yml` doet dan vanzelf:
   - `npm test`
   - **cherry-pick** van de nieuwe commits naar `main` (`scripts/promote.sh`)
   - **deploy** van `main` naar Cloudflare (`scripts/deploy.sh`): database-migraties, Pages-project, publicatie.
3. Na ±2 minuten staat het op https://rijken-van-de-vallei.pages.dev

Daarom:

- **Begin elke sessie met** `git fetch origin main && git merge --no-edit origin/main`,
  zodat je verder bouwt op wat andere sessies al online zetten.
- Voer **altijd `npm test` uit vóór je pusht**. Push geen half werk: alles wat op je branch staat, gaat live.
- Maak kleine, duidelijke commits (één onderwerp per commit). De cherry-pick neemt ze één voor één over.
- Faalt de stap "Overnemen op main" door een conflict? Merge `origin/main` in je branch, los het conflict op, test, push opnieuw.
- Wijzigingen aan `.github/workflows/` kunnen enkel automatisch naar main als het geheim `GH_PUSH_TOKEN` bestaat.
  Vermijd die wijzigingen tenzij de gebruiker erom vraagt.

## Database

- Schema = de bestanden in `migrations/`. **Wijzig nooit een bestaande migratie**; maak een nieuw bestand
  `migrations/000N_omschrijving.sql`. De deploy voert nieuwe migraties automatisch uit.
- Lokaal: `npm run db:init:local` past de migraties toe op de lokale database.
- Een stad is één rij (`towns.state` = JSON, zie `public/shared/sim.js`). Hou dat zo: dat spaart D1-limieten.

## Gratis limieten (belangrijk bij nieuwe functies)

- Workers: 100k verzoeken/dag, ~10 ms CPU per verzoek, **max. 50 D1-query's per verzoek** (de teller zit in `functions/lib/http.js`).
- D1: 5M gelezen rijen/dag, 100k geschreven rijen/dag. Schrijf enkel bij acties, gebruik indexen, geen tabelscans per peiling.
- Geen achtergrondtaken: alles wordt "lui" berekend wanneer iemand de site opent (`advance()` in `sim.js`, `processDue()` in `functions/lib/game.js`).
- De browser peilt elke 20 s; verhoog dat niet zonder reden.

## Waar staat wat

- `public/shared/rules.js` — **alle** spelregels en balans (kosten, tijden, troepen, kampen). Gedeeld door server en browser.
- `public/shared/sim.js` — simulatie van één stad + acties (bouwen, trainen, vondsten oogsten, …). Vondsten verschijnen
  deterministisch in `advance()` (zelfde uitkomst in browser en server). `battle.js` — gevechten. `worldgen.js` — kaart uit seed.
- `public/shared/territory.js` — het eigen gebied rond een stad (bomen, meren, bronnen, everzwijnen, barbarenkamp), puur uit
  de seed (= stad-id) en dus nooit opgeslagen. In `towns.state.terr` staat enkel wat veranderde: verkende tegels (bitset `ex`),
  gekapte tegels (`cl`), voorraad van bronnen, kamp en logboek. Groepen in het veld (`state.field`) bewegen in echte tijd:
  hun positie volgt uit begin/eind en tijd (`groupPos`), aankomsten verwerkt `advance()`. Roep altijd `ensureTerritory()`
  aan vóór `advance()` op de server.
- Volkeren: `CIVS` en de elite-eenheden staan in `rules.js` (eigenschappen zoals `bonus`, `tough`, `defMult`, `walls`, `fear`
  worden in `battle.js` verrekend). Het volk zit in `towns.state.civ`; oude steden krijgen er een in `ensureTerritory()`.
  Bouwstijl per volk: `STYLES` en de kastelen (`TC_CIV`) in `art.js`; elite-figuren in `figures.js` (`uniqueUnit`).
- `public/js/dom.js` — `setHTML()` werkt panelen bij zonder ze te vervangen. Gebruik dit (geen `innerHTML`) voor alles
  wat periodiek ververst, anders flitst het en gaan klikken verloren.
- `functions/lib/routes.js` — alle API-routes; `game.js` — legers, gevechten, rapporten; `auth.js` — sessies.
- `public/js/art.js` — procedurele tekeningen (gebouwen, mensen, bomen; geen afbeeldingsbestanden).
- `public/js/town.js` / `world.js` — de twee canvas-weergaven; `fx.js` — dag/nacht, licht, deeltjes, wolken, vogels.
- `public/js/ui.js` — HTML-sjablonen; `icons.js` — SVG-iconen (gebruik deze, geen emoji); `main.js` — spelverloop in de browser.

## Ontwerpregels

- Het spel moet werken op **pc (hoofdgebruik, browser) én gsm**. Test beide: 1440×900 en 390×844.
- Grafisch: warme middeleeuwse stijl (perkament, hout, goud). Nieuwe gebouwen/eenheden tekenen in `art.js` in dezelfde stijl.
- De server controleert elke actie opnieuw; vertrouw nooit invoer uit de browser.

## Lokaal testen

```bash
npm install
cp .dev.vars.example .dev.vars   # ADMIN_KEY=verander-mij
npm run db:init:local
npm run dev                      # http://localhost:8788  (beheer: /admin.html)
npm test
```

Maak via `/admin.html` een testwereld met bv. snelheid 100 en 0,05 dagen vrede.
Playwright en Chromium zijn in cloudsessies voorgeïnstalleerd: maak screenshots om grafische wijzigingen te controleren.
