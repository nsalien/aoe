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
- **Nieuwsartikel bij elke volwaardige update** (nieuwe functie, nieuwe regels of balans, zichtbare grafische vernieuwing; niet
  voor een kleine bugfix): zet bovenaan `UPDATES` in `public/js/updates.js` een artikel voor de spelers (id +1, datum en uur,
  tag, icoon, titel, korte intro, blokken met tussenkoppen). Schrijf in gewone taal: wat is nieuw, waar vind je het, wat betekent
  het voor jou. Geen code of bestandsnamen. Spelers zien het via de knop **Nieuws** (rood getal + één melding) en op `/updates`.
  Een eigen commit ("Nieuws: …"), samen met de update gepusht.
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
- Alles wordt "lui" berekend (`advance()` in `sim.js`, `processDue()` in `functions/lib/game.js`). De **cron-worker** (elke minuut,
  `cronTick` in `functions/lib/crontick.js`) doet het zware werk: aangekomen legers (hooguit 3 per minuut), vazallen, meldingen
  en de bots. Hij zet `world.cron_at`; zolang dat recent is (`CRON_STALE`), verwerkt een gewoon verzoek enkel nog hooguit 2 legers
  van of naar die speler (`processDue(..., { max, mine, light })`) en geen bots of meldingen. Zonder cron: alles zoals vroeger.
- **Rekentijd meten** (zie `context.md` › Testen): een realistische wereld met `node:sqlite` + `handle()`, CPU zonder SQLite-tijd,
  ook in een vers proces (= koude isolate). Gemeten zware delen: `territory()` (het gebied rond een stad; nu met een snelle
  vooraf-test in plaats van overal `Math.hypot`, exact dezelfde uitkomst) en `advance()` van veel steden: overzichten van alle
  steden (`/map`, `/leaderboard`) gebruiken `settleBuilds` in plaats van `advance`. Elke D1-vraag is een rondreis: voeg vragen
  samen waar het kan (zoals in `/state`).
- De browser peilt elke 20 s; verhoog dat niet zonder reden.

## Waar staat wat

- `public/shared/rules.js` — **alle** spelregels en balans (kosten, tijden, troepen, kampen). Gedeeld door server en browser.
  **5 tijdperken** (`AGES`, `MAX_AGE`): niveau N van een gebouw vraagt tijdperk N (`levelAge`, of `levelAges` per gebouw).
  Nieuwe gebouwen: molen en gildehuis (`boost` = productiebonus), bouwloods (`builders`, `buildSpeed` → `maxBuilds`/`buildTime`
  in `sim.js`; gebruik altijd `buildTime(s, ...)`, niet `levelTime`, voor bouwen), Academie (`research`), Adelshof (edelman),
  kathedraal (`loyalty`, `score`). **Onderzoek**: `TECHS` (4 soorten × 3 rijen, `techAt`, `techTier`), in de stad `s.tech` en
  `s.research` (`doResearch`/`checkResearch`, klaar in `advance()`); in de automatische slag via `auto` → `techMods` (`battle.js`:
  `attTech`/`defTech`), in de live slag via `st.tk` en `TK()` (`fieldbattle.js`; schildmuur, vuurpijlen, taxusboog, pijlenregen,
  hoefijzers `reg.sp`, lansen, flankrit, krijgsdrill `moLoss`, strijdkreet, kokende pek `pourPitch` → `g.pt`, torenkruisbogen,
  ijzerbeslag). Hoefijzers versnellen ook marsen (`slowestSpeed(units, tech)`).
- **Groottes van gebouwen** (`size` in `BUILDINGS`): kazerne, schietbaan, stal, markt, belegwerkplaats, Academie, gildehuis,
  bouwloods en stadscentrum 2x2, monument 4x4. Ze groeiden in nov. 2026 (`SIZE_V`, `GREW` in `rules.js`): `growBuildings`
  (in `ensureTerritory`) geeft een oud gebouw dat niet meer past `b.rp` (opnieuw plaatsen) en de stad `s.szm`. Zo'n gebouw werkt
  gewoon, maar staat niet op de kaart: gebruik `isPlaced(b)` (sim.js) waar het over de kaart gaat (bezette tegels, tekenen,
  slagveld, replay, aankleding); `toPlace(s)` = de lijst. Plaatsen = `/move` (gratis, `doMove` wist `rp`); verbeteren pas daarna.
  Bots plaatsen zelf (`placeNear`). Browser: venster `grewHtml`, knop `#rpPill`, `placeNext` in `main.js`.
  3D: `BIG` in `models3d.js` = het gebouw via `xf` (schaal en verschuiving) op een erf (`barracksYard`, …, `monumentYard`).
  De 2D-tekeningen zijn voor de oude grootte (`artSize` in `art.js`): `bScale` in `town.js` schaalt ze op.
- **Karavanen** (`/march` met `kind: 'trade'`, enkel naar bondgenoten/heer/vazal, max. `MARKET.shipPerLevel` × marktniveau):
  naar eenzelfde **speler** hooguit één per `MARKET.tradeGapMs` (8 uur echte tijd). Bijgehouden in de stad van de verzender:
  `s.tradeAt = { spelerId: vertrektijd }` (`tradeWait`/`noteTrade` in `sim.js`; `noteTrade` ruimt verlopen tijdstippen op), want
  een rij in `marches` verdwijnt bij aankomst. Bots volgen dezelfde regel (stap 3 in `military`); schatting (`tribute`) telt niet.
  Browser: `sendHtml` toont de wachttijd (en geen invulvelden), `tradeNoteHtml` op de wereldkaart, `fillAllyList` in de markt.
- **Havenhuis en vissers** (`harbor` in `BUILDINGS`, `FISH`/`JOBS` in `rules.js`): vanaf tijdperk 2, `shore: true` = enkel op
  vrij land naast water (`shoreTile`: geen bos, niet gereserveerd, tot `FISH.reach` ringen voorbij je bouwgrond; `canPlaceAt`
  gebruikt dat i.p.v. `isBuildable`; `shoreSpots` = alle plekken, `shoreSide` = waar het water ligt = variant van het 3D-model).
  Vissen is een **vijfde taak** van dorpelingen (`s.villagers.fish`; gebruik `JOBS` i.p.v. `RES` waar het over taken gaat):
  plaatsen = `boatsReady(s) * FISH.crew`, opbrengst voedsel in `rates()` (`FISH.rate` per visser, x `fishMult` per niveau).
  Bootjes: `s.boats`, één tegelijk bouwen (`s.boatJob`, `doBoat`/`checkBoat`, route `/boat`, klaar in `advance()` →
  `finishBoat`: vrije dorpelingen gaan aan boord), hooguit `FISH.boats[niveau]` (max. 4). Afbreken = bootjes weg.
  Tekenen: `harbor` in `models3d.js` (steiger naar het water, per niveau: hut → pannen → kraan/lantaarn → visafslag →
  vuurtoren), bootje `boat` in `propmodels.js` (v = soort * 2 + bemand), `boatsNow`/`drawBoat` in `town.js` (bemande bootjes
  varen vaste rondes over het water van het havenhuis: `harborWater`, de rest ligt aan de steiger), `drawShoreSpots` tijdens
  het plaatsen, `showShore` kijkt naar de dichtste plek. Paneel `harborHtml`, rij 'Vissers' bij de dorpelingen. Geen mist in een
  vierkant van `FISH.sight` (3) tegels rond het havenhuis (`homeSight`, dus ook `exploredNow` en `updateFog`). Bots bouwen
  (nog) geen havenhuis; `doAssign` zonder `fish` laat de vissers staan.
