# Rijken van de Vallei — instructies voor Claude

Browser-strategiespel (isometrisch, "bouw je rijk") voor een kleine vriendengroep.
**Lees ook `context.md`**: spelregels, voorkeuren van de gebruiker, wat al gebouwd is en hoe je test. Werk het bij na grote wijzigingen.
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
  aan vóór `advance()` op de server. Een deel van een groep apart sturen gaat met `doFieldSplit` (ook midden in een gevecht).
  Bevelen (`/field`) komen als lijst `ops` met het tijdstip van de tik (`at`); de server rekent de stad tot exact dat tijdstip
  verder (niet tot 'nu') en voert ze daar uit, net als de browser. Zo verspringt er niets. Een heel leger = één verzoek, met
  een gezamenlijk tempo (`pace`) zodat iedereen samen aankomt.
  Selecteren in de stad (`town.js`): 1 klik = 1 troep (`unit`), dubbelklik = alle van die soort (`kind`), ingedrukt houden
  = het hele leger (`army`, via `Camera.onLongPress` in `iso.js`).
- Muren en poorten: `s.walls` en `s.gates` (tegelnummers). `wallSet()` = muren + poorten (een dichte poort sluit de stad).
  `insideSet()` = de binnenkant van een volledig ommuurde stad. Een poort is **2 tegels breed** (twee aangrenzende tegels in
  `s.gates`; `gateList()` groepeert ze, `gateSpan()` kiest bij een tik de 2 tegels) en staat in een recht stuk muur.
  Oude poorten van 1 tegel worden in `ensureTerritory()` gratis verbreed; afbreken gaat altijd per hele poort.
  Een stad helemaal dichtmaken zonder poort mag niet; oude dichte steden krijgen in `ensureTerritory()` een poort.
  Groepen en dorpelingen lopen via `gateRoute()` door de poort (tussenstops in `g.via`, `fieldArrive` loopt verder).
  Gebouwen afbreken: `doDemolish` (deel van de kosten terug, zie `DEMOLISH` in `rules.js`).
- Gevechten in het eigen gebied: `public/shared/skirmish.js` speelt ze mannetje per mannetje af (hp, dmg, rate per eenheid
  in `rules.js`), deterministisch. Lopende gevechten staan in `state.terr.fights`; `advance()` verwerkt hinderlagen
  (binnen `FIELD.aggro` van het barbarenkamp) en het einde van een gevecht. De browser tekent het verloop met `runFight(f, nu)`.
- Veldslagen op de wereldkaart = **belegeringen in de echte stad** van de verdediger: komt een aanval aan terwijl aanvaller of
  verdediger online is, dan maakt `resolveMarch()` een rij in de tabel `battles` (status `choose`, het leger krijgt status `battle`).
  Elk kiest `manual` of `auto` (`/battle/mode`). Kiest niemand zelf: automatisch via `resolveBattle` (`battle.js`). Anders een live
  slag uit `public/shared/fieldbattle.js`: het slagveld is een raster rond de stad (gebouwen, bos = trager, water, muren, poorten,
  torens; `grid`, `ins` = binnen de muren), met A*-routes (`findPath`), een opstelling (`phase: 'deploy'`, zone per kant via
  `inZone`, knop Start = `{ready}`), daarna de slag (vaste tikken van 100 ms, deterministisch, geen Math.random/hypot).
  De aanvaller komt uit de richting van zijn stad (`dir`); de verdediger kan door zijn poorten en zijn voetvolk/schutters op de muur
  (`p1 === 3`). Wie niet zelf bestuurt, wordt door `aiDefend`/`aiAttack` geleid (schutters op de muur aan de kant van de aanval,
  voetvolk achter de bedreigde poort; rammen op de poort). Winnen: alle verdedigers weg, of het plein (`plaza`) `FB.capMs` houden.
  Bevelen gaan via `/battle/order` met de tik `at` in een wachtrij (`queueOrder`, `st.q`); de server rekent `FB.delay` achter op de
  klok zodat ze op dezelfde tik uitgevoerd worden als in de browser. De browser (`battleview.js` + `siegeview.js`, een `TownView`
  met `battleMode`) peilt `/battle?id=` elke `FB.pollMs` (0,6 s), rekent zelf verder en laat verschillen bijglijden (max. 2,5 tegels/s).
  Een bevel gaat `FB.lead` tikken na de tik in, zodat de tegenstander het meestal al kent. Aanraakscherm: met troepen gekozen is
  een tik altijd een bevel (andere troep kiezen = kaartje of dubbeltik); muis: links klikken kiest, rechts klikken = bevel. De server rekent per verzoek
  hooguit `FB.maxTicksPerCall` tikken. Een slag waar niemand meer naar kijkt (`FB.staleMs`) rondt `processBattles()` automatisch af.
  Het einde (`finishBattle`) gebruikt de gewone `attackTown`/`attackCamp` met een `override` (zelfde buit, rapporten en punten).
  **Oefenslag** (`/battle/practice`, `startPractice`, `target_kind = 'practice'`): meteen 30 tegen 30 tegen de computer, in een
  ommuurd oefendorp of in je eigen stad; `finishBattle` toont enkel de uitslag (geen verliezen, buit of rapport).
