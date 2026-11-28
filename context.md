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
  Daarna kan je **van clan wisselen** (verlaten, toetreding vragen, uitgenodigd worden; max. 4 leden), **privéberichten** sturen
  en een bondgenoot **verraden** (aanvallen terwijl hij nog in je clan zit). Zie §7 punt 61.
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
- Dorpelingen werken op **werkplekken** (stadscentrum + boerderij/houthakkerskamp/steengroeve/goudmijn per niveau), of als
  **vissers** op de bootjes van het havenhuis (vanaf het Brons, aan de vijver; sneller voedsel dan de boerderij).
  Opslag (stadscentrum + opslagplaats) begrenst je voorraad; een deel is verborgen voor plunderaars.
- **5 tijdperken** (gevraagd: "5 tijdperken met namen, upgrades per tijdperk en een paar nieuwe gebouwen"):
  Vuursteen → Brons → IJzer → **Gilden** → **Kroon** (stadscentrum verbeteren; IJzer = kasteel). Vroeger was Kroon het 4e;
  wie in tijdperk 4 zat, ziet nu "Gilden". Een actieve speler haalt de Kroon rond dag 11–16 van 28.
- **Niveau N vraagt tijdperk N** (`levelAge`): bijna alle gebouwen gaan tot niveau 5 (vroeger 3). Uitzondering: de Academie
  (`levelAges` [3, 4, 5]). Niveaus 4–5 zijn zichtbaar (vaandels, gouden piek en voetband; huizen een aanbouw en een torentje).
- **Bouwers**: 2 tegelijk, 3 vanaf het IJzertijdperk, +1 met een bouwloods (`maxBuilds`); de bouwloods bouwt ook 5%/niveau sneller (`buildTime`).
- **Groottes**: stadscentrum, kazerne, schietbaan, stal, markt, belegwerkplaats, Academie, gildehuis en bouwloods 2x2;
  monument 4x4; de rest 1x1 (zie 66).
- **Gebouwen**: stadscentrum, huis, boerderij, houthakkerskamp, steengroeve, goudmijn, opslagplaats, kazerne, stadsmuur
  (tijdperk 1); schietbaan, stal, smidse, markt, wachttoren, **molen** (+5% voedsel/niv.) (2); belegwerkplaats, **Academie** (3);
  monument, **gildehuis** (+3% alles/niv.), **bouwloods** (4); **Adelshof** (edelmannen), **kathedraal** (trouw +1/u per niveau,
  600 punten/niv.) (5). Productiebonussen: `boost()` in `sim.js`.
- **Smidse**: +5% aanval/verdediging per niveau én het uitzicht van alle soldaten (`gearOf`: leer en brons, ijzer en maliën
  vanaf niveau 3, plaatharnas op 5).
- **Academie** (gevraagd: "onderzoek naar betere wapens, zichtbaar per upgrade"): `TECHS` in `rules.js`, 4 soorten
  (voetvolk, schutters, ruiterij, stad) × 3 rijen. Geen ruwe kracht maar vaardigheden: schildmuur, krijgsdrill, strijdkreet,
  vuurpijlen, taxusboog, pijlenregen, hoefijzers, lansen, flankrit, kokende pek, torenkruisbogen, ijzerbeslag. Eén onderzoek
  tegelijk (`s.research`, klaar in `advance()`), voorgoed (`s.tech`). Werkt in de live slag (`st.tk`, `TK()` in
  `fieldbattle.js`) en als kleine bonus in de automatische slag (`auto` → `techMods` in `battle.js`). Zichtbaar: `troops.js`
  (groot schild, gouden pluim, vuurpijlen, lange boog, kleed, lans, ...) en de Academie zelf (variant = afgewerkte soorten).
- **Edelman, trouw en vazallen** (gevraagd: "edelmannen zoals Tribal Wars, maar toegankelijk; ook bij andere spelers"):
  edelman in het Adelshof (één per niveau, één tegelijk in opleiding). Trouw 0–100 (`s.loy`, herstelt 2/u + kathedraal).
  Een gewonnen aanval met een levende edelman: −25 per edelman (`applyNobles` in `functions/lib/vassal.js`). Bij 0 is de stad
  3 dagen **vazal** (tabel `vassals` + `s.vas`): schatting (20% van de productie om de 6 u, karavaan `kind = 'tribute'`),
  heer en vazal vallen elkaar niet aan (maar helpen mag), de heer krijgt 20% van de punten van de vazal, een bot-vazal stuurt
  zijn heer versterking. Vrij: na 3 dagen, met losgeld (`/vassal/ransom`), of als een clanlid de heer verslaat. Daarna 24 u
  beschermd. Max. 2 vazallen; niet tegen steden met < 45% van je punten. Sterke bots gebruiken edelmannen (vanaf ± week 3).
  Niemand verliest zijn stad (één stad per speler blijft).
- **Afbreken**: elk gebouw behalve het stadscentrum; een kwart van de kosten terug (de helft van een lopende bouw).
  Niet als er nog getraind wordt. Werkers boven de nieuwe plaatsen worden vrij.
- **Ontslaan**: soldaten en dorpelingen die thuis zijn; plaats in de bevolking vrij, een kwart van de kosten terug; minstens
  5 dorpelingen blijven over (zie §7 punt 63 en 67).
- **Vondsten**: af en toe een schaap/eik/rotsblokken/goud rond je stad; een dorpeling oogst ze (`BONUS`).
- **Karavanen** (markt, naar bondgenoten): max. 1000 per marktniveau, en naar eenzelfde speler **één karavaan per 8 uur**
  (echte tijd, ook voor bots; zie §7 punt 69).

**Oorlog moet lonen** (gevraagd: "aanvallen loont niet: 120 dorpelingen brengen veel meer op dan plunderen"; `WAR` in
`rules.js`): troepen dragen meer naarmate het tijdperk van de aanvaller stijgt (`carryMult`: ×2 Vuursteen … ×4 Kroon), wie
de slag wint krijgt **krijgsbuit** = 30% van de kosten van de gesneuvelde vijanden (`bountyOf`; aanvaller: mee naar huis
bovenop de buit; verdediger die standhoudt: meteen in zijn opslag; ook bij roverskampen), gevechtspunten ×2 (1 per 25
waarde, kampen 1 per 50) + 1 punt per 250 geplunderde grondstoffen. Roverskampen (wereldkaart) ×1,4 en het barbarenkamp
×2 buit. Regel: per plaats in de bevolking brengt een plunderende soldaat (4 u heen en terug) minstens zoveel op als een
dorpeling (test). De verborgen voorraad (opslagplaats) blijft het tegengif.

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
- **Mist rond je stad** (gevraagd: "geen mist binnen je eigen muren"): je ziet altijd je bouwgrond (vierkant, gekochte
  loten, gekapt bos), je muren en alles erbinnen, plus een rand van ±3 tegels (`homeSight` in `sim.js`, `FIELD.homeSight`).
  Daarbuiten begint de mist; meestal dus net voorbij je muur.
- **Bouwgrond**: een vierkant van 12×12 dat met elk tijdperk een ring groeit, plus **gekochte loten** van 4×4
  (max. 12, steeds duurder) en gekapte tegels. Een stippellijn toont de rand van al je bouwgrond.