- **Edelmannen en vazallen** (`functions/lib/vassal.js`, tabel `vassals`, migratie `0007`): trouw `s.loy` (ontbreekt = 100,
  herstelt in `accrue`, niet als vazal), `LOYALTY`/`VASSAL` in `rules.js`. `attackTown` roept `applyNobles` op (−25 per
  levende edelman, `nobleBlock`: al vazal, beschermd `s.loyShield`, < 45% van je punten, max. 2 vazallen); bij 0 `s.vas` +
  rij in `vassals`. `processVassals` (in `processDue`, ≤ 2 per verzoek) stuurt schatting (`kind = 'tribute'`) en zet vazallen
  na 3 dagen vrij; `liberateByAttack` na een gewonnen aanval op de heer door zijn clan; `/vassal/ransom`. Heer en vazal
  vallen elkaar niet aan maar mogen elkaar helpen (`relation` in `/march`). Ranglijst: `vassalShare` (20% van de punten).
- `public/shared/sim.js` — simulatie van één stad + acties (bouwen, trainen, vondsten oogsten, …). Vondsten verschijnen
  deterministisch in `advance()` (zelfde uitkomst in browser en server). `battle.js` — gevechten. `worldgen.js` — kaart uit seed.
- `public/shared/territory.js` — het eigen gebied rond een stad (bomen, meren, bronnen, everzwijnen, barbarenkamp), puur uit
  de seed (= stad-id) en dus nooit opgeslagen. In `towns.state.terr` staat enkel wat veranderde: verkende tegels (bitset `ex`),
  gekapte tegels (`cl`), voorraad van bronnen, kamp en logboek. Groepen in het veld (`state.field`) bewegen in echte tijd:
  hun positie volgt uit begin/eind en tijd (`groupPos`), aankomsten verwerkt `advance()`. Roep altijd `ensureTerritory()`
  aan vóór `advance()` op de server. Een deel van een groep apart sturen gaat met `doFieldSplit` (ook midden in een gevecht).
  Wat je altijd ziet (geen mist): `homeSight(s)` = bouwgrond (vierkant, loten, gekapt), muren en binnenkant + `FIELD.homeSight`
  tegels; `exploredNow` (server en browser) en `updateFog` in `town.js` gebruiken die.
  Bevelen (`/field`) komen als lijst `ops` met het tijdstip van de tik (`at`); de server rekent de stad tot exact dat tijdstip
  verder (niet tot 'nu') en voert ze daar uit, net als de browser. Zo verspringt er niets. Een heel leger = één verzoek, met
  een gezamenlijk tempo (`pace`) zodat iedereen samen aankomt.
  Selecteren in de stad (`town.js`): 1 klik = 1 troep (`unit`), dubbelklik = alle van die soort (`kind`), ingedrukt houden
  = het hele leger (`army`, via `Camera.onLongPress` in `iso.js`).
  Gebouwen kiezen gaat op de pixels van het getekende beeld (`buildingsAt` → `hitsBuilding`; slagschaduw telt niet), het
  voorste eerst. Staat het gekozen (of net gekozen: `lastPick`, 8 s) gebouw op de getikte plek, dan kiest een nieuwe tik het
  gebouw erachter. Het paneel toont dan 'Ook op deze plek' (`pickStack` → `alsoHereHtml`, actie `pickBuilding`; nodig op een
  gsm, waar het paneel de kaart bedekt). Een gekozen gebouw achter een ander gebouw tekent `drawSelXray` doorschijnend bovenop.
