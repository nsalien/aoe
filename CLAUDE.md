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
  **5 tijdperken** (`AGES`, `MAX_AGE`): niveau N van een gebouw vraagt tijdperk N (`levelAge`, of `levelAges` per gebouw).
  Nieuwe gebouwen: molen en gildehuis (`boost` = productiebonus), bouwloods (`builders`, `buildSpeed` → `maxBuilds`/`buildTime`
  in `sim.js`; gebruik altijd `buildTime(s, ...)`, niet `levelTime`, voor bouwen), Academie (`research`), Adelshof (edelman),
  kathedraal (`loyalty`, `score`). **Onderzoek**: `TECHS` (4 soorten × 3 rijen, `techAt`, `techTier`), in de stad `s.tech` en
  `s.research` (`doResearch`/`checkResearch`, klaar in `advance()`); in de automatische slag via `auto` → `techMods` (`battle.js`:
  `attTech`/`defTech`), in de live slag via `st.tk` en `TK()` (`fieldbattle.js`; schildmuur, vuurpijlen, taxusboog, pijlenregen,
  hoefijzers `reg.sp`, lansen, flankrit, krijgsdrill `moLoss`, strijdkreet, kokende pek `pourPitch` → `g.pt`, torenkruisbogen,
  ijzerbeslag). Hoefijzers versnellen ook marsen (`slowestSpeed(units, tech)`).
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
  Een stad helemaal dichtmaken zonder poort mag niet; oude dichte steden krijgen in `ensureTerritory()` een poort.
  Routes: `routeTo(s, from, to)` (A* over de tegels: water en muren blokkeren, poorten zijn doorgang; daarna enkel de bochten
  als tussenstops in `g.via`, `fieldArrive` loopt verder). Gebruikt door groepen (`travel`) én de dorpelingen in de stad.
  Gebouwen afbreken: `doDemolish` (deel van de kosten terug, zie `DEMOLISH` in `rules.js`).
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
- **Computerspelers (bots)**: gewone spelers met `players.bot = 1` en een eigen stad, in eigen clans (teams met enkel bots;
  `/register` zet een mens nooit in een botclan). Aantal en niveau staan in `world.bots` / `world.bot_level` (beheer).
  Geen achtergrondtaak (de cron-worker draait niet zonder tokenrecht): na een gewoon verzoek komt telkens één bot aan de beurt
  (`botTick` in `functions/lib/bots.js`, via `waitUntil`, enkel als het verzoek ≤ 18 query's gebruikte; `players.bot_next` + index).
  Een bot haalt gemiste tijd in stappen in (30–90 min, hooguit 3 per beurt) met telkens een beslissing van het brein
  (`functions/lib/botbrain.js`, puur, gebruikt de gewone acties uit `sim.js`: dorpelingen, huizen, werkplekken, tijdperken,
  muurring op ring 1 met 4 poorten, torens, leger). Pas als hij bij is, beslist hij over zijn leger (`military`): versterking naar
  een clanlid dat aangevallen wordt (en terughalen), karavanen naar een clanlid dat spaart, spelers aanvallen na hun vrede als
  `resolveBattle` voorspelt dat hij wint (gezamenlijk doel per clan in `config` `clan:<team>`, wachttijd per doelwit voor alle bots
  `prey:<stad>`), anders roverskampen. Zijn geheugen staat in `towns.state.bot`. `ensureBots` maakt/verwijdert bots (± om de 10 min).
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
- Volkeren: `CIVS` en de elite-eenheden staan in `rules.js` (eigenschappen zoals `bonus`, `tough`, `defMult`, `walls`, `fear`
  worden in `battle.js` verrekend). Het volk zit in `towns.state.civ`; oude steden krijgen er een in `ensureTerritory()`.
  Bouwstijl per volk: `STYLES` en de kastelen (`TC_CIV`) in `art.js`; elite-figuren in `figures.js` (`uniqueUnit`).
- `public/js/dom.js` — `setHTML()` werkt panelen bij zonder ze te vervangen. Gebruik dit (geen `innerHTML`) voor alles
  wat periodiek ververst, anders flitst het en gaan klikken verloren.
- `functions/lib/routes.js` — alle API-routes; `game.js` — legers, gevechten, rapporten; `auth.js` — sessies.
- `public/js/art.js` — procedurele tekeningen (gebouwen, mensen, bomen; geen afbeeldingsbestanden).
- `public/js/troops.js` — uitzicht van de soldaten (`soldierOpts`, `lookOf`): uitrusting volgens de smidse (`gear`, `plate`)
  en details van het onderzoek (`kit`: S schild, P pluim, G goud, F vuurpijlen, L lange boog, Q twee pijlkokers, B kleed,
  N lans, H paardenpluim). Nieuwe opties ook toevoegen aan `FIG_KEYS` in `sprite3d.js` en aan de sleutels in `figures.js`.
- **3D-look** (zoals vooraf gerenderde sprites in klassieke RTS-spellen): `render3d.js` is een kleine straalvolger
  (vormen: convexe veelvlakken, cilinders, kegels, ellipsoïden, capsules; procedurele materialen; zon, slagschaduw,
  omgevingsschaduw). `models3d.js` = gebouwen (per volk een stijl), muurstukken en poorttorens; `figmodels.js` = mensen en
  ruiters (8 beelden per loop-/werkcyclus). `sprite3d.js` laat ze renderen in Web Workers (`render-worker.js`, die ze ook
  afwerkt en bewaart, zie "Snelheid" hieronder), in Cache Storage (verhoog `VERSION` als modellen veranderen; nu 10) en geeft `null` tot ze klaar zijn: dan tekent het spel de
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
  tekent `drawOverlay3d` via het anker `blades`). Kameel/strijdwagen/olifant en rammen zijn nog getekend.
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
  `worldmap.js` bakt de wereldkaart (hoogteveld uit `worldgen.fieldAt`, kolom per kolom getekend, bossen, akkers, wegen).
  Teken nooit `A.box` met textuur per beeld (duur): cache als afbeelding zoals `drawWallPiece`/`gatePart`.
- `public/js/ui.js` — HTML-sjablonen (`gainsHtml` = wat een niveau hoger oplevert: rekent de stad uit met het gebouw +1 niveau;
  nieuwe effecten van gebouwen daar ook tonen); `icons.js` — SVG-iconen (gebruik deze, geen emoji); `main.js` — spelverloop in de browser.
- **Tabbladen onderaan de stad** (`#buildwrap`): Bouwen, Mijn leger, Bouwadvies (`app.bbTab`, onthouden; tijdens bouwen/muren
  altijd Bouwen: `bbTabNow`). Zelfde strook (`#buildbar`), ander inhoud: `buildBarHtml`, `armyBarHtml` (`armySummary`: per soort
  thuis / in je gebied / onderweg of bij een bondgenoot / in opleiding) en `adviceBarHtml` (bouwers + `upgradeAdvice`: wat in dit
  tijdperk nog verbeterd kan worden, per soort en niveau gebundeld, wat nu kan eerst; `adviceReady` = getal op het tabblad).
  Tik op een voorstel of lopende bouw = `adviceGo` → `focusBuilding` (camera erheen, gebouw kiezen, paneel open; een gebundelde
  kaart toont bij elke tik het volgende gebouw). Smalle gsm: korte namen (Leger, Advies); met troepen gekozen enkel iconen.

## Snelheid (laden en tekenen) — hou dit zo

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
