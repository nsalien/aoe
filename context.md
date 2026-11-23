# context.md — werkgeheugen voor Claude

Lees dit samen met `CLAUDE.md` (daar staan de werkwijze, de limieten en "waar staat wat" per bestand).
Dit bestand vat samen **wat het spel is, hoe het nu werkt, wat de gebruiker belangrijk vindt en wat er al gebouwd is**,
zodat een nieuwe sessie meteen verder kan. Werk het bij als je iets belangrijks verandert.

---

## 1. Het spel in het kort

**Rijken van de Vallei** is een isometrisch browser-strategiespel in de stijl van Age of Empires, voor een kleine
vriendengroep. Live op https://rijken-van-de-vallei.pages.dev (Cloudflare Pages + Pages Functions + D1, gratis plan).

- Een **seizoen** duurt standaard 28 dagen (`world.war_ms`), daarna een eindstand. **Vrede is per speler**: de eerste
  24 uur na zijn start (`world.prep_ms`; wie zich vóór de start inschreef: vanaf de start) kan niemand hem aanvallen en
  kan hij zelf geen spelers aanvallen. Daarna kan iedereen eender wanneer aanvallen. Rovers en barbaren altijd.
  (Vroeger: 3 weken vrede voor iedereen + 1 oorlogsweek; migratie `0004` zette het lopende seizoen om, zelfde einddatum.)
- Spelers worden automatisch in **teams** gekoppeld (standaard 2 per team, tot 8 teams). Bondgenoten starten naast
  elkaar, kunnen elkaar troepen (versterking) en grondstoffen (karavanen via de markt) sturen en chatten.
- Twee weergaven: **je stad** (met je eigen gebied eromheen) en de **wereldkaart** (56×56, steden + roverskampen).
- Een wereld wordt beheerd via `/admin.html` (sleutel `ADMIN_KEY`): starten, snelheid (`speed`), duur, teamgrootte.

## 2. Wat de gebruiker wil (voorkeuren)

- **Alles in het Nederlands** (Vlaams getint). Antwoord ook in het Nederlands, kort en duidelijk.
- Werkt op **pc (hoofdgebruik)** én **gsm, rechtop en liggend**. Test 1440×900, 390×844 en 915×412.
- **Warme middeleeuwse stijl**, zo grafisch mogelijk (richting Age of Empires II), alles procedureel getekend.
- Hij test op zijn gsm en stuurt screenshots/video's met feedback. Hij wil dat het **vlot** loopt (geen verspringende
  troepen, geen lag) en dat bediening **zoals in AoE** werkt.
- Hij speelt met vrienden: balans moet leuk zijn, barbarenkampen rond je stad moeten **vrij makkelijk** zijn.
- Hij verwacht dat alles meteen live staat na de wijziging (push = live, zie §4).

## 3. Spelregels en balans (huidige stand)

Alle getallen staan in `public/shared/rules.js`; dit is een samenvatting.

**Economie**
- Grondstoffen: voedsel, hout, steen, goud. Start: 300/300/150/100, 6 dorpelingen (3 voedsel, 3 hout).
- Dorpelingen werken op **werkplekken** (stadscentrum + boerderij/houthakkerskamp/steengroeve/goudmijn per niveau).
  Opslag (stadscentrum + opslagplaats) begrenst je voorraad; een deel is verborgen voor plunderaars.
- **4 tijdperken**: Vuursteen → Brons → IJzer → Kroon (stadscentrum verbeteren; IJzer = kasteel).
- **Bouwers**: 2 tegelijk, 3 vanaf het IJzertijdperk (`maxBuilds`).
- **Gebouwen**: stadscentrum, huis, boerderij, houthakkerskamp, steengroeve, goudmijn, opslagplaats, kazerne, stadsmuur
  (tijdperk 1); schietbaan, stal, smidse, markt, wachttoren (2); belegwerkplaats (3); monument (4, punten).