- Muren en poorten: `s.walls` en `s.gates` (tegelnummers). `wallSet()` = muren + poorten (een dichte poort sluit de stad).
  `insideSet()` = de binnenkant van een volledig ommuurde stad. Een poort is **2 tegels breed** (twee aangrenzende tegels in
  `s.gates`; `gateList()` groepeert ze, `gateSpan()` kiest bij een tik de 2 tegels) en staat in een recht stuk muur.
  Oude poorten van 1 tegel worden in `ensureTerritory()` gratis verbreed; afbreken gaat altijd per hele poort.
  **Uitzicht**: een 3D-poortgebouw (`gateScene` in `models3d.js`, `S3.getGate(level, ax, st)`): per muurniveau beter (1 houten
  torens + loopbrug, 2 stenen voet + dakjes + fakkels, 3 stenen torens + gemetselde boog + valhek, 4 borstwering + vaandels +
  wapenschild, 5 spitsen + goud), een beeld per stand van de deuren (`GATE_STATES`; `drawGate` kiest de stand uit
  `gateOpenness`, valt terug op de dichtstbijzijnde klare stand en anders op de oude getekende poort). Vlag in teamkleur via
  het anker `flag`; 's nachts gloed bij de fakkels (`drawNightLights`).
  Een stad helemaal dichtmaken zonder poort mag niet; oude dichte steden krijgen in `ensureTerritory()` een poort.
  Routes: `routeTo(s, from, to)` (A* over de tegels: water en muren blokkeren, poorten zijn doorgang; daarna enkel de bochten
  als tussenstops in `g.via`, `fieldArrive` loopt verder). Gebruikt door groepen (`travel`) én de dorpelingen in de stad.
  Gebouwen afbreken: `doDemolish` (deel van de kosten terug, zie `DEMOLISH` in `rules.js`).
  **Troepen en dorpelingen ontslaan** (plaats in de bevolking vrij, bv. voor een ram): `checkDismiss`/`doDismiss`/`dismissRefund`
  in `sim.js` (`units` = soldaten thuis in `s.units`; `vill` = dorpelingen per taak, `VILL_JOBS` = 'idle' + `JOBS`; je houdt er
  altijd `DISMISS.minVillagers` over; `DISMISS.refund` van de kosten terug), route `/dismiss` (`units`, `villagers`; geweigerd
  zolang er een slag in je stad loopt of wacht op een keuze). Browser: venster `dismissHtml` (`openModal('dismiss', { need, first })`;
  `need` = wat je wilde trainen: rekent uit of er genoeg plaats vrijkomt; toont ook hoeveel je dorp per uur minder opbrengt),
  knoppen bij Leger thuis, bij Dorpelingen (`villDismissable`), bij een eenheid die niet past (`popFull` in `trainHtml`) en een
  kaartje Ontslaan in het tabblad Mijn leger.
  Gebouwen verplaatsen (gratis): `checkMove`/`doMove` (`canPlaceAt(..., ignoreId)`; stadscentrum en muren niet), route `/move`.
  In de stad: knop **Verplaatsen** bovenaan in het gebouwpaneel (`startMove(b)`; níet met lang indrukken, dat kiest het leger).
  Tikken/klikken zet het doorschijnende gebouw op die plek (`updateMove`), het gebouw zelf verslepen met een vinger kan ook
  (`cam.onGrab` → `grabMove`, daarna `cam.onHoldDrag` → `holdDrag`; de kaart schuift mee aan de rand). Met een muis zet een klik
  het meteen neer; op een aanraakscherm bevestig je met 'Zet hier' in de balk (`renderMoveHint`, `dropMove` → `onMove`).
  `main.js` (`moveBuilding`) voert de verplaatsing meteen uit en zet ze terug als de server weigert.
  Muren en poorten verplaatsen gaat op dezelfde manier: in het muurpaneel (tik op een muurstuk) 'Dit muurstuk', 'Rechte muur'
  (`wallRun`: het rechte stuk door die tegel, met de poorten erin) of 'Poort verplaatsen'. Regels in `planWallMove`/`doMoveWalls`
  (route `/walls/move`, tegels + verschuiving dx, dy): enkel op vrije bouwgrond, poorten in hun geheel en daarna nog in een
  recht stuk muur (`gateFits`); een poort alleen verplaatsen maakt van de oude opening muur; nooit dicht zonder poort.
  In de stad: `startWallMove` (zelfde `moveB`, met `kind: 'walls'`), `drawWallGhost`, `main.js` `moveWalls`.
- **Barbarenkamp en overvallen** (`WILD.camp`/`WILD.raid` in `rules.js`, `sim.js`): het kamp groeit per speldag sinds het
  (her)opbouwen (`camp.since`, `camp.day` = speldag in ms, `campGrowth` tot `growMax`; `campSize`/`raidSize` × de groei;
  verwoesten = buit × groei en opnieuw klein). `scheduleRaid` zoekt na `quietHours` om de `checkHours` met `wildRand`
  (deterministisch) een controle waar de kans `raidChance` (groeit mee) raak is → `camp.next`. Daar begint de overval
  (`raidStart`: `camp.raid = { start, at, n }`, `at` = +15 min echte tijd, logboek 'raid-warn'); op `raid.at` vechten ze
  automatisch (`raidAuto` → `applyRaid`), tenzij de speler zelf verdedigt: `/raid/defend` → `startRaid` (game.js) maakt een
  live slag (`battles.target_kind = 'raid'`, `att_player = 0`, barbaren via `aiAttack`) en zet `raid.battle`/`bt`/`init`;
  `finishRaid` verwerkt de uitslag met `applyRaid` (vangnet: na `WILD.raid.liveMs` toch automatisch). Melding:
  `towns.raid_at` (migratie `0010`, `raidNotice` in `saveTown`); `notifyRaids` (push.js) rekent de stad door, meldt het begin
  (soort 'attack', `raid.told`) en zet de volgende `raid_at`; hooguit één stad per beurt en enkel als er die beurt niets
  anders verstuurd werd; spelers die een week weg zijn niet. Browser: `raidIncoming`/`offerRaid`/`defendRaid` in `main.js`,
  `raidAskHtml` in `ui.js` (in `#battleAsk` met `data-id="raid"`), rode balk (actie `raidAsk`), `raidParty` in `town.js`
  (verzamelen bij het kamp, de laatste 90 s optrekken), uitslag in `battleview.js` (`kind === 'raid'`, geen rapport).
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
  voetvolk achter de bedreigde poort; rammen op de poort). Winnen: alle verdedigers weg of op de vlucht, of het plein (`plaza`) `FB.capMs` houden.
  **Regimenten zoals Rome: Total War** (`st.regs`, soldaat → `u.sq` = regiment-id, `regOf`): per soort hooguit `FB.squad` figuren.
  Een regiment heeft een formatie (`FORMS`: linie, blok, wig, los, kring; `slotOffsets` enkel met + en ×, geen goniometrie), een richting
  (`fx, fy`) en een vaandel (`x, y`) dat één route volgt (`regMove`, `advanceAnchor`, wacht op wie achterop raakt); elke soldaat loopt
  naar zijn plaats rond het vaandel (`oa, ob`) en staat daarna op zijn thuisplek (`hx, hy`, altijd aan dezelfde kant van de muur: `sideAt`).
  Toestanden: `hold`, `move`, `attack`/`charge` (`eng` = in gevecht), `wall`, `rout`. Groepen stellen zich op in slagorde (`groupPlan`),
  een getrokken lijn geeft richting en breedte (`fx, fy, w` → `fitWidth`). Schade: formatie, flank/rug en stormloop (`u.mv`) in `damage()`.
  Moed (`r.mo`): verliezen en flankaanvallen kosten moed, onder `FB.rout` vlucht het regiment naar `rallyPoint` en hergroepeert het na rust.
  Bevelen gelden voor het hele regiment van de meegestuurde soldaten; vluchtende regimenten luisteren niet.
  Bevelen gaan via `/battle/order` met de tik `at` in een wachtrij (`queueOrder`, `st.q`); de server rekent `FB.delay` achter op de
  klok zodat ze op dezelfde tik uitgevoerd worden als in de browser. De browser (`battleview.js` + `siegeview.js`, een `TownView`
  met `battleMode`) peilt `/battle?id=&have=t0` elke `FB.pollMs` (0,6 s; met `have` laat de server de vaste delen `grid`/`ins`/`meta`
  weg), rekent zelf verder en laat verschillen bijglijden (max. 2,5 tegels/s). Kiezen gebeurt per regiment (kaartje, vaandel of soldaat),
  rechts slepen (of de knop Lijn op een gsm) trekt een lijn (`cam.onRightDrag` / `cam.lineMode` in `iso.js`). Verhoog `FB.v` als de
  toestand van een slag verandert: lopende slagen van een oudere versie worden dan automatisch afgerond.
  Een bevel gaat `FB.lead` tikken na de tik in, zodat de tegenstander het meestal al kent. Aanraakscherm: met troepen gekozen is
  een tik altijd een bevel (andere troep kiezen = kaartje of dubbeltik); muis: links klikken kiest, rechts klikken = bevel. De server rekent per verzoek
  hooguit `FB.maxTicksPerCall` tikken. Een slag waar niemand meer naar kijkt (`FB.staleMs`) rondt `processBattles()` automatisch af.
  Het einde (`finishBattle`) gebruikt de gewone `attackTown`/`attackCamp` met een `override` (zelfde buit, rapporten en punten).
  **Oefenslag** (`/battle/practice`, `startPractice`, `target_kind = 'practice'`): meteen 30 tegen 30 tegen de computer, in een
  ommuurd oefendorp of in je eigen stad; `finishBattle` toont enkel de uitslag (geen verliezen, buit of rapport).