- **Barbarenkamp**: 4 barbaren in tijdperk 1, 6/8/10 later, en het **groeit elke speldag** dat je het met rust laat
  (+35% per dag, tot 3×). Barbaren vallen meteen aan wie binnen 3,4 tegels komt. Ongeveer evenveel soldaten als
  barbaren winnen. Na verwoesten: buit (× de groei) en 36 u geen kamp; daarna begint het weer klein. Het aantal staat
  boven het kamp, de groei en de kans op een overval in het stadsoverzicht.
- **Overvallen op je dorp**: om de 2 u een kans (2% + 6% per dag dat het kamp groeit, hooguit 40%), nooit binnen 10 u
  na de vorige; in een nieuwe stad pas na 30 u. Grootte 3 + 2,5 per tijdperk, × de groei (max. 60). Bij het begin een
  melding (gsm: 'aanval op je stad') en **15 minuten** (echte tijd) om te kiezen: zelf verdedigen (live slag in je stad,
  enkel met soldaten thuis) of automatisch (`resolveBattle` met muur, torens en dorpelingen). Niets kiezen = automatisch.
  Gemeten (tijdperk 3, kamp nooit aangevallen): 1e overval rond dag 1,8 met ±17 barbaren, daarna om de ±19 u, na een
  week om de ±13 u met 32 barbaren.
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
     ook met het spel dicht), niet enkel in het spel. De cron-worker draait sinds 25/11 (het token heeft nu 'Workers Scripts ·
     Edit'); zonder dat recht gaan meldingen enkel uit als iemand het spel open heeft. Daarnaast in het
     spel een **aftelbalk** vanaf 120 s waar je al kiest. Vooraf 'zelf besturen' + verdediger offline → de slag begint meteen;
     vooraf 'automatisch' + verdediger offline → meteen uitgerekend.
  4. Live slag = **belegering in de echte stad** van de verdediger (of een open plek met tenten bij een roverskamp):
     eerst een **opstelling** (max. 75 s, tot beide op Start drukken), dan de slag (max. 10 minuten). De aanvaller staat
     aan de kant van zijn eigen stad; de verdediger zet schutters op de muur en voetvolk achter de poort aan die kant.
     Aanvallers kunnen niet door poorten of over muren: rammen (of voetvolk) slaan een bres. Winnen: alle verdedigers
     verslaan of op de vlucht jagen, of het plein voor het stadscentrum 30 s houden. Een slag duurt ±1–3 minuten.
     **Zoals Rome: Total War** (gevraagd door de gebruiker): troepen vechten in **regimenten** (hooguit 12 figuren per kaartje)
     met een **vaandel** (soort, aantal, levens, moed). Ze lopen als één blok in **formatie** (Linie, Blok, Wig, Los, Kring),
     houden hun richting aan en vechten samen. 1 tik = dat regiment, 2 tikken = alle van die soort, ingedrukt = heel leger.
     Tik op de grond = in formatie erheen (meerdere regimenten in slagorde: voetvolk vooraan, schutters erachter, ruiters op
     de flanken); **lijn trekken** (rechts slepen, gsm: knop Lijn) = richting en breedte. Flank/rug en stormloop doen meer
     schade. **Moed**: wie zwaar verliest of omsingeld wordt, vlucht (witte vlag) en hergroepeert na rust; vlucht een heel
     leger, dan is de slag verloren. Kijkt niemand meer (30 s), dan rekent de server de rest automatisch uit.
  5. **Replay** (gevraagd: "als een gevecht automatisch verliep, achteraf een replay van hoe de oorlog ging, zonder zelf te
     besturen; 24 uur beschikbaar"): elke automatisch uitgerekende slag (stad, roverskamp, overval van de barbaren) kan je 24 uur
     lang naspelen via 'Bekijk de replay' in het rapport (of 'Replay' in het logboek bij een overval). De computer leidt beide
     legers in de echte stad; de slag wordt bijgestuurd zodat de winnaar en de verliezen kloppen met het rapport.

**Computerspelers (bots)** (gevraagd: "bots die als echte spelers hun stad uitbouwen en je na je 24 uur vrede aanvallen,
in eigen clans die samenwerken"): standaard 4 bots in clans van 2 (beheer: aantal 0–12 en niveau makkelijk/normaal/sterk).
Ze bouwen hun stad uit zoals een actieve speler (± tijdperk 2 na 1 dag, 3 na 2,5 dagen), zetten een muur met 4 poorten en
torens, trainen een leger, plunderen roverskampen en vallen spelers aan zodra hun vrede voorbij is en ze denken te winnen
(normaal: per bot hooguit om de ±6 uur, en elke stad krijgt ±9 speluren rust na een aanval van een bot; een clan valt soms
samen aan). Clanleden sturen elkaar versterking bij een aanval en grondstoffen als iemand spaart voor een nieuw tijdperk.
Op de kaart, bij een stad en in de ranglijst staat "computer" met hun sterkte. **Balans** (gevraagd: "bots te sterk; zorg voor een
goede balans t.o.v. de echte spelers, wat mindere en wat sterkere bots"): elke bot is zwak, gemiddeld of sterk en groeit enkel
tot een doelscore t.o.v. de actieve echte spelers (zwak ±70% van de mediaan, gemiddeld de mediaan, sterk zo goed als de beste);
bots vallen geen veel zwakkere speler aan (< 45% van hun score), tenzij uit wraak. Een speler die stopt, laten ze met rust.
**Doelwit en clanaanvallen** (gevraagd: "bots vallen echte spelers aan na hun 24 u; niet wie dubbel zo sterk is, eerder wie
gelijkaardig is; als team gecoördineerd, elke bot een aanval met ±10 minuten verschil"): alleen tegen 0,45–1,5× hun score
(liefst rond 1), samen tot 1,9×. Tegen wie minstens 0,8× zo sterk is (of als het alleen niet lukt maar samen wel) valt de
clan in golven aan: elke bot één leger, telkens 10 speelminuten na elkaar. Sinds de cron-worker draait, komt er ook elke
minuut een bot aan de beurt als niemand online is.

**Punten**: opbouwpunten (gebouwen, onderzoek, dorpelingen, troepen; monument +1500/niveau, kathedraal +600/niveau)
+ 20% van de punten van je vazallen + gevechtspunten.

## 4. Werkwijze en omgeving

- Branch: die van je eigen sessie (zie de systeemprompt, bv. `ccr-0d5eaa85-zrgdzp`). Push → GitHub-actie test,
  cherry-pickt naar `main` en zet alles online (±1–2 min). Controleer met `curl` dat een nieuw stukje code op de site staat.
- `git merge --no-edit origin/main` geeft vaak conflicten omdat main uit cherry-picks bestaat. Is de inhoud gelijk
  (`git diff HEAD origin/main` leeg), gebruik dan `git merge -s ours --no-edit origin/main`.
- **Bij elke volwaardige update een nieuwsartikel** in `public/js/updates.js` (gevraagd: "per volwaardige update of verandering
  een artikel, zodat spelers op de hoogte blijven"). Zie CLAUDE.md › "Zo komt een wijziging online".
- Geen toegang tot de echte database of Cloudflare vanuit de sessie: bugs reconstrueren met lokale tests.
- Android SDK (voor de APK) zit niet standaard in de container: zie `CLAUDE.md` › Android-app
  (`commandlinetools` van dl.google.com, `sdkmanager "platforms;android-35" "build-tools;35.0.0"`).

## 5. Testen

- `npm test` (Node test runner, `tests/game.test.js`, ±60 tests): simulatie, gevechten, gebied, muren/poorten,
  afbreken, belegeringen (determinisme na JSON heen en terug, opstelling, AI, bres), meldingen (met `node:sqlite`).
- Belegering zonder browser: maak een stad met `newTownState` + muren/poorten en speel `createBattle` + `stepTo` af
  (beide kanten AI) om duur en verloop te controleren. Handig: snapshots (`units`, `regs`, `walls`) bewaren en ze in Chromium
  als bovenaanzicht tekenen (raster + stippen per soldaat + vaandel met toestand en moed): zo zie je meteen wie vastloopt.
  Determinisme: dezelfde slag in het geheugen én telkens via JSON afspelen, met bevelen, en vergelijken.
- Twee spelers met vertraging: geef beide steden troepen (`json_set` op `$.units`), stuur een aanval via `/api/march`, zet
  `marches.arrive_at` vlak in de toekomst, laat beide pagina's peilen (`visibilitychange`) en kies 'Zelf besturen'. Meet per beeld
  de verplaatsing (sprongen) en vergelijk beide schermen. Wereldsnelheid hoog zetten werkt niet: dan overvallen barbaren alles.
- Een oefenslag blijft 30 s lopen nadat je ze verlaat: gebruik voor elke test een nieuwe speler.
- Bots testen: zet `world.start_at` (en `players.created_at`/`towns.state.t` van de bots) in het verleden en roep `botTick` vaak op
  (of laat een speler `/api/state` peilen); `players.bot_next = 0` maakt een bot meteen weer aan de beurt.
- Lokaal spel: `npm run db:init:local` en `npx wrangler pages dev --port 8788`.
- **Rekentijd op de server meten**: een proefwereld in `node:sqlite` (alle migraties) met echte spelers (`/register` +
  `botEconomy` om steden uit te bouwen) en bots (`ensureBots` + vaak `botTick`), dan `handle({ request, env, waitUntil })` per
  route; CPU = `process.cpuUsage()` min de tijd in SQLite. Koud = één verzoek in een vers Node-proces. Reken op ±25 ms voor
  het eerste verzoek in een koude isolate (JIT); warm moet elk verzoek ruim onder 10 ms blijven.
- **Snelheid meten** (scripts in je scratchpad, zoals bij punt 45 in §7): een uitgebouwde stad maak je in Node met
  `newTownState` + `advance` + `botEconomy` (8 dagen) en zet je met `wrangler d1 execute --file` in de lokale database.
  Meet koud (nieuw profiel) en warm (herladen), daarna stilstaan/pannen/zoomen via `requestAnimationFrame`-tijden;
  gsm = `Emulation.setCPUThrottlingRate` 4 + `Network.emulateNetworkConditions` (150 ms). Kost per onderdeel: omwikkel
  de `draw…`-methodes van `__app.views.town` met een `getImageData(0,0,1,1)` ervoor en erna (dwingt het tekenen af).
  `town.workMs` = JS-tijd van het laatste beeld. Let op: het hulpvenster opent bij elk nieuw profiel en vertekent de
  meting (zet `rvs-intro-…` in localStorage); de container heeft 4 kernen (`LOW_POWER` aan) en geen GPU: het vullen
  van pixels weegt hier veel zwaarder dan op een echte gsm. Vergelijk beelden pixel voor pixel (bv. `ground.cv`,
  `bakeInfo.cv` als PNG) om zeker te zijn dat een versnelling niets aan het uitzicht verandert.
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

26. **Veldslagen zoals Rome: Total War** (gevraagd: "manueel gevecht doorlopen tot alles vlekkeloos is, formaties instellen").
    Nieuwe kern in `fieldbattle.js`: regimenten met formaties, vaandel en één route per regiment (voorheen liep elke soldaat los en
    zocht elk zijn eigen route: chaotisch, gemengde groepen kropen aan rammentempo, soms vastgelopen), slagorde voor groepen,
    lijn trekken, flank/rug/stormloop, moed en vluchten, formaties blijven aan de juiste kant van de muur. De computer stuurt
    ook regimenten (rammen op de poort, voetvolk in slagorde ervoor, ruiters wachten op een bres). Browser: vaandels, plaatsen
    waar een regiment komt te staan, formatieknoppen, minder schokjes bij elke peiling (oude en nieuwe stand op hetzelfde moment
    vergeleken), kleinere antwoorden (`have`). Getest: computer tegen computer (open, ommuurd, kamp, groot leger), pc en gsm
    (rechtop/liggend, aanraakscherm, trage processor), twee spelers met 300–450 ms vertraging (verschil < 0,3 tegel, geen sprongen).

27. **Computerspelers (bots)**: `botbrain.js` (economie) en `bots.js` (beurten, leger, clan). Getest met een hele wereld in Node
    (4 dagen met een nepklok via de echte routes: groei, aanvallen op een speler, versterking, karavanen, kampen) en het
    inhalen van 3,2 dagen in een lopende wereld (±90 beurten, ±30 min met één speler online; beurt ≤ 4,4 ms en ≤ 14 query's).
    Tip: `node:sqlite` in het geheugen + alle migraties + `handle()` met een eigen `Date.now` = een snelle proefwereld.

28. **Balans van de bots** (zie §3): `BOT_TIERS`/`botTarget` in `botbrain.js`, `humanRef` in `bots.js`, migratie `0006`.
    Simulatie (5 dagen: een actieve, een gewone en een gestopte speler + 4 bots): sterk ±880 tegen de beste speler 843,
    gemiddeld ±760 tegen de mediaan 732, zwak ±430; de gestopte speler werd nooit aangevallen, de gewone 5 keer.

29. **Vijf tijdperken, nieuwe gebouwen, Academie, edelmannen en vazallen** (zie §3). Regels in `rules.js`/`sim.js`,
    vazallen in `functions/lib/vassal.js` + migratie `0007`, 3D-modellen in `models3d.js` (molen, Academie met varianten,
    gildehuis met trapgevel, bouwloods met kraan, Adelshof, kathedraal; paleizen per volk op stadscentrum niveau 5),
    getekende versies in `art.js`, troepen in `troops.js` + `figures.js`/`figmodels.js`, vuurpijlen en kokende pek in
    `siegeview.js`. Tests: tijdperken, productie, bouwloods, onderzoek, automatische en live slag, edelman en een hele
    vazalcyclus via de echte routes (onderwerpen, schatting, geen aanvallen, ranglijst, bevrijding, bescherming, losgeld, na 3 dagen vrij).
    Tempo (botbrein, zeer actief): IJzer dag 2,6, Gilden dag 6,3, Kroon dag 11,2.

30. **Mist en pijlen** (feedback van de gebruiker met een screenshot op de gsm): de mist begon in een vast vierkant
    (bouwring + 3), waardoor gekochte loten en gekapt bos binnen je muren in de mist lagen. Nu volgt ze je echte bouwgrond
    en muren (`homeSight`, gedeeld: `exploredNow` en `updateFog` gebruiken ze). Pijlen waren op een iPhone niet te zien
    (1 dun donker streepje, bij uitzoomen en lagere resolutie < 1 pixel): nu `A.shot` in `art.js` met lichte rand, spoor
    en een schaal `1 / zoom` bij uitzoomen, in de belegering (`siegeview.js`) en in gevechten in je gebied (`town.js`).

31. **Troepen scherp en gedetailleerd, routes rond water en muren** (gevraagd: "troepen veel gedetailleerder, ingezoomd
    wazig; niet over water of door muren, naar buiten via de poort"). Figuren in meerdere resoluties (tot 6 px per
    wereldpixel bij inzoomen) met anti-aliasing; modellen met gezicht, kledij, maliën, harnas, schild met embleem, echte
    wapens, schede, pijlkoker en een paard met tuig. Renderer 2–4× sneller (exact hetzelfde beeld voor gebouwen).
    Routes in je gebied met A* (`routeTo`), ±0,05 ms per route; ook de dorpelingen in de stad.

32. **Idee: haven, boten en eilanden** — uitgewerkt in `docs/idee-haven.md`, **nog niet gebouwd** (wacht op de keuzes
    van de gebruiker, zie de open vragen onderaan dat bestand).

33. **Omgeving even mooi als de gebouwen** (feedback met screenshot: "mooie houthakkershut, maar de stronken ernaast
    zijn alles behalve mooi; ook de kar en tonnen naast de mijn"): alle aankleding, rotsen, goud, stronken, bomen, schapen,
    everzwijnen en het barbarenkamp zijn nu 3D-modellen in dezelfde stijl (`propmodels.js`), met slagschaduw, gladde randen
    en scherpe versies bij inzoomen. Renderer: anti-aliasing met grondschaduw, materialen `leaf`, `bark`, `water`.
    Nog getekend: de akker, het water/de vijver, kameel/strijdwagen/olifant en rammen.

34. **Wat een verbetering oplevert** (gevraagd: "er staat enkel 'verbeteren' en de prijs; toon wat het verbetert, zodat
    de speler weet of het de moeite waard is"): het verbeterpaneel (en de lopende bouw) toont "Wat levert het op?" met
    nu → straks (`gainsHtml` in `ui.js`). Het rekent de stad uit met het gebouw één niveau hoger, met dezelfde functies als
    de simulatie (`popCap`, `capacity`, `slots`, `rates`, `maxBuilds`, `townBaseDef`, `towerDefense`, `townScore`, …), en
    toont per soort: werkplekken en productie als ze bezet zijn, trainingstijden en nieuwe eenheden, smidse, markt,
    torens, muren (`wallHp`), molen/gildehuis, bouwloods, academie (nieuwe rij), punten. Plus een tip of het nu zin heeft
    (vrije werkplekken, bevolking in gebruik, voorraad t.o.v. opslag, muur nog open).

35. **Scherp en gedetailleerd terrein in de stad** (feedback met screenshot op de gsm: "gebouwen en figuren zijn goed,
    maar het terrein loopt achterop; veel mooier, scherper, gedetailleerder"). De grond was één afbeelding op 1,25 px per
    wereldpixel (op een gsm ingezoomd 6–8× uitvergroot). Nu tekent de stad ingezoomd het zichtbare deel opnieuw in stukken
    op schermresolutie (tot 6 px per wereldpixel, ook op gsm; `groundhd.js`). Nieuw: plein met kasseien in kringen (bolle
    stenen met schaduwkant en glans, sierringen, mos in de voegen), straten met kinderkopjes in verband en een stoeprand,
    stapstenen op de paadjes, moestuintjes met ruggen en plantjes (kool, sla, bonen, pompoen), grind op de aardewegen,
    fijne grasprietjes/bosbodem/aarde-texturen per resolutie en een fijne korrel over alles. Tijd per stuk in headless
    Chromium (zonder GPU) 15–50 ms; op een toestel met GPU sneller.

36. **Alles scherp, terrein nog mooier** (gevraagd: "alles moet scherp zijn, maak het terrein nog veel mooier").
    Gebouwen, muren en torens krijgen scherpe versies bij inzoomen (zoals de figuren; 6x van een stadscentrum duurt in een
    werker enkele seconden, daarna bewaard in de browser), poortbogen en 2D-stukken volgen de zoom. De boerderij is nu een
    3D-model. Meren scherp in de HD-stukken. Terrein: zacht reliëf met warm licht en koele schaduw, sappige plekken, veel
    meer wilde bloemen in groepjes, grasplukjes met echte sprieten, extra fijn gras van dichtbij, stenen met mos, kiezels
    op de vijveroever, struiken en varens met echte blaadjes.

37. **Aanvalsbewegingen** (gevraagd: "bij gevechten zie je ze hun wapens niet gebruiken; speren moeten steken, zwaarden
    slaan, bogen aanspannen en schieten"). Nieuwe modus `atk` voor de 3D-figuren (en een eenvoudige 2D-terugval), in de
    maat van de echte slagen: zwaard omhoog achter het hoofd en neer, speer terugtrekken en stoten (schild omhoog), boog:
    pijl uit de koker, op de pees, spannen en loslaten op het moment van het schot, lans neer en stoten, werpspeer, bijl;
    wijde stand in het gevecht. Getest in een oefenslag op pc en gsm (ook schutters op de muur).

38. **Gebouwen verplaatsen** (gevraagd: "door een gebouw ingeduwd te houden kan je het verplaatsen"). Ingedrukt houden op
    een gebouw pakt het op; slepen toont het doorschijnend met een groene (mag) of rode (mag niet) voet, de kaart schuift mee
    aan de rand; loslaten zet het neer. Gratis, enkel op vrije bouwgrond; het stadscentrum blijft in het midden. Ingedrukt
    houden naast een gebouw kiest nog altijd je hele leger. Op pc ook via de knop Verplaatsen. Getest met muis en echte
    aanraking (gsm), ook na herladen (de server bewaart het).
    **Aangepast** (feedback: "inhouden lukt niet op mobiel, selecteert mijn leger"): geen lang indrukken meer. Knop
    **Verplaatsen** bovenaan in het gebouwpaneel; dan tikken op de nieuwe plek of het gebouw verslepen, en 'Zet hier'
    (met een muis: klikken zet het neer). Balk bovenaan met 'Zet hier' / 'Stoppen'. Lang indrukken = enkel het leger.

39. **Elk gebouwniveau ziet er anders en beter uit** (gevraagd: "nooit hetzelfde, bv. houthakker 2 → 3; elk tijdperk aparte
    visuals"). Alle niveaus gerenderd en per stap gemeten: goudmijn en werkplaats waren op elk niveau identiek, markt na 2,
    steengroeve, boerderij 3-5, smidse, houthakker, opslag, stal, kazerne amper. Nieuwe modellen met één opbouw (riet → pannen
    → leien + extra bouwsel → aanbouw + vaandels → toren/goud) en zichtbare extra's per niveau; ook de daken van de volkeren
    volgen het niveau, en de eigen stadscentra van de volkeren hebben extra's op niveau 4 en 5. Nu minstens ±15% verschil per
    stap bij alle gebouwen en volkeren (meestal 25-70%). `VERSION` 7: de browser rendert de gebouwen één keer opnieuw.

40. **Muren en poorten verplaatsen** (gevraagd: "op dezelfde manier als gebouwen"). Tik op een muurstuk: bovenaan het paneel
    'Dit muurstuk' of 'Rechte muur (N)' (het hele rechte stuk, poorten gaan mee); op een poort: 'Poort verplaatsen' (de oude
    opening wordt muur). Dan tikken of slepen en 'Zet hier' (muis: klikken). Gratis; vrije bouwgrond; poorten blijven in een
    recht stuk muur; nooit dicht zonder poort. Getest op gsm (aanraking) en pc, ook na herladen.

41. **Wachttoren en andere gebouwen: nieuwe onderdelen per niveau, niet enkel groter** (gemeld: "Griekse wachttoren 2 → 3
    geen verschil"; de %-meting zag 'hoger' als verschil, het Griekse dak ontbrak). Wachttoren, molen, adelshof en kathedraal
    opnieuw gemaakt met per niveau iets nieuws (zie CLAUDE.md), Grieks stadscentrum 5 met verguld dak en beelden, gildehuis 1
    in vakwerk en riet. Alle volkeren nagekeken in overzichten. `VERSION` 8.

42. **Kleine gebouwen achter een groot gebouw kiezen** (gemeld: "achter het stadscentrum kan je ze niet selecteren, en dat
    kan ik niet verplaatsen"). Kiezen gaat nu op de pixels van het beeld; nog eens tikken op dezelfde plek = het gebouw
    erachter; het paneel toont 'Ook op deze plek' met knoppen (handig op een gsm); het gekozen gebouw wordt doorschijnend met
    een gestippelde gouden voet bovenop getekend als er iets voor staat. Een tip verschijnt hooguit 3 keer per toestel.

43. **Per volk: elk niveau ander materiaal en andere details, niet enkel groter** (gevraagd: "ander materiaal, evt. andere
    structuur, herwerk voor elk volk"). Muren volgen per volk een eigen reeks materialen (`CIV_WALL`: leem/riet → … → marmer,
    geglazuurde steen, goud) met eigen versiering (pilasters, hoekstenen, ronde hoeklijsten, lisenen, tegelbanden, rozetten,
    donkere balken); daken krijgen vanaf niveau 4 nokversiering per volk en op 5 goud. Open loodsen van Egypte, Babylon en
    Perzië kregen een plat dak in plaats van een leien zadeldak. Alle 6 volkeren nagekeken. `VERSION` 9.

44. **Fout: wachttoren 3 en 4 toonden de oude 2D-tekening** (gemeld met een schermafbeelding: "niveau 3 ziet er bij mij
    anders uit"). Het model gaf een leeg anker `glow` mee; de werker liep daarop vast en het spel viel terug op 2D. Opgelost
    in het model en in `render-worker.js` (lege ankers overslaan), plus een test die elk model van elk volk en niveau bouwt
    en de ankers nakijkt. Nagekeken in de browser: alle torens 1-5 in 3D.

45. **Snelheid: sneller laden en vlotter bewegen** (gemeld: "door alle visuele aanpassingen werkt het spel slomer, laadt
    en beweegt het trager; zorg dat het zeer efficiënt en vlot blijft"). Gemeten met een uitgebouwde stad (tijdperk 4,
    51 gebouwen, 71 soldaten, 90 dorpelingen), pc en gsm (CPU 4x trager, 4G):
    - Modules laadden in 9 rondreizen na elkaar → nu allemaal tegelijk (`modulepreload`), `/info` + `/state` al vanuit
      `index.html`.
    - 3D-beelden: de werker maakt ze af en bewaart ze; bij de start alles van vorige keer in één keer uit de cache.
      Warm starten: alle 3D klaar na ±4,7 s i.p.v. ±18,6 s op pc; stad zichtbaar na 0,96 s i.p.v. 1,4 s (gsm 4,5 i.p.v. 6,3 s).
    - De resolutie zakte door het trage laden blijvend naar 55-75% (ook op pc: wazig) → nu enkel bij echte traagheid,
      en ze gaat terug omhoog.
    - Bouwbalk en titel zonder `backdrop-filter`; achter een venster 5 beelden/s; grondstukken niet tijdens het slepen.
    - Miniaturen, 2D-bomen en scherpe grond niet meer bij het opstarten; korrels in één pad.
    - Wereldkaart wordt op de achtergrond gebakken: openen 0,4 s i.p.v. 1,3 s op pc.
    Gsm stilstaan 8 → 14 beelden/s, pannen 12 → 17,5 (4x vertraagd, zonder GPU). Alles pixel voor pixel nagekeken.

46. **Tabbladen Mijn leger en Bouwadvies** naast 'Bouwen' (gevraagd: "knop 'mijn leger' die toont hoeveel troepen je hebt en
    van welke types, en 'bouwadvies' met de gebouwen die nog geüpgraded kunnen worden; erop klikken brengt je naar dat gebouw;
    daar zie je ook of je bouwers bezig zijn en waaraan"). Zelfde strook als het bouwmenu: Mijn leger = totaal + een kaart per
    soort (thuis, in je gebied, onderweg/elders, +n in opleiding); Bouwadvies = bouwers (bezig/vrij, elke lopende bouw met
    aftelling) en de gebouwen die je in dit tijdperk nog kan verbeteren (groen omrand = kan nu; ×n = zoveel gelijke gebouwen,
    elke tik toont het volgende). Getest op pc, gsm (390 en 360 breed, ook met troepen gekozen) en liggend.
    Later (gevraagd: "waarom verschijnt [het havenhuis] nog niet in mijn advies"): het advies toonde enkel verbeteringen van
    gebouwen die je al had. Nu staan daarna ook de gebouwen die je in dit tijdperk mag zetten maar nog niet hebt (label
    'nieuw', 'nog te bouwen'); tik = meteen plaatsen (bij het havenhuis verschijnen dan de plekken aan het water).

47. **Paneel sluiten op de gsm** (gevraagd met een screenshot: "zorg dat deze menu's gesloten kunnen worden; bovenaan een breed
    pijltje naar beneden als knop, ter vervanging van de horizontale balk"). Het balkje was enkel versiering. Nu een brede knop
    met pijltje (liggend naar rechts) die bovenaan blijft staan bij het scrollen; tikken of naar beneden vegen sluit het paneel
    en laat het gekozen gebouw/stad/kamp los. Getest op gsm, liggend (915 en 844 breed), tablet, wereldkaart; pc ongewijzigd.

48. **Meldingen: bouwer vrij en aanval op je stad, apart aan/uit** (gevraagd: "notifications voor wanneer er een bouwer vrij
    is gekomen, en voor een binnenkomende aanval; beiden apart aan/uit"). Per toestel drie (sinds punt 59 vijf) schakelaars in 'Meldingen op je gsm'
    (stadsoverzicht en wereldkaart): aanval op je stad (meteen bij vertrek + ±2 min vooraf), een bouwer is vrij, je leger komt
    bijna aan. Getest met de echte routes (twee toestellen, één met aanval uit) en in de browser (pc en gsm).
    De gebruiker gaf het Cloudflare-token daarna het recht 'Account · Workers Scripts · Edit': sinds 25/11 staat de cron-worker
    `rijken-van-de-vallei-meldingen` online (elke minuut; deploylog: "✔ meldingen worden elke minuut verstuurd"). Zonder dat
    recht zouden 'bouwer vrij' en de ±2 min-melding pas uitgaan bij het eerstvolgende verzoek van eender wie.

49. **Oorlog loont, bots in golven** (zie §3): meer buit per tijdperk, krijgsbuit voor de winnaar, meer gevechtspunten;
    bots enkel tegen ongeveer even sterke spelers en clanaanvallen in golven van 10 minuten (cron-worker laat ook bots spelen).

50. **Android vlotter** (gemeld: "nog behoorlijk laggy, vooral op mijn Android-gsm; op iPhone vrij vlot"). Oorzaak die we
    zonder toestel konden vinden: Chrome op Android tekent op schermen van 90/120 Hz tot 2x zoveel beelden als Safari op een
    iPhone (die begrenst op 60), en Android-gsm's melden 8 kernen waardoor ze liggend de zware pc-instellingen kregen.
    Nu: hooguit ±60 beelden/s (`FX.Pacer`), Android altijd licht, ondoorzichtige canvassen, resolutie sneller omlaag op
    een aanraakscherm. Nog niet getest op een echt Android-toestel: vraag de gebruiker of het beter is.

51. **Ontdekkingen in de mist: gebouwd en weer weggehaald** (25/11). Op de vraag "niet genoeg te beleven in de fog of war"
    kwamen er 9 plekken per stad (schatten, ruïnes met relikwieën, uitkijkheuvels, reizigers, rovershol). De gebruiker vond dat
    "niet oké" en liet alles terug weghalen. Niet opnieuw toevoegen zonder het eerst te vragen. `ensureTerritory` ruimt de restjes
    op (`s.relics`, `s.terr.sites`, gevechten tegen 'den', tochten met opdracht 'site').

52. **Rozenwacht verplaatst** (gevraagd: "verplaats de 2 spelers van de Rozenwacht naar een andere random plek; nu zitten 5
    spelers veel te dicht bijeen"). Eenmalige opdracht `move-rozenwacht-1` in `ONE_OFF` (`relocate.js`, tot 27/11), uitgevoerd door
    de cron-worker binnen de minuut na de publicatie. Daarnaast een knop 'Clan verplaatsen' in `/admin.html`.

53. **Lag en "Ongeldig antwoord van de server" bij het aanmelden** (gemeld 25/11). Onderzoek met een proefwereld (16 steden,
    8 bots, 6 dagen bezig) in `node:sqlite` via de echte `handle()`, CPU zonder SQLite-tijd, warm en in een vers proces:
    - `/map` 13–18 ms CPU warm (koud ±49 ms), `/leaderboard` ±5 ms: ze rekenden elke stad volledig bij (`advance`), en dat
      bouwt telkens het gebied rond de stad op (`territory()`: 2–3,7 ms per stad, koud 13 ms). Nu `settleBuilds`: 2,8 en 1,4 ms.
    - `territory()` 2,4x sneller (vooraf-test in plaats van `Math.hypot` per tegel; 600 steden nagekeken: identiek).
    - Sinds de bots elke minuut spelen, stapelden aangekomen legers zich op tot iemand het spel opende: dat verzoek moest ze
      allemaal verwerken (tot 45 D1-vragen, ±40 ms koud) → Cloudflare gaf een foutpagina ("Ongeldig antwoord"). Nu verwerkt de
      cron-worker ze elke minuut; gewone verzoeken enkel hun eigen legers (hooguit 2) en geen bots/meldingen meer (`world.cron_at`,
      migratie `0009`, ook indexen op `sessions(player_id)` en `players(team_id)`).
    - `/state` 22 → 12 vragen, 3,9 → 0,7 ms. De browser probeert bij een foutpagina zelf opnieuw.
    Gratis limieten (geschat voor ±8 spelers): ruim onder 100k verzoeken/dag, 5M gelezen en 100k geschreven rijen per dag.

54. **Ongelezen chat duidelijk zichtbaar** (gevraagd: "als er een ongelezen chatbericht is, team of globaal, zorg dat het
    duidelijk zichtbaar is"). Rood getal op de Team-knop dat pulseert, een rode knop 'n nieuwe berichten' bovenaan op de kaart
    (opent meteen de chat op het juiste kanaal), '(n)' in de titel van het tabblad, een getal per kanaal en een melding met
    wie wat schreef (tik = naar de chat). Geen extra verzoeken: zit in de gewone peiling van 20 s. Getest op pc, gsm en liggend.

55. **Mooiere poorten** (gemeld: "de poorten van de muur vind ik niet zo mooi vergeleken met de rest"). Vroeger: twee gewone
    muurtorens met een vlakke getekende balk en platte bruine deuren. Nu een 3D-poortgebouw dat per muurniveau beter wordt
    (houten torens met loopbrug → stenen voet en dakjes → stenen poortgebouw met boog en valhek → vaandels en wapenschild →
    torenspitsen en goud), met deuren en valhek die echt opengaan (4 standen) en fakkels die 's nachts gloeien.

56. **Havenhuis en vissersbootjes** (gevraagd: "vanaf de tweede tijd een Havenhuis aan een meertje of rivier in het dorp;
    vissersbootjes bemand met dorpelingen, max. 4; vissen gaat sneller dan de boerderij; heel mooi en upgradebaar"). Vanaf het
    Bronstijdperk op een vrije tegel naast water (blauwe plekken bij het plaatsen; de vijver ligt net buiten het dorp, dus het mag
    tot 4 ringen voorbij je bouwgrond). Eén bootje per niveau (max. 4, 120 hout + 40 voedsel, 15 min), 2 vissers per bootje,
    24 voedsel/u per visser (boer 16) en +8% per niveau. Nieuwe taak 'Vissers' bij de dorpelingen en 'Vissen' als bestemming
    voor nieuwe dorpelingen. 3D: steiger naar het water; 1 vissershut met netten, 2 stenen voet en pannen, 3 kraan en lantaarn,
    4 visafslag met luifel, 5 vuurtoren; per volk eigen muren en daken. Bootjes (roeiboot → zeil → kajuit en lantaarn) varen
    rondes op de vijver en vissen (kringen, kielzog, springende vis); lege bootjes liggen aan de steiger.
    Later gevraagd: "als een speler een haven heeft gebouwd, zorg dat de fog of war met 3x3 daarrond weg gaat": nu nooit mist
    in een vierkant van 3 tegels rond het havenhuis (7×7 tegels, `FISH.sight`), ook al ligt het aan de rand van je gebied.

57. **Barbaren worden sterker en vallen je dorp aan** (gevraagd: "hoe langer de speler wacht op het dorp te raiden, hoe
    sterker ze worden en hoe groter de kans dat ze je dorp eens aanvallen. Als dat het geval is, krijgt de speler een
    melding dat hij 15 minuten de tijd heeft om het gevecht zelf te spelen. Indien niet, gebeurt het automatisch.").
    Er bestonden al overvallen (om de 20–40 u, automatisch, 90 s waarschuwing). Nu: het kamp groeit per dag (tot 3×),
    de kans op een overval groeit mee, en een overval kondigt zich 15 minuten aan: keuzevenster 'Zelf verdedigen' /
    'Automatisch', rode balk bovenaan met aftelling, pushmelding. Zelf verdedigen = een live belegering in je eigen stad
    tegen de barbaren (de computer leidt hen, ze komen uit de richting van hun kamp). Een groot kamp verwoesten geeft
    meer buit. Getest op pc en gsm (venster en balk passen op 390 breed).

58. **Replay van automatische slagen** (gevraagd: "als er een gevecht 'automatisch' verliep, achteraf een replay van hoe de oorlog
    is gegaan zonder zelf te besturen; tot 24 uur na de aanval of verdediging"). De server bewaart per automatische slag een klein
    recept (±1,5–5 kB, tabel `replays`, enkel als er een echte speler bij is); de browser speelt de slag na met de bestaande
    slagmotor (computer tegen computer, `replayBattle`) en stuurt ze bij (`setFate`), want het automatische gevecht (`resolveBattle`)
    en de live slag zijn verschillende modellen: zonder bijsturing won in de proef soms de andere kant. Nu: winnaar altijd juist,
    verliezen van de verliezer exact (wie vlucht wordt neergehaald), van de winnaar ±80% (sinds punt 60 exact); een slag duurt ±0:30–2:40. Knoppen:
    pauze, 1×/2×/4×/8×, Einde, Opnieuw; eindscherm met de cijfers van het rapport. Ook voor roverskampen, voor 'Automatisch' gekozen
    slagen (uitslagkaartje) en voor overvallen van de barbaren (logboek). Getest: Node (determinisme na JSON, winnaar en verliezen,
    routes, 24 u-grens, rechten) en in Chromium op pc, gsm rechtop en liggend.
    Onderweg gevonden: rook boven puin van een muur op tegels met negatieve coördinaten gaf een negatieve straal (`A.smoke`), waardoor
    de rest van het beeld niet getekend werd (ook in gewone belegeringen). Opgelost.

60. **Replay exact** (gemeld: "rapport zegt dat ik 2 van de 5 troepen kwijt ben, in de replay ben ik niets verloren; het moet
    juist zijn"). De bijsturing werkte op levenspunten per soort: de winnaar verloor in de replay ±80% van zijn verliezen en
    gewonde soldaten bleven op het scherm 'leven'. Nu telt ze gesneuvelde soldaten per soort (zoals de teller bovenaan), voor
    beide kanten exact: de verliezer blijft overeind tot de winnaar zijn verliezen heeft en mikt dan op de soorten die nog moeten
    vallen; vastgelopen? Dan trekken die regimenten naar de vijand, en als laatste redmiddel een gerichte klap van de dichtste
    vijand. Het stadscentrum schiet mee (de verdediging door dorpelingen/bezetting uit het automatische gevecht). Gemeten op 350
    willekeurige slagen: 0 fouten. Oude replays (al bewaard) spelen nu ook exact.

59. **Meldingen: aanval op je stad en op een clanlid, meteen bij vertrek** (gevraagd: "extra opties om meldingen aan te zetten:
    als je aangevallen wordt, direct als de aanval geïnitieerd wordt; als je teamlid aangevallen wordt, ook direct; standaard aan").
    'Meteen bij vertrek' bestond al, maar zat met de ±2 min-melding en de barbaren onder één schakelaar. Nu vijf schakelaars per
    toestel: Aanval op je stad (meteen), Aanval op een clanlid (meteen, "stuur versterking"), Aanval komt bijna aan (±2 min +
    barbaren), Een bouwer is vrij, Je leger komt bijna aan. Nieuwe soorten staan standaard aan; wie vroeger 'aanval op je stad'
    uitzette, houdt 'meteen bij vertrek' uit (migratie `0012`). Getest met de echte routes (twee spelers in een clan, elk twee
    toestellen, één met de schakelaar uit; een speler van een andere clan krijgt niets) en het kaartje in de browser.

61. **Clans wisselen, verraad en privéberichten** (gevraagd: "je bondgenoten clan kan verlaten als je wil; toetreding vragen bij
    een andere clan of uitgenodigd worden; rechtstreeks chatten om te onderhandelen; je bondgenoot aanvallen als die nog je
    bondgenoot is = verraden"). `functions/lib/clan.js` + migratie `0013` (`clan_invites`, `dms`, `teams.founder`,
    `players.clan_at`/`traitor_at`).
    - Team-venster: uitnodigingen en verzoeken bovenaan (aanvaarden/weigeren), lidkaarten met 'Bericht' (en 'Uit de clan zetten' bij
      een verrader), chat met tabbladen Clanchat / Iedereen / **Privé** (gesprekken + nieuw gesprek met eender welke echte speler),
      'Clans in de vallei' (toetreding vragen, uitnodigen, bericht), 'Wacht op antwoord' (intrekken) en 'Clan verlaten' (naam kiezen).
    - Wereldkaart, stad van een andere speler: Bericht, In je clan uitnodigen, Vraag om bij zijn clan te komen. Stad van een
      bondgenoot: Bericht en een uitklapper 'Verraad…' met Bondgenoot aanvallen / Verkennen (bevestigen).
    - Regels (`CLAN`): hooguit 4 leden (of de teamgrootte als die groter is); na een wissel 6 uur wachten (buitengezet: niet);
      uitnodigingen vervallen na 3 dagen; vroeg de andere kant het al, dan is de wissel meteen rond. Bij een wissel komen troepen bij
      de oude clan naar huis (en die van hen bij jou), keert versterking onderweg om en keren aanvallen tussen jou en je nieuwe clan
      om. Een lege clan verdwijnt. Computerclans nemen niemand op; bots wisselen nooit en lezen geen privéberichten.
    - Verraad: het slachtoffer en de clan zien een rood leger ("Verraad door …"), krijgen een gsm-melding met "Verraad", de
      rapporten beginnen met "Verraad:" en de clanchat meldt het. Troepen van de verrader die in de stad gestationeerd staan, vechten
      niet mee. In een live slag krijgt de verrader een andere kleur. De clan kan de verrader 3 dagen lang buitenzetten.
    - Nieuwe spelers worden niet automatisch in een zelf gestichte clan gezet, en komen bij de steden van hun clan terecht.
    - Getest: `tests/clan.test.js` (echte routes, `node:sqlite`) en in Chromium op pc, gsm rechtop (390) en liggend (915).
    - Nog niet: een gsm-melding bij een nieuw privébericht of een uitnodiging (enkel in het spel: rood getal, knop en melding).

62. **Nieuws: een updates-pagina** (gevraagd: "een 'updates' pagina waar per volwaardige update of verandering aan het spel een
    artikel wordt geschreven over wat er veranderd is, zodat spelers op de hoogte blijven"). Knop **Nieuws** (bazuin van een heraut)
    in het menu, tussen Ranglijst en Hulp, met een rood getal en één melding per nieuw artikel; het venster toont de artikels
    (nieuwste open, ongelezen met een gouden rand en 'nieuw'). Ook los op `/updates` (link op het aanmeldscherm en in de hulp).
    Eerste artikel: clans wisselen, privéberichten en verraad (punt 61). Getest op pc, gsm 390 en 360 breed (8 knoppen passen) en
    liggend; een nieuwe speler krijgt oudere artikels niet als 'nieuw'.

63. **Troepen ontslaan** (gevraagd: "mogelijkheid om je leger wat in te krimpen: ik wil een ram maken, maar mijn stad zit met
    volle populatie"). Soldaten die thuis zijn ontslaan: hun plaats in de bevolking komt meteen vrij en ze geven 25% van hun kosten
    terug (zoals afbreken). Knop **Troepen ontslaan** bij Leger thuis, kaartje **Ontslaan** in Mijn leger, en bij een eenheid die
    niet meer past (bv. de ram) een knop "Troepen ontslaan om plaats te maken": het venster rekent uit of er genoeg plaats
    vrijkomt. Niet tijdens een slag in je eigen stad. Nieuwsartikel nr. 2. Getest op pc, gsm en liggend.

64. **Idee: belegering (een stad uithongeren)**: uitgewerkt in `docs/idee-belegering.md`, **nog niet gebouwd** (gevraagd:
    "werk het idee uit, maar nog niet implementeren"). Wacht op de keuzes van de gebruiker (open vragen onderaan dat bestand).

65. **Olifant en stormram in 3D** (gemeld: "de olifanten zien er grafisch echt niet oké uit, de ram ook niet; werk ze bij zodat
    ze veel beter zijn vergeleken met de rest"). Ze waren nog oude 2D-tekeningen tussen 3D-troepen. Nu eigen 3D-modellen in dezelfde
    stijl: oorlogsolifant met gerimpelde huid, kleed en kopkleed in teamkleur met goud, slagtanden met gouden punten, torentje met
    boogschutter, mahout op de nek; loopt poot per poot, slurf zwaait; aanval = kop omlaag (stoot), dan kop en slurf omhoog.
    Stormram: overdekt onderstel met spaakwielen die draaien, dak van huiden met touwen, schilden en vaandel in teamkleur, stam aan
    kettingen met een ijzeren ramskop die naar achter zwaait en toeslaat. In de stad, in de veldslag (ook de oefenslag) en als
    teken op de wereldkaart. Bekeken in modelbladen (alle 8 beelden) en in het spel. Kameel en strijdwagen zijn nog 2D.

66. **Grotere gebouwen** (gevraagd: "sommige gebouwen 2x2 of zelfs 4x4 i.p.v. alles 1x1: belegwerkplaats, stal, academie,
    gildehuis, kazerne, schietbaan, markt, bouwloods 2x2, monument 4x4; correct herontworpen; wie het gebouw al had, krijgt een
    melding om het te herplaatsen, zonder bouwtijd of kosten"). `size` in `BUILDINGS`; `SIZE_V`/`GREW` in `rules.js`.
    - Oude steden: `growBuildings` (in `ensureTerritory`, dus op server én browser) zet `s.szv`; elk vergroot gebouw dat op zijn
      plek niet meer past, krijgt `b.rp` (= opnieuw plaatsen) en de stad `s.szm` (melding). Zo'n gebouw blijft werken (training,
      bonus, punten), staat niet op de kaart (`isPlaced`, ook niet in `occupied`, slag, replay, aankleding) en kan niet verbeterd
      worden tot het staat. Plaatsen = de gewone `/move` (`doMove` wist `rp`): gratis en meteen. Bots plaatsen zelf (`placeNear`).
    - Browser: venster 'Gebouwen zijn groter geworden' (één keer per stad en toestel, `rvs-grew-<stad>`; komt terug na het
      welkomstvenster), gouden knop `#rpPill` bovenaan de stad, kaart in het stadsoverzicht. Tik = `placeNext` → `startMove`
      op de dichtste vrije plek; na 'Zet hier' meteen het volgende.
    - 3D: hetzelfde gebouw (`xf`: geschaald en naar achter geschoven) op een erf (`BIG` in `models3d.js`: kazerne strobaarden
      en wapenrekken, schietbaan doelen met schutters, stal paarden en drinkbak, markt kraampjes, belegwerkplaats een ram,
      academie fontein en beelden, gildehuis binnenplaats met hijskraan, bouwloods muur in de steigers; monument een getrapt
      plein met zuilen, beelden en vuurschalen), per niveau meer. `VERSION` 11. 2D-terugval opgeschaald (`bScale`, `artSize`).
    - Nieuwsartikel nr. 4. Getest: `tests/sizes.test.js`, bots 14 speldagen (geen overlap), browser op pc, gsm en liggend.

67. **Dorpelingen ontslaan** (gevraagd: "zorg dat je ook dorpelingen kan ontslaan om plek vrij te maken voor leger"). Het venster
    **Ontslaan** (punt 63) toont nu soldaten én dorpelingen, per taak (zonder werk, voedsel, hout, steen, goud, vissers): `doDismiss(s,
    units, vill)` in `sim.js`, `/dismiss` met `villagers`. Een kwart van de kosten terug, je houdt er altijd `DISMISS.minVillagers` (5)
    over (alle dorpelingen, ook in je gebied), enkel wie thuis is. Het venster toont hoeveel je dorp per uur minder opbrengt. Knoppen:
    **Dorpelingen ontslaan** in de kaart Dorpelingen (dorpelingen bovenaan), het kaartje Ontslaan in Mijn leger, en bij een
    soldaat die niet meer past "Troepen of dorpelingen ontslaan om plaats te maken". Nieuwsartikel nr. 5. Getest: `tests/dismiss.test.js`
    en in Chromium op pc, gsm en liggend.

68. **Rustige stad** (gevraagd: "een knop om beweging in je stad uit te zetten om het spel soepeler te laten werken: geen
    dorpelingen die rondlopen, geen troepen, molens bewegen niet, geen vlinders, eendjes, rook of wapperende vlaggen; wel de random
    events houden; je moet het weer kunnen uitzetten"). Knop met een lopend mannetje rechts in de stad (onder dag/nacht), doorstreept
    als het aan staat; per toestel onthouden. Ook stil: schapen, vogels, wolkenschaduwen, water, bomen, bootjes (aan de steiger),
    vonken, stof en de bouwvakker. Blijven: vondsten, groepen in je gebied, gevechten, kamp en overvallen; je soldaten zie je als je
    je leger kiest (lang indrukken). Gemeten (kleine stad, 14 dorpelingen, 20 soldaten): JS-tijd per beeld pc 1,3 → 0,9 ms, gsm
    1,1 → 0,5 ms; in een grote stad meer. Nieuwsartikel nr. 6, uitleg in de hulp ('Loopt het spel traag?'). Getest op pc, gsm en liggend.

69. **Karavanen: één per 8 uur naar dezelfde speler** (gevraagd: "stel een limiet in dat een speler maar 1 karavaan naar eenzelfde
    speler kan sturen om de 8 uur"). `MARKET.tradeGapMs`; per ontvanger (speler-id) in `s.tradeAt` van de verzender, want marsen
    worden bij aankomst gewist. Server weigert met klokuur van de volgende; een geweigerde karavaan kost niets. Het venster
    Grondstoffen sturen, de wereldkaart en de markt tonen wanneer het weer kan. Bots volgen de regel: in een proef van 2 dagen
    stuurde een gulle bot 24 karavanen (om de 2 u) zonder limiet en 6 (om de 8,00 u) met. Echte tijd, zoals `CLAN.switchMs`.
    Nieuwsartikel nr. 7. Getest: `tests/trade.test.js` (echte routes, nepklok) en in Chromium op pc en gsm.

## 8. Bekende beperkingen en ideeën

- Belegering (uithongeren, uitval in open veld): zie `docs/idee-belegering.md` (voorstel, nog niet gebouwd).
- Haven, boten en eilanden: zie `docs/idee-haven.md` (voorstel, nog niet gebouwd). Op de wereldkaart lopen legers nog
  in een rechte lijn, ook over water.

- Belegering: aanvallers hebben geen ladders of belegeringstorens; kapotte muren blijven na de slag gewoon heel in de stad.
- Replay: in ±3% van de slagen loopt het vast en vallen de laatste soldaten door een gerichte klap van de dichtste vijand (de
  aantallen kloppen altijd). Een overval-replay gebruikt de stad zoals ze nu is (niet zoals tijdens de overval).
- Aanvallen wachten niet tot de aanvaller online komt (zie §3); er is nu wel een melding + aftelling. Mogelijke
  uitbreiding: een wachttijd voor de stad tot de aanvaller online komt.
- Headless Chromium meldt meldingen altijd als 'geblokkeerd': de echte inschrijving is niet in de container te testen
  (de versleuteling is wel nagekeken met `http_ece` en zit in de tests).
- Dubbele muurringen: de route via poorten kijkt enkel naar de binnenste gesloten ring.
- Een echte iPhone-app (App Store/TestFlight) vraagt een betaald Apple-ontwikkelaarsaccount en een Mac.
- De APK-sleutel (`android/keystore/rijken.jks`) staat niet in git; zonder die sleutel kan een nieuwe APK enkel na
  het verwijderen van de oude app (en een nieuwe vingerafdruk in `public/.well-known/assetlinks.json`).