- **Afbreken**: elk gebouw behalve het stadscentrum; een kwart van de kosten terug (de helft van een lopende bouw).
  Niet als er nog getraind wordt. Werkers boven de nieuwe plaatsen worden vrij.
- **Vondsten**: af en toe een schaap/eik/rotsblokken/goud rond je stad; een dorpeling oogst ze (`BONUS`).

**Troepen** (hp tussen haakjes): dorpeling (25), speerdrager (45), zwaardvechter (60), boogschutter (35), verkenner (45),
ruiter (75), ridder (120), stormram (150). Elk volk heeft 2 elite-eenheden (kasteel, IJzertijdperk):
- Egyptenaren: strijdwagen, kamelenruiter · Grieken: hopliet, peltast · Yamato: samoerai, yabusame
- Babyloniërs: leeuwenwacht, stenenwerper · Perzen: oorlogsolifant (250), onsterfelijke
Wild: everzwijn (75), barbaar (32).

**Volkeren**: 5 volkeren met elk een eigen bouwstijl (Egypte, Griekenland, Yamato, Babylon, Perzië). Kiezen bij de
registratie; oude spelers kregen een vast willekeurig volk.

**Eigen gebied rond je stad** (`territory.js`, uit de stad-id):
- Oorlogsmist; groepen (dorpelingen of soldaten) lopen in echte tijd (max. 8 groepen). Bomen kappen aan de rand =
  extra bouwgrond + hout; wilde bronnen ontginnen; everzwijnen jagen.
- **Bouwgrond**: een vierkant van 12×12 dat met elk tijdperk een ring groeit, plus **gekochte loten** van 4×4
  (max. 12, steeds duurder) en gekapte tegels. Een stippellijn toont de rand van al je bouwgrond.
- **Barbarenkamp**: 4 barbaren in tijdperk 1, 6/8/10 later, hooguit +3 na veel overvallen. Barbaren vallen meteen
  aan wie binnen 3,4 tegels komt. Ongeveer evenveel soldaten als barbaren winnen. Het kamp overvalt je stad
  af en toe (afgehandeld met `resolveBattle`). Na verwoesten: buit en een pauze. Het aantal staat boven het kamp.
- Gevechten in je gebied mannetje per mannetje (`skirmish.js`): eerst 1,5 s stormloop, tempo ×1,5, telkens met
  minstens twee op dezelfde vijand.

**Muren en poorten**
- Stadsmuur-gebouw (niveau 1–5) bepaalt de sterkte; muren plaats je zelf tegel per tegel (`s.walls`).
  Niveau 1–2 houten palissade, vanaf 3 steen.
- **Poorten** (`s.gates`, max. 4, 80 hout + 40 steen), **2 tegels breed**, in een recht stuk muur. Een stad helemaal dichtmaken zonder poort
  mag niet. In een volledig ommuurde stad gaan troepen en dorpelingen **enkel via een poort** naar binnen/buiten;
  de deuren gaan open als er iemand door wil. Een gesloten ring verdedigt volledig, een open muur maar 30%.
- **Wachttorens** (tijdperk 2, max. 4, niveau 1–3): schieten in een veldslag op de dichtstbijzijnde vijand;
  meer schade/levens per niveau; gesloopt = een niveau minder.

**Wereldkaart en aanvallen**
- Roverskampen (niveau 1–5; altijd aan te vallen, ook tijdens je vrede) en steden. Legers marcheren in echte tijd
  (`marches`), komen aan, vechten, keren terug met buit. Verkenners verkennen.
- **Vrede** (`peaceEnd`/`peaceBlock` in `functions/lib/game.js`): een aanval of verkenning op een speler mag pas
  **aankomen** als de vrede van beide spelers voorbij is (vertrekken mag al eerder). `/state` geeft `me.peaceEnd`,
  `/map` per stad `peaceEnd`; de balk bovenaan toont "Vrede · nog …", op de kaart staat "· vrede" bij de stad.