- **Replay van een automatische slag** (24 uur, `REPLAY.ms` in `rules.js`): `attackTown`/`attackCamp` zonder `override` (dus
  automatisch uitgerekend) bewaren met `saveReplay` een klein recept in de tabel `replays` (migratie `0011`; `who` = wie het mag
  zien: aanvaller, verdediger, versterkers; enkel als er een echte speler bij is) en zetten `replay` (id) in het rapport en in
  `battles.result`. Recept = wat `createBattle` nodig heeft (legers, `defGroups`, smidse, onderzoek, `dir`, stadsbeeld `view`,
  namen/kleuren) + de vaste uitslag `fate` (`fateOf` in `battle.js`: winnaar en overlevenden per pool, sleutels zoals
  `battleOutcome`) + `res` (verliezen en buit uit het rapport). `GET /replay?id=` (`loadReplay`, 404 voor anderen, 410 na 24 u).
  De browser speelt de slag na: `replayBattle(rec)` (fieldbattle.js) = `createBattle` met beide kanten AI + `setFate`.
  **Bijsturing** (`st.fate`, `FATE`): per pool (`kant|groep|soort`, `u.pk`) ligt vast hoeveel soldaten sneuvelen (`q`, `d` = al
  gesneuveld, geteld als `aliveN`: gewonden leven, dus wat je ziet = het rapport, **voor beide kanten exact**). `fateCap`: een klap
  die er meer zou doden, verwondt enkel (ook pek, vallen van de muur, achtervolging). `fateRoom`: de verliezer blijft overeind
  zolang de winnaar zijn verliezen nog niet heeft (hooguit 35% voor, nooit de laatste; rammen tellen niet). Zolang de winnaar nog
  moet bloeden (`f.ow`): de verliezer slaat/schiet niet op wie niet meer kan sneuvelen (`fateSkip` in `pickEnemy`, `pickFoe`,
  `shoot`, `nearestFoeReg`, `regFight`, torens), slaat sneller een bres, valt na `push` zelf aan en vlucht niet; geen vooruitgang
  na `stall` → de regimenten van de winnaar die nog moeten bloeden, trekken naar de dichtste vijand (ook torens); na `stuck`
  elke seconde één gerichte klap/pijl van de dichtste vijand (`fateStrike`); `end` = laatste vangnet (`fateSettle`). Schade
  bijgestuurd: `f.m` per kant (verliezen van de winnaar in het tempo van de verliezer, en binnen `pace`), `f.r` per soort van de
  winnaar, de winnaar sterker na `ramp`. Het stadscentrum schiet mee voor de verdediger (toren met `tc: 1`, onverwoestbaar, geen
  doelwit: de bezetting/dorpelingen uit `townBaseDef`). Enkel de echte winnaar kan winnen en pas als beide kanten klaar zijn
  (`judgeFate`). Gemeten op 350 willekeurige slagen (stad, kamp, overval, versterking, grote legers): 0 fouten, geen eindvangnet,
  in ±3% een paar gerichte klappen; duur mediaan ±45 s, 90% < 1:45, max ±3:30.
  Het eindscherm toont de cijfers van het rapport. Overvallen van de barbaren die automatisch verliepen (`raidAuto` in
  `sim.js`) zetten het recept `rp` in het logboek van de stad; `raidReplay(s, e, me)` maakt er een replay van (stad zoals ze nu is).
  Browser: `BattleView.showReplay(rec)` (eigen klok `rp.t`, `clock()`, pauze/spatiebalk, 1×–8×, Einde, Opnieuw; geen peilingen,
  tikken doen niets), knoppen in het rapport (`replayBtnHtml` in `ui.js`), in het logboek (`raidReplay`-actie) en op het uitslagkaartje.
  Een echte aanval die binnenkomt verschijnt boven een replay (`inLiveBattle()` in `main.js`).
- **Computerspelers (bots)**: gewone spelers met `players.bot = 1` en een eigen stad, in eigen clans (teams met enkel bots;
  `/register` zet een mens nooit in een botclan). Aantal en niveau staan in `world.bots` / `world.bot_level` (beheer).
  Na een gewoon verzoek komt telkens één bot aan de beurt (`botTick` in `functions/lib/bots.js`, via `waitUntil`, enkel als het
  verzoek ≤ 18 query's gebruikte; `players.bot_next` + index), en elke minuut één via de cron-worker (`cronTick` in
  `functions/lib/crontick.js`: eerst de meldingen, een bot enkel als er die minuut niets verstuurd werd, CPU-limiet).
  Een bot haalt gemiste tijd in stappen in (30–90 min, hooguit 3 per beurt) met telkens een beslissing van het brein
  (`functions/lib/botbrain.js`, puur, gebruikt de gewone acties uit `sim.js`: dorpelingen, huizen, werkplekken, tijdperken,
  muurring op ring 1 met 4 poorten, torens, leger). Pas als hij bij is, beslist hij over zijn leger (`military`): versterking naar
  een clanlid dat aangevallen wordt (en terughalen), karavanen naar een clanlid dat spaart, spelers aanvallen na hun vrede als
  `resolveBattle` voorspelt dat hij wint (wachttijd per doelwit voor alle bots `prey:<stad>`), anders roverskampen.
  **Doelwit en golven** (`BOT_WAR`): enkel steden met 0,45–1,5× zijn score (`minRatio`/`soloMax`, liefst rond 1: `near`); samen met
  de clan tot 1,9× (`waveMax`). Vanaf 0,8× (`waveFrom`), of als hij het alleen niet haalt maar de clan samen wel (`simWaves`: golven
  na elkaar), start hij een **clanaanval**: `config` `clan:<team>` = `{ t, wave, until, waves: [{ p, at, u }] }`. De andere bots
  sluiten bij hun volgende beurt aan (stap 4a in `military`, ook voor hun eigen wachttijd) en komen `step` (10 speelminuten) na de
  vorige golf aan: ze vertrekken meteen en lopen trager (`dur = at - now`). De eerste golf wacht zo lang dat verre clanleden dat
  halen (`gather`). Aansluiten = `UPDATE config ... WHERE v = <oud>` (nooit dubbel). Een lopende clanaanval wordt niet overschreven. Zijn geheugen staat in `towns.state.bot`. `ensureBots` maakt/verwijdert bots (± om de 10 min).
  **Balans met de echte spelers**: elke bot heeft een sterkte (`bot.tier`: zwak, gemiddeld, sterk; vaste mix `TIER_ORDER`, ook binnen
  een clan) en een doelscore (`botTarget`) t.o.v. de scores van de actieve echte spelers (`humanRef` → `world.bot_ref`, om de 10 min):
  zwak ±70% van de mediaan, gemiddeld de mediaan, sterk minstens de beste speler, maal het niveau (0,8 / 1 / 1,2). Boven zijn doel
  rust een bot (bouwt niet verder, ook geen nieuw tijdperk dat hem ver boven zijn doel brengt). Hij valt geen stad aan met minder
  dan 45% van zijn eigen score, tenzij die hem de laatste dag aanviel (`bot.foe`). Bots van voor de balans (`bot.v` ≠ 2) die meer
  dan 1,5× hun doel hadden, begonnen opnieuw.
