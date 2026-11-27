# Idee: belegering — een stad uithongeren (nog niet gebouwd)

Gevraagd door de gebruiker: "Je kan iemand rechtstreeks op z'n dorp aanvallen, maar ook een belegering doen. Het dorp wordt
omsingeld; tijdens de belegering kan het geen grondstoffen verzamelen omdat alle wandelroutes geblokkeerd zijn. Uiteindelijk
wordt de verdediger uit zijn dorp gelokt omdat hij geen voedsel meer heeft. Zo vermijdt de aanvaller een gevecht in de stad en
vecht hij in het open veld, zonder muren of torens. Er is een maximale duur: de aanvaller raakt ook zonder voedsel en trekt
dan terug. Tijdens de belegering kan de verdediger geen versterking of karavanen ontvangen."

Dit is een uitgewerkt voorstel. Er is nog niets van geïmplementeerd. Onderaan staan de keuzes die de gebruiker nog moet maken.

**Naam**: in het spel heet de bestaande slag in de stad nu ook al "belegering". Voorstel: die gaat voortaan **bestorming**
heten, en **belegering** is enkel nog het nieuwe uithongeren. In het verzendvenster komen dan twee knoppen: *Aanvallen
(bestormen)* en *Belegeren*.

## Hoe het nu is

- Een aanval = één slag bij aankomst, in de stad van de verdediger (live of automatisch). Daarna keert het leger meteen terug.
  Een leger kan niet bij een stad blijven staan.
- Steden **eten niets**: voedsel wordt enkel gebruikt om te bouwen en te trainen. De productie loopt altijd door.
- Versterking, karavanen en schatting komen altijd aan.
- Muren, poorten, torens, kokende pek en de bezetting van het stadscentrum maken een stad sterk in een bestorming.
- Er bestaat al een slagveld **in open veld** (bij roverskampen: een open plek met tenten, geen muren of torens). Dat is
  precies het terrein voor een uitval naar het kamp van de belegeraar (zie §4).

Gemeten (een actieve speler, nagebootst met het brein van de bots, 10 speldagen):

| Speldag | Tijdperk | Bevolking (dorpelingen + leger) | Voedsel in voorraad | Opslag | Voedselproductie |
|---|---|---|---|---|---|
| 2 | Brons | 64–71 (45 + 19–26) | ±6.200 | 10.000 | ±220/u |
| 4 | IJzer | 111–132 (68 + 43–64) | ±13.500 | 21.000 | ±330/u |
| 8 | Gilden | 144–171 (90 + 54–81) | ±32.000 | 40.000 | ±415/u |
| 10 | Gilden | 144–171 | ±11.000–12.000 | 44.000 | ±600/u |

Bots sparen veel voedsel op. Echte spelers geven meestal meer uit en hebben dus minder in voorraad.

## Het voorstel in het kort

1. **Belegeren** is een nieuwe opdracht naast Aanvallen. Je stuurt een leger met **proviand** (voedsel uit je eigen stad) voor
   een gekozen duur: 6, 12, 18 of hooguit 24 uur.
2. Bij aankomst slaat het leger een **kamp** op rond de stad. Na **1 uur** is de stad **omsingeld**.
3. Een omsingelde stad **verzamelt niets meer**. Iedereen erin (dorpelingen, soldaten, versterking) **eet** uit de voorraad.
   Er komt geen versterking, karavaan of schatting binnen, en de markt ligt stil.
4. De verdediger kan op elk moment een **uitval** doen: een slag **in open veld** bij het kamp, zonder muren of torens.
5. Is het **voedsel op**, dan moet hij wel naar buiten: een **gedwongen uitval**, met verzwakte (hongerige) troepen. Heeft hij
   geen soldaten meer, dan **geeft de stad zich over**: de belegeraar plundert zonder slag.
6. De belegeraar eet zijn proviand op. Is die op, of is de maximale duur voorbij, dan **trekt hij terug** zonder slag.
   Hij kan ook eerder opbreken, of toch de stad **bestormen** (de gewone slag in de stad).