- Tik je een stad of kamp aan, dan zie je **"Onderweg hierheen"**: elke mars ernaartoe met klokuur en aftelling.
- **Wat er gebeurt als een aanval aankomt** (`resolveMarch` → `maybeOfferBattle` in `functions/lib/game.js`):
  1. Er draait geen server op de achtergrond: een aankomst wordt verwerkt bij het eerstvolgende verzoek van **eender
     welke speler** (iemand die de site open heeft peilt elke 20 s; wie de aanvaller is peilt ook net na aankomst).
  2. Is de **aanvaller of de verdediger online** (laatste activiteit < 90 s) **en** is de aankomst minder dan 90 s
     geleden, dan krijgen zij 45 s om te kiezen: **zelf besturen** of **automatisch**. Zonder keuze → automatisch.
  3. Is niemand van beiden online (of werd de aankomst pas later verwerkt), dan wordt de slag **meteen automatisch**
     uitgerekend (`resolveBattle`). Er wordt dus **niet gewacht** tot de aanvaller online komt.
  3b. Daarom: **melding op je gsm** ±2 minuten voor aankomst (aanvaller en verdediger; cron-worker elke minuut), ±1 min
     vooraf stil bijgewerkt met de resterende tijd. De gebruiker wil de melding echt op de gsm (meldingenbalk/vergrendelscherm,
     ook met het spel dicht), niet enkel in het spel. Zonder het tokenrecht 'Workers Scripts · Edit' draait de cron-worker
     niet en gaan meldingen enkel uit als iemand het spel open heeft. Daarnaast in het
     spel een **aftelbalk** vanaf 120 s waar je al kiest. Vooraf 'zelf besturen' + verdediger offline → de slag begint meteen;
     vooraf 'automatisch' + verdediger offline → meteen uitgerekend.
  4. Live slag = **belegering in de echte stad** van de verdediger (of een open plek met tenten bij een roverskamp):
     eerst een **opstelling** (max. 75 s, tot beide op Start drukken), dan de slag (max. 10 minuten). De aanvaller staat
     aan de kant van zijn eigen stad; de verdediger zet schutters op de muur en voetvolk achter de poort aan die kant.
     Aanvallers kunnen niet door poorten of over muren: rammen (of voetvolk) slaan een bres. Winnen: alle verdedigers
     verslaan of het plein voor het stadscentrum 30 s houden. Gevechten bewust traag (`FB.pace`): een slag duurt minuten.
     Kaartjes per eenheid onderaan (1 tik = die eenheid, 2 tikken = alle van die soort), ingedrukt houden = heel leger.
     Kijkt niemand meer (30 s), dan rekent de server de rest automatisch uit.

**Punten**: opbouwpunten (gebouwen, dorpelingen, troepen; monument +1500/niveau) + gevechtspunten.

## 4. Werkwijze en omgeving

- Branch van deze sessies: `ccr-944648cc-j8tmpw` (zie de systeemprompt van je sessie). Push → GitHub-actie test,
  cherry-pickt naar `main` en zet alles online (±1–2 min). Controleer met `curl` dat een nieuw stukje code op de site staat.
- `git merge --no-edit origin/main` geeft vaak conflicten omdat main uit cherry-picks bestaat. Is de inhoud gelijk
  (`git diff HEAD origin/main` leeg), gebruik dan `git merge -s ours --no-edit origin/main`.
- Geen toegang tot de echte database of Cloudflare vanuit de sessie: bugs reconstrueren met lokale tests.
- Android SDK (voor de APK) zit niet standaard in de container: zie `CLAUDE.md` › Android-app
  (`commandlinetools` van dl.google.com, `sdkmanager "platforms;android-35" "build-tools;35.0.0"`).

## 5. Testen

- `npm test` (Node test runner, `tests/game.test.js`, ±60 tests): simulatie, gevechten, gebied, muren/poorten,
  afbreken, belegeringen (determinisme na JSON heen en terug, opstelling, AI, bres), meldingen (met `node:sqlite`).