- Meldingen op je gsm (Web Push, `functions/lib/push.js`, zonder bibliotheek): VAPID-sleutels worden de eerste keer gemaakt en
  in de tabel `config` bewaard; inschrijvingen in `push_subs` (enkel echte meldingsdiensten, `validPushEndpoint`).
  `notifyDue()` stuurt ±2 min voor een aanval aankomt een melding met geluid (aanvaller + verdediger) en ±1 min vooraf een stille
  bijwerking van dezelfde melding (`marches.notified` 0 → 1 → 2). `{left}`/`{clock}` in de tekst vult `sw.js` in met de klok van de gsm. Het draait
  elke minuut in de cron-worker `cron/` (eigen `wrangler.toml`, gezet door `deploy.sh`; vraagt 'Workers Scripts: Edit' op het
  token) en als vangnet na gewone verzoeken (`waitUntil`). `public/sw.js` toont de melding. Tijdens de laatste 2 minuten
  toont het spel een aftelbalk waar je vooraf kiest (`/march/mode` → `marches.pref_mode`); `maybeOfferBattle` gebruikt die keuze.
  **Soorten, elk apart aan/uit per toestel, standaard aan** (`NOTIFY_KINDS`, kolommen `n_now`/`n_ally`/`n_attack`/`n_build`/`n_march`
  in `push_subs`, migraties `0008` en `0012`; `notifyPlayer(..., kind)` stuurt enkel naar toestellen waar die soort aan staat; route
  `/push/prefs`, schakelaars `PUSH_KINDS` in `pushCardHtml` (stadsoverzicht én wereldkaart)): *aanval op je stad* (`now`) =
  `notifyAttack` meteen bij het vertrek (na `/march` via `ctx.later`, en in `insertMarch` van de bots); *aanval op een clanlid*
  (`ally`) = in `notifyAttack` ook naar de echte spelers van de clan van de verdediger (tag `ally-<mars>`); *aanval komt bijna aan*
  (`attack`) = de verdediger ±2 min vooraf en een overval van de barbaren; *bouwer vrij* = `notifyBuilds`: `saveTown` zet
  `towns.build_at` (`nextBuildAt`: eerstvolgende einde, niet voor bots), de cron/het vangnet zoekt via de index wat klaar is,
  meldt het en schuift `build_at` op (UPDATE met de oude waarde: nooit dubbel); `sw.js` toont die melding niet als het spel in
  beeld is; *je leger komt aan* = de aanvaller ±2 min vooraf. `notifyAll` = `notifyDue` + `notifyBuilds` (cron en vangnet).
  Zonder cron-worker (tokenrecht ontbreekt) gaan 'bouwer vrij' en de ±2 min-meldingen pas uit bij het eerstvolgende verzoek
  van eender wie; de melding bij het vertrek van een aanval gaat altijd meteen.
- Volkeren: `CIVS` en de elite-eenheden staan in `rules.js` (eigenschappen zoals `bonus`, `tough`, `defMult`, `walls`, `fear`
  worden in `battle.js` verrekend). Het volk zit in `towns.state.civ`; oude steden krijgen er een in `ensureTerritory()`.
  Bouwstijl per volk: `STYLES` en de kastelen (`TC_CIV`) in `art.js`; elite-figuren in `figures.js` (`uniqueUnit`).
- **Clans wisselen, verraad, privéberichten** (`functions/lib/clan.js`, regels in `CLAN` in `rules.js`, migratie `0013`): een speler
  zit altijd in precies één clan (`players.team_id`). `/clan/leave` = een eigen clan stichten (`teams.founder`, kleur via `pickColor`);
  `/clan/invite`, `/clan/request` en `/clan/answer` (tabel `clan_invites`, vervalt na 3 dagen; vroeg de andere kant het al, dan meteen
  rond); `switchClan()` doet de wissel: troepen bij de oude clan gaan naar huis (en omgekeerd), versterking onderweg keert om, aanvallen
  tussen jou en je nieuwe clan keren om, `marches.team_id`/`target_team` volgen mee, een lege clan verdwijnt, berichten in de clanchat
  (`player_id` 0, naam 'Clan'). Wachttijd `CLAN.switchMs` (`players.clan_at`), max. `clanMax()` leden, nooit in een computerclan.
  Automatisch koppelen (`/register`, `createBot`) vult enkel teams zonder `founder` en neemt `freeSlot()`; een nieuwe speler komt bij
  de stad van zijn clanleden. **Verraad**: `/march` laat een aanval/verkenning op een clanlid toe met `betray: true` (zet
  `players.traitor_at`); `/state` toont zo'n leger als vijandig (`ally: false`, `betray: true`); `attackTown` laat de versterking van de
  aanvaller zelf niet meevechten en meldt het in de clanchat; `sides()` geeft beide kanten een andere kleur. `/clan/kick` zet een
  verrader (binnen `CLAN.traitorMs`) buiten. **Privéberichten**: tabel `dms` (`pair` = 'klein:groot'), `/dm/list`, `/dm?with=`
  (markeert gelezen), `POST /dm`; `/state` geeft `chat.newDm`/`lastDm` en `clan.invites`/`clan.requests`. In de browser: Team-venster
  (`teamHtml`, `clanAskHtml`, `clanListHtml`, tab Privé = `dmListHtml`/`dmConvHtml`), knoppen bij een stad op de wereldkaart.