## 1. Een belegering starten

- Knop **Belegeren** naast Aanvallen en Verkennen, bij een stad op de wereldkaart. Dezelfde regels als een aanval: vrede van
  beide spelers, niet je vazal of je heer, en bij een clanlid is het verraad (met bevestiging).
- **Minimale legergrootte** om een stad te kunnen omsingelen: voorstel 20 + 10 × het tijdperk van de verdediger
  (Vuursteen 30, IJzer 50, Kroon 70; bevolking, dus een ram telt voor 3). Een groter dorp heeft een langere omtrek. Is je
  leger te klein, dan staat de knop grijs met de uitleg.
- **Proviand**: je kiest de duur (6, 12, 18 of 24 uur). Kost = legerbevolking × eten per uur × uren, meteen betaald uit je
  voedselvoorraad. Voorbeeld met 4 voedsel per bevolking per uur: 80 soldaten voor 12 uur = 3.840 voedsel.
- Het leger loopt zo snel als zijn traagste eenheid, zoals een aanval. De verdediger krijgt meteen een melding op zijn gsm:
  *"X komt je stad belegeren (aankomst om …)"*. Zijn clanleden krijgen de gewone melding "aanval op een clanlid".
- **Eén belegering per stad tegelijk.** Komt er een tweede belegeraar aan, dan wordt dat een gewone aanval (bestorming).

## 2. Aankomst en omsingeling (1 uur)

- Het leger slaat zijn kamp op. Er volgt **geen slag**.
- Tijdens het **insluiten** (1 uur) loopt alles nog gewoon: productie, versterking, karavanen. De verdediger ziet een rode
  balk met aftelling: *"Omsingeling over 42 min"*. Hij kan nog snel versterking laten komen, of meteen een uitval doen.
- Na het uur is de stad **omsingeld**. Daarvan krijgen beide spelers een melding.

## 3. Tijdens de belegering

**De verdediger**

- **Geen productie**: alle dorpelingen staan stil (boeren, houthakkers, mijnwerkers, vissers). Vondsten oogsten en groepen
  in je eigen gebied sturen kan niet. Groepen die buiten zijn, komen bij de omsingeling naar huis.
- **Iedereen eet**: voedsel daalt met *eten per uur* × (dorpelingen + soldaten + versterking in de stad). De balk bovenaan toont
  het verbruik in het rood (bv. *−560/u*) en hoe lang de voorraad nog meegaat.
- **Geblokkeerd**: versterking, karavanen en schatting die aankomen, keren om met de melding *"kon de stad niet bereiken: ze
  wordt belegerd"*. De markt (ruilen met handelaars) werkt niet. Je kan geen legers of karavanen naar buiten sturen: de enige
  weg naar buiten is een uitval.
- **Wat wel kan**: bouwen, verbeteren, onderzoek en trainen met wat je hebt. Elke nieuwe soldaat eet mee. Troepen
  ontslaan kan ook, en dan eten er minder monden mee.
- Overvallen van de barbaren pauzeren tijdens een belegering.

**De belegeraar**

- Zijn leger eet de proviand op. Bij de stad zie je: *"Omsingeld sinds 14:20 · proviand nog 9 u 40 min"*.
- Wat hij over het voedsel van de stad weet (voorstel): enkel een inschatting zoals *ruim*, *krap* (minder dan 12 uur) of
  *honger* (minder dan 3 uur), aan de rook uit de schoorstenen. Met verkenners weet hij het precies.
- Knoppen: **Bestormen** (de gewone slag in de stad; is de stad al aan het verhongeren, dan vechten haar troepen verzwakt) en
  **Opbreken** (terug naar huis; overschot aan proviand gaat mee terug).

## 4. Uitval en honger

**Vrijwillige uitval** (op elk moment, ook tijdens het insluiten)