- Belegering zonder browser: maak een stad met `newTownState` + muren/poorten en speel `createBattle` + `stepTo` af
  (beide kanten AI) om duur en verloop te controleren.
- Lokaal spel: `npm run db:init:local` en `npx wrangler pages dev --port 8788`.
- Browsertests met Playwright (scripts in je scratchpad, niet in de repo):
  - `const { chromium } = createRequire(import.meta.url)('playwright')` (ESM-import vindt het niet).
  - Wereld resetten: `POST /api/admin/reset` met header `x-admin-key: verander-mij`; spelers via `/api/register`.
  - Toestand aanpassen: `npx wrangler d1 execute rijken-db --local --command "UPDATE towns SET state = json_set(...)"`.
    Let op: `json_set` op `$.terr.…` werkt pas als `terr` al bewaard is (doe eerst een actie, bv. `POST /api/villagers`),
    anders maakt SQLite een half `terr`-object en loopt de stad vast.
  - Alles verkennen: `terr.ex` = `exEncode(new Uint8Array(Math.ceil(T_W*T_W/8)).fill(255))`.
  - In de pagina: `window.__app` (staat), `__app.views.town` / `.world` (canvas-weergaven, `selectArmy()`, `issue()`, …).
  - Trage gsm nabootsen: CDP `Network.emulateNetworkConditions` (zo werd het verspringen van troepen gevonden).
  - Video's van de gebruiker: `ffmpeg -i video.mp4 -vf fps=8,...` naar losse beelden en die bekijken.

## 6. Belangrijke ontwerpkeuzes en valkuilen

- **Deterministisch**: `sim.js`, `skirmish.js`, `fieldbattle.js` rekenen in browser en server exact hetzelfde.
  Geen `Math.random()` in gedeelde code.
- **Bevelen in je gebied** (`/field`): een lijst `ops` met het tijdstip van de tik; de server rekent tot dat tijdstip
  (niet tot 'nu'). Een leger = één verzoek met gezamenlijk tempo (`pace`), in formatie. Niet terugdraaien!
- **CPU-limiet ~10 ms per verzoek**: live veldslagen rekenen hooguit 30 tikken per verzoek.
- **D1**: één rij per stad (`towns.state` JSON). Schrijf enkel bij acties.
- Panelen die periodiek verversen: altijd `setHTML()` (anders flitsen ze en gaan klikken verloren).
- Iconen uit `icons.js`, geen emoji.

## 7. Wat er al gebouwd is (geschiedenis, nieuwste onderaan)

1. Basis: economie, gebouwen, troepen, wereldkaart, teams, chat, rapporten, ranglijst, beheer; automatische deploy.
2. Grafische opwaardering: licht, schaduwen, texturen, dag/nacht, deeltjes; SVG-iconen; perkament/hout-UI.
3. Vondsten rond de stad; eigen gebied met oorlogsmist, bos kappen, bronnen, everzwijnen, barbarenkamp + overvallen.
4. Vlottere beweging (meteen uitgevoerde bevelen), mooier terrein en figuren, AoE-achtige details.
5. Vijf volkeren met bouwstijl en elite-eenheden; gevechten met levenspunten en zichtbare slagen/pijlen.
6. Dubbelklik = alle troepen van een soort; grond bijkopen per lot; muren tegel per tegel; wachttorens.
7. **Live veldslagen** op de wereldkaart (zelf besturen of automatisch; verdediger krijgt melding).
8. Barbarenkampen eerlijker (echte aantallen zichtbaar, tragere en duidelijkere gevechten), daarna makkelijker gemaakt.
9. Selecteren zoals AoE: 1 klik = 1 troep (ook uit een groep), dubbelklik = soort, ingedrukt houden = heel leger.
10. Verspringende troepen opgelost (bevelen samen en op het tijdstip van de tik); leger loopt in formatie.
11. Stippellijn rond alle bouwgrond (ook loten); uitleg hoe je een extra bouwer krijgt.
12. **Android-app** (TWA, `android/`, APK op de site) en iPhone "Zet op beginscherm" (eigen icoon, volledig scherm).
13. Gsm liggend speelbaar (menu links, dunne balk, paneel van rechts); bouwmenu in te klappen ("Bouwen"-tabje).
14. Bij gekozen troepen enkel knoppen "Naar huis" en "Klaar" rechts onderaan (geen uitlegtekst).
15. Gekozen gebouw/muurstuk duidelijk (gouden rand + pijl); afbreken; **poorten** met deuren die opengaan.
16. Stad/kamp aantikken toont wanneer je legers er aankomen (klokuur + aftelling).
17. **Meldingen op je gsm** (Web Push + cron-worker `cron/`), aftelbalk met voorkeuze; Android-app 1.1 met meldingen
    (zelfde sleutel, installeert over 1.0). Het Cloudflare-token heeft daarvoor ook 'Workers Scripts: Edit' nodig.