- **Nieuws** (`public/js/updates.js`, `public/updates.html`): `UPDATES` = artikels, nieuwste eerst (`updatesHtml`, `unreadUpdates`).
  In het spel: knop Nieuws in het menu (`#badgeNews`), venster `openModal('updates')`; `main.js` laadt `updates.js` pas 4 s na
  het opstarten met een dynamische `import()` (`checkNews`: getal + één melding per nieuw artikel; localStorage `rvs-news-seen` en
  `rvs-news-told`; artikels van vóór de start van de speler tellen niet als nieuw). Los, zonder aanmelden: `/updates` (link op het
  aanmeldscherm; `/updates#update-3` opent één artikel). `tests/updates.test.js` controleert de artikels.
- `public/js/dom.js` — `setHTML()` werkt panelen bij zonder ze te vervangen. Gebruik dit (geen `innerHTML`) voor alles
  wat periodiek ververst, anders flitst het en gaan klikken verloren.
- `functions/lib/routes.js` — alle API-routes; `game.js` — legers, gevechten, rapporten; `auth.js` — sessies.
- **Ongelezen chat**: de browser stuurt bij elke peiling mee wat hij al zag (`/state?cw=&ct=`, ook de vroege fetch in
  `index.html`); `/state` geeft in dezelfde D1-vraag als de rapporten `chat.newWorld/newTeam` (berichten van anderen, max. 9)
  en het laatste bericht per kanaal (`lastWorld/lastTeam` = naam, tekst, `me`). `main.js`: `chatState` (gezien bijhouden in
  localStorage `rvs-chat-seen`; eerste keer op een toestel telt oude geschiedenis niet), `renderChatBadges`: getal op de
  Team-knop (pulseert), knop `#chatPill` bovenaan op de kaart ('3 nieuwe berichten', tik = `openChat`), '(3)' in de titel
  van het tabblad, getal per kanaal in de chat, en een melding (`toast(..., 'chatmsg', 'chat', 'openChat:team')`) met wie
  wat schreef. Let op: geef een toast nooit de klasse `chat` (dat is het chatvenster).
- **Clan verplaatsen** (`functions/lib/relocate.js`): `relocateTeam` zet alle steden van een clan op een willekeurige plek op
  bebouwbaar land, zo ver mogelijk van de andere steden (clanleden naast elkaar via `findSpot`), past de lijnen van lopende
  legers aan (`marches.from_x/to_x`) en stuurt de spelers een bericht. Beheer: knop 'Clan verplaatsen' (`/admin/relocate`).
  **Eenmalige opdrachten** zonder toegang tot de echte database: zet ze in `ONE_OFF` (met `until`); de cron-worker voert ze
  één keer uit (`runOneOff`, `config` `once:<key>`, eerst `busy:<tijd>`, na 5 min opnieuw als het onderbroken werd).
- `public/js/art.js` — procedurele tekeningen (gebouwen, mensen, bomen; geen afbeeldingsbestanden).
- `public/js/troops.js` — uitzicht van de soldaten (`soldierOpts`, `lookOf`): uitrusting volgens de smidse (`gear`, `plate`)
  en details van het onderzoek (`kit`: S schild, P pluim, G goud, F vuurpijlen, L lange boog, Q twee pijlkokers, B kleed,
  N lans, H paardenpluim). Nieuwe opties ook toevoegen aan `FIG_KEYS` in `sprite3d.js` en aan de sleutels in `figures.js`.