- Meldingen op je gsm (Web Push, `functions/lib/push.js`, zonder bibliotheek): VAPID-sleutels worden de eerste keer gemaakt en
  in de tabel `config` bewaard; inschrijvingen in `push_subs` (enkel echte meldingsdiensten, `validPushEndpoint`).
  `notifyDue()` stuurt ±2 min voor een aanval aankomt een melding met geluid (aanvaller + verdediger) en ±1 min vooraf een stille
  bijwerking van dezelfde melding (`marches.notified` 0 → 1 → 2). `{left}`/`{clock}` in de tekst vult `sw.js` in met de klok van de gsm. Het draait
  elke minuut in de cron-worker `cron/` (eigen `wrangler.toml`, gezet door `deploy.sh`; vraagt 'Workers Scripts: Edit' op het
  token) en als vangnet na gewone verzoeken (`waitUntil`). `public/sw.js` toont de melding. Tijdens de laatste 2 minuten
  toont het spel een aftelbalk waar je vooraf kiest (`/march/mode` → `marches.pref_mode`); `maybeOfferBattle` gebruikt die keuze.
- Volkeren: `CIVS` en de elite-eenheden staan in `rules.js` (eigenschappen zoals `bonus`, `tough`, `defMult`, `walls`, `fear`
  worden in `battle.js` verrekend). Het volk zit in `towns.state.civ`; oude steden krijgen er een in `ensureTerritory()`.
  Bouwstijl per volk: `STYLES` en de kastelen (`TC_CIV`) in `art.js`; elite-figuren in `figures.js` (`uniqueUnit`).
- `public/js/dom.js` — `setHTML()` werkt panelen bij zonder ze te vervangen. Gebruik dit (geen `innerHTML`) voor alles
  wat periodiek ververst, anders flitst het en gaan klikken verloren.
- `functions/lib/routes.js` — alle API-routes; `game.js` — legers, gevechten, rapporten; `auth.js` — sessies.
- `public/js/art.js` — procedurele tekeningen (gebouwen, mensen, bomen; geen afbeeldingsbestanden).
- **3D-look** (zoals vooraf gerenderde sprites in klassieke RTS-spellen): `render3d.js` is een kleine straalvolger
  (vormen: convexe veelvlakken, cilinders, kegels, ellipsoïden, capsules; procedurele materialen; zon, slagschaduw,
  omgevingsschaduw). `models3d.js` = gebouwen (per volk een stijl), muurstukken en poorttorens; `figmodels.js` = mensen en
  ruiters (8 beelden per loop-/werkcyclus). `sprite3d.js` laat ze renderen in Web Workers (`render-worker.js`), bewaart ze
  in Cache Storage (verhoog `VERSION` als modellen veranderen) en geeft `null` tot ze klaar zijn: dan tekent het spel de
  oude versie uit `art.js`/`figures.js`. De akker, dieren, kameel/strijdwagen/olifant en rammen zijn nog getekend.
- `public/js/town.js` / `world.js` — de twee canvas-weergaven; `fx.js` — dag/nacht, licht, deeltjes, wolken, vogels.
  `worldmap.js` bakt de wereldkaart (hoogteveld uit `worldgen.fieldAt`, kolom per kolom getekend, bossen, akkers, wegen).
  Teken nooit `A.box` met textuur per beeld (duur): cache als afbeelding zoals `drawWallPiece`/`gatePart`.
- `public/js/ui.js` — HTML-sjablonen; `icons.js` — SVG-iconen (gebruik deze, geen emoji); `main.js` — spelverloop in de browser.

## Android-app

- `android/` is een 'Trusted Web Activity': de app opent https://rijken-van-de-vallei.pages.dev volledig scherm in Chrome
  (valt terug op een WebView als Chrome ontbreekt). Spelupdates komen dus vanzelf; de APK opnieuw bouwen hoeft enkel
  bij een nieuwe naam, icoon of instelling.
- Bouwen: `android/build-apk.sh` (JDK 17+, Gradle, Android SDK met platform 35 + build-tools 35 in `ANDROID_HOME`).
  Het zet de APK in `public/rijken-van-de-vallei.apk` (downloadlink in de hulp en op het aanmeldscherm).
- De sleutel `android/keystore/rijken.jks` staat niet in git. Een nieuwe sleutel = de oude app eerst verwijderen en
  de nieuwe SHA-256-vingerafdruk (die het script toont) toevoegen in `public/.well-known/assetlinks.json`;
  zonder geldige vingerafdruk toont de app een adresbalk. Verhoog `versionCode` in `android/app/build.gradle` bij een update.

## Ontwerpregels

- Het spel moet werken op **pc (hoofdgebruik, browser) én gsm**, rechtop én liggend. Test 1440×900, 390×844 en 915×412.
  Liggend (`@media (orientation: landscape) and (max-height: 540px)` in `style.css`): menu als kolom links, dunne balk
  bovenaan, detailpaneel schuift van rechts in. Het bouwmenu (`#buildwrap`) kan overal ingeklapt worden (`app.bbMin`).
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

Maak via `/admin.html` een testwereld met bv. snelheid 100 en 0,1 uur vrede per speler.
Playwright en Chromium zijn in cloudsessies voorgeïnstalleerd: maak screenshots om grafische wijzigingen te controleren.