18. **Belegeringen in de echte stad** (feedback: "het gevecht gebeurde op een open plek, was laggy en op 10 s gedaan, ik kon
    niets besturen; de verdediger verdedigt in zijn stad en reageert op de kant van de aanval, zoals Rome Total War").
    Nieuwe `fieldbattle.js` (raster, routes, opstelling, AI per kant, plein), `siegeview.js` (TownView in `battleMode`),
    bevelen met tik + wachtrij, server `FB.delay` achter. Muurstukken worden nu als afbeelding gecachet (ook sneller in de stad).
19. Belegering vlotter na een echte test van de gebruiker ("troepen wilden niet verplaatsen bij de opstelling, aanval chaotisch"):
    oorzaak = een tik tussen je eigen troepen koos een andere troep, en tikken buiten de smalle strook deed niets zichtbaars.
    Nu: met troepen gekozen is een tik op een gsm altijd een bevel; opstelgebied breder, met rand, op een open veld (bos
    voor de muur gekapt); melding bij tikken buiten het gebied; samen lopen in het tempo van de traagste; minder
    wisselen van doelwit en minder duwen; verdedigers blijven binnen tot er een bres is; geen ×n-labels meer.
    Peilen 0,6 s, bevelen 0,2 s vertraagd, correcties glijden bij. Getest met echte tikken (Playwright, aanraakscherm)
    en twee spelers met 600–900 ms vertraging: beide zien exact hetzelfde, geen sprongen (scripts: taps/duo in scratchpad).
20. **Oefenslag** op de wereldkaart (kaartje 'Oefenslag'): 30 tegen 30 tegen de computer, als aanvaller (oefendorp) of
    als verdediger (eigen stad), zonder gevolgen. Gevraagd door de gebruiker om te testen zonder te marcheren.
    Fout opgelost: puin van een muur op een tegel met negatieve coördinaten brak het tekenen van de rest van het beeld.
21. Poorten 2 tegels breed (gevraagd door de gebruiker); oude poorten automatisch verbreed. In een belegering valt een
    poort in zijn geheel. Oefenslag: de computer krijgt een kleur die duidelijk verschilt van de speler.

22. **Veel grafischer** (gevraagd: "troepen, gebouwen, terrein, kaart veel grafischer en gedetailleerder"):
    - Wereldkaart (`worldmap.js`): vloeiend landschap i.p.v. blokjes. `worldgen.fieldAt` geeft hoogte/vocht op elk punt
      (tegels blijven identiek), het reliëf wordt kolom per kolom getekend (voxel space) met licht, slagschaduw van bergen,
      sneeuw, stranden, schuim, dichte bossen, akkers en wegen (A*) rond steden. Eén keer gebakken (±0,5–1 s).
    - Gebouwen (`art.js`): gekapte stenen, planken, kalk met bakstenen, bolle dakpannen met mos, donkere omlijning
      (gebouw apart getekend, dan `outline()`; de aangestampte grond eronder krijgt geen rand).
    - Troepen (`figures.js`): volume (licht/schaduw per sprite), mantel/pluim in teamkleur, laarzen, schouderstukken,
      paardendeken. In het spel `FIG_K` = 1,15× groter; kaartjes in het menu geven `thumb: true` mee (blijven gelijk).
    - Stad: meertjes met vloeiende oevers (`lakeImage`), fijne sprietjes over de grond bij inzoomen (`drawGroundDetail`,
      op gsm pas vanaf zoom 1,8). Poorttorens worden gecachet (`gatePart`): `A.box` met textuur is duur, nooit per beeld.

23. **Stad nog mooier** ("10 keer zo mooi"): `towndress.js` = aankleding van de stad. Eén grondafbeelding (kasseistraten
    met stoeprand vanaf tijdperk 2, paadjes van elke deur naar de straat via BFS, erven, moestuintjes, zachte donkere voet,
    vervaagde slagschaduwen) die mee in `groundLayer` gaat (één `drawSub` per beeld), en losse spullen op vrije tegels
    (lantaarns met gloed 's nachts, put, banken, fruitbomen, struiken, bloembedden, tonnen, kisten, hooi, karren,
    houtstapels, hekjes, vogelverschrikkers), afhankelijk van het gebouw ernaast. Alles deterministisch, opnieuw gemaakt
    als `dressKey` verandert. Kleine gebouwen 1,12× groter (`bScale`), huizen in 3 tinten (`buildingSprite(…, id)`) en met
    eigen details per volk (`houseCiv`). Warme sfeer + vignet overdag (`FX.grade`, niet op gsm).
    Let op: spullen-afbeeldingen hebben per soort een krappe omkadering en een resolutie volgens de zoom (anders traag).

24. **3D zoals Age of Empires** (gebruiker: "ik wil graphics zoals in Age of Empires"): gebouwen, muren, poorttorens en
    troepen zijn nu vooraf gerenderde 3D-modellen uit een eigen straalvolger (`render3d.js`, `models3d.js`, `figmodels.js`,
    `sprite3d.js`, `render-worker.js`). Eigen ontwerpen, geen kopie van AoE. Ruwweg 15–150 ms per gebouw en ±20 ms per
    figuurbeeld in een worker; daarna bewaard in de browser. Lichtrichting = die van de schaduwen in de stad.

25. **Vrede per speler** (gevraagd: "vrede maar 24 uur nadat iemand begint, geen 3 weken; daarna eender wanneer
    aanvallen"). Geen gezamenlijke vredestijd meer (fase is enkel nog `lobby`/`war`/`ended`). Beheer: "Vrede per speler
    (uren)" en "Lengte seizoen (dagen)".

## 8. Bekende beperkingen en ideeën

- Belegering: aanvallers hebben geen ladders of belegeringstorens; kapotte muren blijven na de slag gewoon heel in de stad.
- Aanvallen wachten niet tot de aanvaller online komt (zie §3); er is nu wel een melding + aftelling. Mogelijke
  uitbreiding: een wachttijd voor de stad tot de aanvaller online komt.
- Headless Chromium meldt meldingen altijd als 'geblokkeerd': de echte inschrijving is niet in de container te testen
  (de versleuteling is wel nagekeken met `http_ece` en zit in de tests).
- Dubbele muurringen: de route via poorten kijkt enkel naar de binnenste gesloten ring.
- Een echte iPhone-app (App Store/TestFlight) vraagt een betaald Apple-ontwikkelaarsaccount en een Mac.
- De APK-sleutel (`android/keystore/rijken.jks`) staat niet in git; zonder die sleutel kan een nieuwe APK enkel na
  het verwijderen van de oude app (en een nieuwe vingerafdruk in `public/.well-known/assetlinks.json`).