- **3D-look** (zoals vooraf gerenderde sprites in klassieke RTS-spellen): `render3d.js` is een kleine straalvolger
  (vormen: convexe veelvlakken, cilinders, kegels, ellipsoïden, capsules; procedurele materialen; zon, slagschaduw,
  omgevingsschaduw). `models3d.js` = gebouwen (per volk een stijl), muurstukken en poorttorens; `figmodels.js` = mensen en
  ruiters (8 beelden per loop-/werkcyclus). `sprite3d.js` laat ze renderen in Web Workers (`render-worker.js`, die ze ook
  afwerkt en bewaart, zie "Snelheid" hieronder), in Cache Storage (verhoog `VERSION` als modellen veranderen; nu 11) en geeft `null` tot ze klaar zijn: dan tekent het spel de
  oude versie uit `art.js`/`figures.js`. **Elk niveau ziet er anders (en beter) uit**, met dezelfde opbouw voor alle gebouwen:
  1 hout en riet, klein; 2 groter, pannen, stenen voet; 3 steen, leien, een extra bouwsel (kraan, schachttoren, put, erker…);
  4 een zichtbare aanbouw of tweede gebouw (aan de rechter- of voorkant, niet achteraan: daar zie je het niet) en vaandels
  (`dressHigh`); 5 een toren/koepel, goud (`goldVane`), lantaarns. **Per volk** veranderen ook materiaal en versiering:
  `CIV_WALL` in `models3d.js` geeft per volk en niveau het muurmateriaal (bv. Grieks leem → gewit → pilasters → marmer met
  fries → goud; Egypte leemsteen → pleister → zandsteen met hoeklijsten → beschilderd → kalksteen en goud; Babylon riet →
  leemsteen → gebakken steen met lisenen → blauwe tegelband met rozetten → geglazuurde voet; Perzië leemsteen → pleister →
  tegelplint → tegelbanden → marmer; Yamato hout → papieren wanden → wit boven donker hout → stenen voet → goud). `walls()`
  past dat toe op elke oproep zonder eigen materiaal (`st.L` = niveau, `st.civ`, gezet in `build()`); `wallDetails()` tekent
  de versiering enkel op grote blokken. `roof()` volgt het niveau (`o.level`, anders `st.L`): riet → pannen → leien/glazuur,
  vanaf 4 nokkam, acroteria, dubbele dakrand (pagode), getrapte kantelen, tegelband op de koepel; op 5 goud (vergulde koepel). Controleer nieuwe modellen met een overzicht van alle niveaus en het verschil per
  stap (render alle niveaus, meet het % gewijzigde pixels: < ±15% is te weinig). Die meting telt ook 'enkel groter' mee:
  bekijk de overzichten zelf en zorg voor nieuwe onderdelen per niveau (vb. wachttoren: houten post op palen → stenen voet
  met houten wachtkamer → steen, traptorentje, wachthuisje → mezekouwen, hoektorentjes → open bovenverdieping met vuurbaken,
  anker `glow`). Verhoog `VERSION` in `sprite3d.js`. Ankers die een model teruggeeft moeten altijd `[x, y, z]` zijn (geen
  `undefined`): mislukt een model in de werker, dan valt het spel stil terug op de 2D-tekening (test in `tests/game.test.js`).
  De boerderij is ook 3D (akker met ruggen, graan, hek; de wieken van het molentje
  tekent `drawOverlay3d` via het anker `blades`). Kameel en strijdwagen zijn nog getekend.
  **Olifant en stormram** zijn 3D-figuren (`figmodels.js`: `elephant` = soort `e`, `ram` = soort `r`; materiaal `hide` in
  `render3d.js` = olifantenhuid met fijne rimpels). Olifant: kleed en kopkleed in teamkleur met goud, slagtanden, torentje met
  een boogschutter en een mahout (gewone `person` via `at()` = verschoven scène); lopen = één poot tegelijk, aanval
  (`E_HEAD_DZ`, `E_TRUNK`, `E_STOMP`). Ram: spaakwielen die draaien, dak van huiden, schilden en vaandel in teamkleur, stam aan
  kettingen met een ijzeren ramskop die zwaait bij een aanval (`RAM_X`). Tekenen: `FIG.elephant` (schaal `E3D`) en `A.ram(ctx,
  x, y, s, { team, walking, phase, attack })` → `FIG.ram3d`; zonder opties of als het beeld nog niet klaar is, de oude tekening.
  Beide staan in `ATK_KINDS` (aanvalsbeweging in de slag). Kaartjes in het menu (`thumb`) blijven getekend, zoals bij alle troepen.
  **Alles scherp bij inzoomen**: gebouwen (`S3.get(..., need)`), muren/torens (`S3.getWall(..., need)`), figuren, spullen en
  bomen gaan via `tiered()` (4 of 6 px per wereldpixel, sleutel `…@6`, geheugen `HI_BUDGET` in pixels, scherpe gebouwen
  en muren met anti-aliasing). Getekende (2D) stukken die als afbeelding bewaard worden, krijgen ook een resolutie volgens
  de zoom: `A.buildingSprite(..., need)` en `spriteQ(need)` voor poortbogen en 2D-muren in `town.js`.
  **Aankleding in 3D** (`propmodels.js`, `S3.getProp(kind, v, need)`, tekenen met `A.prop3d(ctx, kind, v, x, y, s)`):
  spullen uit `towndress.js` (lantaarn, put, struik, bloemen, fruitboom, tonnen, kisten, hooi, kar, bank, houtstapel,
  vogelverschrikker, hekjes), rotsen (`A.rock`, `A.bush`, `A.broadleaf` proberen eerst 3D), goudaders, stronken, brandhout,
  bessenstruiken, alle 16 boomsoorten (`tree`, zelfde nummers als `nature.js`; zonder slagschaduw, die zit in de grondlaag)
  en het barbarenkamp (`campback` + `campfront`, de barbaren ertussen). Schaap en everzwijn zijn 3D-figuren (`figmodels.js`,
  soort `s` en `b`). Nieuwe aankleding: eerst een model in `propmodels.js`, de getekende versie blijft als terugval.
  Steengroeve en goudmijn gebruiken `rockShape` (gefacetteerde rotsen).
  Figuren in meerdere resoluties: `getFig(..., need)` (need = schermpixels per wereldpixel, `needOf` in `figures.js`) vraagt
  bij inzoomen een scherpe versie (`HI` = 4 of 6, sleutel `…@6`) en toont tot dan de beste die er is; wachtrij met voorrang
  (gewone eerst), hooguit `MAX_HI` scherpe beelden in het geheugen. Figuren krijgen anti-aliasing (`aa`) in `render()`.
  `render3d.js` versnelt exact met lijsten per vorm (`buildAccel`: schaduw, omgevingsschaduw, schermvak per beeldlijn).
  Materialen voor figuren: `cloth`, `leather`, `mail` (maliën), `plain`/`metal`/`gold`.
  **Aanvallen**: figuren hebben de modus `atk` (8 beelden, beeld 0 = het moment van de slag of het schot): zwaard
  (`SWORD_ARM`/`SWORD_ROT`), speer en lans (`SPEAR_X`, stoten), boog (`BOW_DRAW`: pijl uit de koker, op de pees, spannen,
  loslaten), werpspeer, bijl; ruiters doen het op het paard. Geef `attack` (fase 0..1 in de cyclus) mee aan `A.person`,
  `A.horseman` of `FIG.uniqueUnit`; `modeOf` in `figures.js` kiest dan `atk`. De fase komt uit de laatste slag en de
  `rate` van de eenheid: in de belegering `u.at` (`siegeview.js`), in je gebied `lastSwing` (`drawFighter` in `town.js`).
  Wie een doelwit heeft maar nog wacht, staat in de aanslag (`attackReady`). `hasAttackAnim` = welke eenheden dit kunnen.
- **Grond van de stad** (`town.js` + `groundhd.js`): `bakeGround` bereidt alles voor en maakt een tekenfunctie
  `paintGround(g, R, S)` (g in wereldcoördinaten op schaal S, R = uitsnede in wereldpixels). Daarmee wordt de grond één keer
  op `BAKE` gebakken (uitgezoomd); ingezoomd tekent `drawGroundHD` het zichtbare deel in stukken op schermresolutie
  (`HD_TIERS` 2–6 px per wereldpixel, cache `HDGround` met LRU, hooguit 2 nieuwe stukken per beeld, `hdPatterns` = fijne
  texturen per resolutie, `stone()` = één kassei/kinderkopje/stapsteen). De aankleding (`buildDress`) heeft ook `paint(g, R, S)`.
  Nieuwe grondversiering hoort in die tekenfuncties, op vaste (gehashte) plaatsen en met een uitsnede-test: geen Math.random
  of oplopende `rnd()`, anders verschillen de stukken. Lijsten één keer uitrekenen in `bakeGround` (zoals `grains`, `tuftHD`,
  `fineClumps`, `wildFlowers`, `rockList`) en in bulk tekenen (`GH.grassClumps`, `GH.flowers`: één pad per kleur).
  Reliëf: hoogte uit ruis, belicht van linksboven, zit in de bodemkleur (`HG`). Meren in de scherpe stukken: `lakeHD`
  zet het zachte diepte-beeld (`lakeImage().field`) per pixel om naar kleur (`lakeLUT`) en tekent golfjes in wereldcoördinaten.