- Een slag **in open veld bij het kamp** van de belegeraar: het bestaande slagveld met tenten van de roverskampen, zonder
  muren, torens of pek. De uitvallers zijn hier de aanvaller, de belegeraars verdedigen hun kamp.
- Met alle soldaten thuis en de versterking in de stad. Dorpelingen blijven binnen. Kiezen tussen zelf leiden en automatisch,
  zoals bij elke slag.

**Gedwongen uitval** (voedsel op)

- Zodra het voedsel op 0 komt, krijgt de verdediger **15 minuten** om te kiezen, net zoals bij een overval van de barbaren:
  zelf leiden of automatisch. Doet hij niets, dan wordt de slag automatisch uitgerekend.
- Zijn troepen zijn **hongerig**: −20% kracht (aanval en levens). Een rode balk en een gsm-melding: *"Je stad heeft geen
  voedsel meer: je troepen moeten uitvallen!"*.

**Overgave**

- Heeft de stad geen soldaten meer (allemaal gesneuveld bij een uitval, of ontslagen) en geen voedsel, dan geeft ze zich na
  1 uur over. De belegeraar plundert zoals na een gewonnen aanval: buit volgens het draagvermogen, edelmannen werken, de muren
  blijven heel. Daarmee eindigt de belegering.

**Wie wint de uitval?**

| Uitslag | Wat er gebeurt |
|---|---|
| De verdediger wint | De belegering is gebroken. De overlevende belegeraars vluchten naar huis, zonder proviand. Krijgsbuit voor de verdediger, zoals nu. |
| De belegeraar wint | Het leger van de verdediger is weg (gesneuveld of terug binnen gevlucht). De belegering loopt door: bestormen, of wachten op honger en overgave. |

## 5. Einde van de belegering

- **Proviand op**, of **24 uur** voorbij (de maximale duur), of het einde van het seizoen: de belegeraars trekken terug zonder
  slag. Allebei een rapport: *"De belegering van X is opgeheven"*.
- **Opbreken** door de belegeraar: idem, en het overschot aan proviand gaat mee naar huis.
- **Bestormen**: het kamp wordt opgebroken en het wordt een gewone aanval op de stad (live of automatisch, zoals nu).
- Gebroken door een uitval, of de stad gaf zich over: zie §4.
- Na een belegering is de stad **6 uur beschermd** tegen een nieuwe belegering (gewone aanvallen mogen wel). Zo kan je
  iemand niet de hele week vastzetten.

## 6. Balans (de cijfers)

De belangrijkste knop is **hoeveel een inwoner per uur eet**. Het voorstel is **4 voedsel per bevolking per uur**, voor beide
kanten. Ter vergelijking: een boer verzamelt er 16 per uur.

Hoe lang houden de gemeten steden het vol?

| Stad | Eten 3/u | **Eten 4/u** | Eten 5/u |
|---|---|---|---|
| Dag 2 (64 bevolking, 6.200 voedsel) | 32 u | **24 u** | 19 u |
| Dag 4 (111 bevolking, 13.900 voedsel) | 42 u | **31 u** | 25 u |
| Dag 8 (144 bevolking, 32.000 voedsel) | 74 u | **56 u** | 44 u |
| Dag 10 (144 bevolking, 12.200 voedsel) | 28 u | **21 u** | 17 u |
| Een speler die zijn voedsel uitgeeft (100 bevolking, 3.000 voedsel) | 10 u | **7,5 u** | 6 u |

Wat het de belegeraar kost (eten 4/u):

| Leger | 6 u | 12 u | 24 u |
|---|---|---|---|
| 50 bevolking | 1.200 | 2.400 | 4.800 |
| 80 bevolking | 1.920 | 3.840 | 7.680 |
| 120 bevolking | 2.880 | 5.760 | 11.520 |

Wat dat betekent:

- **Voedsel opsparen wordt een verdediging.** Een stad met een volle schuur houdt een belegering van 24 uur uit. Een stad die
  alles uitgeeft, valt binnen de 8 uur.