- `public/js/town.js` / `world.js` — de twee canvas-weergaven; `fx.js` — dag/nacht, licht, deeltjes, wolken, vogels.
  **Rustige stad** (`town.calm`, knop `#calmBtn` in de rij rechts, enkel in de stad; `calmMode`/`renderCalmBtn` in `main.js`,
  localStorage `rvs-calm`): geen sfeerbeweging. In `drawFrame` is `calm` (nooit in `battleMode`) en `ta` = 0 de tijd voor water,
  bomen en vlaggen. Uit: dorpelingen (`walkers`, ook niet aan te tikken), soldaten thuis (`showSoldiers()`: enkel als ze gekozen
  zijn, bv. lang indrukken = leger), schapen/eendjes/vogels/wolken/vlinders, rook, vonken en stof, de bouwvakker op de steiger,
  draaiende wieken, wapperende vlaggen, bootjes (aan de steiger). Wel: vondsten en wie ze oogst, groepen in je gebied, gevechten,
  het barbarenkamp, overvallen, vuurwerk, licht en gloed. Nieuwe sfeerbeweging in de stad? Zet ze ook achter `this.calm`.
  `worldmap.js` bakt de wereldkaart (hoogteveld uit `worldgen.fieldAt`, kolom per kolom getekend, bossen, akkers, wegen).
  Teken nooit `A.box` met textuur per beeld (duur): cache als afbeelding zoals `drawWallPiece`/`gatePart`.
- `public/js/ui.js` — HTML-sjablonen (`gainsHtml` = wat een niveau hoger oplevert: rekent de stad uit met het gebouw +1 niveau;
  nieuwe effecten van gebouwen daar ook tonen); `icons.js` — SVG-iconen (gebruik deze, geen emoji); `main.js` — spelverloop in de browser.
- **Tabbladen onderaan de stad** (`#buildwrap`): Bouwen, Mijn leger, Bouwadvies (`app.bbTab`, onthouden; tijdens bouwen/muren
  altijd Bouwen: `bbTabNow`). Zelfde strook (`#buildbar`), ander inhoud: `buildBarHtml`, `armyBarHtml` (`armySummary`: per soort
  thuis / in je gebied / onderweg of bij een bondgenoot / in opleiding) en `adviceBarHtml` (bouwers + `upgradeAdvice`: wat in dit
  tijdperk nog verbeterd kan worden, per soort en niveau gebundeld, wat nu kan eerst; daarna `newBuildAdvice`: gebouwen die je in
  dit tijdperk mag zetten maar nog helemaal niet hebt, bv. het havenhuis, label 'nieuw', tik = `place` zoals in het bouwmenu;
  `adviceReady` = getal op het tabblad, beide samen).
  Tik op een voorstel of lopende bouw = `adviceGo` → `focusBuilding` (camera erheen, gebouw kiezen, paneel open; een gebundelde
  kaart toont bij elke tik het volgende gebouw). Smalle gsm: korte namen (Leger, Advies); met troepen gekozen enkel iconen.

## Snelheid (laden en tekenen) — hou dit zo

- **Foutpagina's van Cloudflare** (te veel rekentijd/verzoeken, geen JSON): `api.js` probeert GET-verzoeken en het aanmelden
  vanzelf opnieuw (600 ms, 1,8 s) en toont anders "De server is even overbelast" (geen "Ongeldig antwoord").
- **Laden**: `index.html` vraagt alle modules tegelijk (`<link rel="modulepreload">`) en start `/info` + `/state` al vóór de
  scripts binnen zijn (`window.__boot`, `api.js` `early()`). Nieuwe module (of een die wegvalt)? Pas de lijst in
  `index.html` aan; een test controleert dat ze klopt met de imports van `main.js`.
- **3D-beelden** (`sprite3d.js`): de werker maakt het beeld af (rand rond figuren, `ImageBitmap`) en bewaart het zelf in
  Cache Storage; de hoofdthread kopieert of codeert niets. Welke beelden gebruikt werden, staat in localStorage
  (`rvs-3d-used-…`); bij de start worden die samen uit de cache gehaald (`S3.preloaded`, `main.js` wacht max. 2,5 s).
  Een figuur zonder klaar beeld toont een ander beeld van dezelfde figuur. `S3.busy()` = er wordt nog gewoon 3D geladen.
  Een sprite kan dus een canvas of een `ImageBitmap` zijn: gebruik `.cv` enkel als bron voor `drawImage`.
- **Beeldkwaliteit** (`adaptQuality` in `town.js`): beelden tijdens het laden (`S3.busy()`, grondstukken, open venster)
  tellen niet mee; traag = < ±40 beelden/s én veel tekentijd (`workMs`); gaat het vlot, dan gaat de resolutie terug omhoog.
- **Hooguit ±60 beelden per seconde** (`FX.Pacer` in `main.js` en `battleview.js`): Chrome op Android tekent anders op 90/120 Hz
  (Safari op de iPhone begrenst zelf). Android (`FX.ANDROID`) krijgt altijd de lichte instellingen (`LOW_POWER`, ook liggend;
  `WEAK` in `groundhd.js`, `LOW` in `sprite3d.js`). Het stads- en wereldcanvas zijn ondoorzichtig (`alpha: false`).
  `adaptQuality` verlaagt op een aanraakscherm de resolutie al onder ±33 beelden/s (daar remt meestal de GPU).
- **Geen `backdrop-filter`** op iets dat altijd boven de spelkaart ligt (de kaart verandert elk beeld). Achter een open
  venster tekent de stad 5 keer per seconde.
- **Werk bij het opstarten uitstellen**: miniaturen (`lazyThumb` in `ui.js`: eerst een leeg plaatje, de tekening volgt op de
  achtergrond en vervangt alle `<img>` met dat adres), 2D-bomen pas als terugval (`treeSpr`), scherpe grondstukken pas na
  1,2 s en tijdens slepen hooguit één per 3 beelden (`maxNew`). De wereldkaart wordt 6 s na de start op de achtergrond
  gebakken (`bakeWorldGen` in `worldmap.js` = generator met `yield`; houd stappen zonder `yield` onder ±50 ms).
- Duizenden kleine vormen: in één pad (zoals de korrels in het gras), niet elk met een eigen `fill`/`fillRect`.
- Meten: zie `context.md` › Testen (scripts met Playwright, gsm = CPU 4x trager + 4G). De container heeft 4 kernen: dan
  staat `FX.LOW_POWER` aan; boots een pc na met `hardwareConcurrency` = 8.

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
  bovenaan, detailpaneel schuift van rechts in. Op gsm/tablet heeft het schuifpaneel bovenaan een sluitknop (`SHEET_CLOSE` in
  `main.js`, vooraan in de inhoud van `renderPanel`; breed pijltje omlaag, liggend naar rechts; ook vegen): `closeSheet()` sluit
  het en laat daarna de keuze los. Op pc verborgen. Het bouwmenu (`#buildwrap`) kan overal ingeklapt worden (`app.bbMin`).
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