- **Belegeren is duur.** De belegeraar betaalt ongeveer evenveel voedsel als de verdediger in voorraad heeft. Zijn leger is
  intussen ook niet thuis om zijn eigen stad te verdedigen.
- Een grote stad met veel monden eet sneller. Ontslaan helpt een beetje, maar elke ontslagen soldaat mist straks bij de uitval.
- Alle getallen komen in `SIEGE` in `rules.js` en blijven makkelijk bij te stellen na een eerste test.

## 7. Wat de spelers zien

- **Verzendvenster**: tabblad *Belegeren* met de keuze van de duur, de kost aan proviand, de minimale grootte (groen of rood)
  en wanneer het leger aankomt.
- **Wereldkaart**: rond een belegerde stad een ring van tenten en kampvuren, en het label *"belegerd"*. Het leger staat als een
  kamp bij de stad, niet als een lijn.
- **Stad van de verdediger**: tenten en soldaten van de vijand aan de rand van je gebied, versperde wegen, en dorpelingen die
  thuis blijven. Een rode balk bovenaan: *"Belegerd door X · voedsel nog 18 u 20 min · Uitval"*. In de grondstoffenbalk toont
  voedsel het verbruik in het rood.
- **Belegeraar**: in het paneel van de stad de toestand van de belegering, de proviand en de knoppen Bestormen en Opbreken.
- **Meldingen op je gsm**: vertrek (meteen), omsingeling rond, voedsel bijna op (nog 3 uur), gedwongen uitval (15 minuten om
  te kiezen), einde van de belegering.
- **Rapporten** voor elk einde, en replays van de automatische uitval. Het slagveld bij het kamp kan al opgenomen worden.
- Een **nieuwsartikel** als het er is.

## 8. In de code (waar het komt)

- **`rules.js`**: `SIEGE = { closeMs: 1 u, eat: 4, hours: [6, 12, 18, 24], minPop: (tijdperk) => 20 + 10 × tijdperk,
  hunger: 0.2, choiceMs: 15 min, surrenderMs: 1 u, shieldMs: 6 u }`. Alle tijden in speltijd (houdt rekening met de snelheid
  van de wereld).
- **`sim.js`** (gedeeld, deterministisch): `s.siege = { id, by, closed, until, extra }` in de stad van de verdediger
  (`extra` = bevolking van de versterking in de stad, die staat niet in de stad zelf). In `advance()`: na `closed` is de
  productie 0 (`rates()`) en daalt het voedsel per tik. `siegeHungerAt(s)` rekent uit wanneer het voedsel op is. `doFieldSend`,
  oogsten en de markt weigeren tijdens een omsingeling. `scheduleRaid` wacht.
  Browser en server rekenen zo hetzelfde, en de teller in de balk loopt vanzelf.
- **Database**: een nieuwe migratie met de tabel `sieges` (id, mars, aanvaller, verdediger, stad, aankomst, omsingeld, einde
  proviand, status `closing`/`active`/`choice`/`done`, `next_at` met index). Het leger blijft in `marches` met de nieuwe status
  `siege`. De proviand staat in `marches.res`.
- **`game.js`**: `resolveMarch` bij een mars van de soort `siege` → kamp opslaan in plaats van vechten. `processSieges` (in de
  cron-worker, via `next_at`) doet omsingeling, honger, keuze, overgave en einde. Het moment van de honger verandert als de
  verdediger voedsel uitgeeft of soldaten traint: `saveTown` werkt `sieges.next_at` bij (zoals nu `build_at`/`raid_at`).
  Aankomst van versterking, karavanen en schatting bij een omsingelde stad → omkeren.
- **Uitval** = een slag van de soort `camp` (open veld met tenten, bestaat al in `fieldbattle.js`) met de rollen omgekeerd:
  de uitvallers vallen aan, de belegeraars houden het kamp. Automatisch = `resolveBattle` zonder muur, torens of bezetting, met
  de hongerstraf. Het einde gebruikt de bestaande verwerking (rapporten, punten, krijgsbuit), aangevuld met wat er met de
  belegering gebeurt.
- **Routes**: `/march` met `kind: 'siege'` en `hours`, `/siege/sortie` (verdediger), `/siege/storm` en `/siege/lift`
  (belegeraar). `/state` toont de belegering aan beide kanten (voor de verdediger zit ze al in `s.siege`).
- **Meldingen** (`push.js`): de bestaande soorten 'aanval op je stad' en 'aanval komt bijna aan'. Er komt geen nieuwe
  schakelaar, dus ook geen migratie voor de meldingen.
- **Bots**: in fase 1 verdedigen ze gewoon (automatisch). Pas in fase 3 belegeren ze zelf.
- **Tests**: verbruik en honger deterministisch (browser = server), blokkades, minimumgrootte, elk einde (proviand, 24 uur,
  opbreken, bestormen, uitval gewonnen of verloren, overgave), wachttijd, en de CPU en het aantal query's van de cron.

## 9. Fasen

1. **Kern**: belegeren met proviand, omsingeling, geen productie en eten, blokkades, vrijwillige en gedwongen uitval
   (automatisch), overgave, bestormen en opbreken, rapporten, meldingen, de rode balk en de knoppen. Nieuwsartikel.
2. **Zien en zelf spelen**: de uitval live op het slagveld bij het kamp, tenten en kampvuren rond de stad (wereldkaart en
   stad), versperde wegen. **Ontzet**: bondgenoten kunnen het kamp van de belegeraar aanvallen (dezelfde slag in open veld),
   en clanleden kunnen samen één stad belegeren.
3. **Bots** belegeren zelf (doelwit: een stad met weinig voedsel en sterke muren), en de balans bijstellen na het spelen.

## Open vragen voor de gebruiker

1. **Maximale duur**: 24 uur, te kiezen per 6 uur? Of korter (12 uur) zodat het spannend blijft voor een vriendengroep die een
   paar keer per dag kijkt? *Voorstel: 24 uur, keuze 6/12/18/24.*
2. **Hoeveel eet een inwoner?** Bij 4 per uur houdt een stad met een volle schuur 24 uur makkelijk uit en valt een stad die
   alles uitgeeft binnen de 8 uur. *Voorstel: 4.* Moeten dorpelingen even veel eten als soldaten, of minder (bv. de helft)?
3. **Minimale legergrootte** om te omsingelen: 20 + 10 × tijdperk van de verdediger? Of afhankelijk van de lengte van zijn muur?
4. **Omsingelen duurt 1 uur.** Is dat goed? (Langer = meer kans om versterking te laten komen.)
5. **Overgave** van een stad zonder soldaten en zonder voedsel: plunderen zoals een gewonnen aanval, en tellen edelmannen mee?
   *Voorstel: ja op beide.*
6. **Ontzet** (fase 2): mogen bondgenoten het kamp van de belegeraar aanvallen? *Voorstel: ja, dat is het tegengewicht.*
7. Een **eigen leger** van de verdediger dat tijdens de belegering naar huis komt: vecht het zich een weg naar binnen (een slag
   in open veld bij het kamp), of mag het gewoon binnen? *Voorstel: vechten, de wegen zijn geblokkeerd.*
8. Mag de verdediger tijdens de belegering **bouwen en trainen** met zijn voorraad? *Voorstel: ja (elke nieuwe soldaat eet mee).*
9. **Hongerstraf** bij een gedwongen uitval: −20%? Mag hij groter worden naarmate de honger langer duurt?
10. Mag **dezelfde clan samen** één stad belegeren (fase 2), of blijft het één belegeraar per stad?
11. **Bescherming** na een belegering: 6 uur geen nieuwe belegering? Of langer?
12. **Naam**: de huidige slag in de stad voortaan *bestorming*, en *belegering* enkel voor het uithongeren?
