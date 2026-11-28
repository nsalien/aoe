# Idee: haven, boten en eilanden (nog niet gebouwd)

Gevraagd door de gebruiker: "een haven waar je boten kan maken; sommige plekken op de kaart zijn afgesloten door water
en daar kom je enkel met een boot." Dit is een uitgewerkt voorstel. Er is nog niets van geïmplementeerd.

## Hoe het nu is (gemeten op 6 kaarten)

- De wereldkaart (56×56) heeft zee langs de rand en hier en daar een meer (`T.DEEP`, `T.SHALLOW` in `worldgen.js`).
- Er is één groot vasteland (±2200 landtegels). De "eilanden" die er zijn, zijn piepklein (1 tot 19 tegels) en er staat niets op.
- Startgebieden liggen 5 tot 13 tegels van het dichtste water (gemiddeld ±7,5): **geen enkele stad ligt aan de kust**.
- Legers marcheren in een rechte lijn, ook dwars over water (`travelMs` in `functions/lib/game.js` = hemelsbrede afstand).

## Het voorstel in het kort

1. **Water wordt een echte hindernis op de wereldkaart.** Legers lopen rond meren en langs de kust (route over land).
2. **Eilanden**: elke nieuwe wereld krijgt 3 tot 5 echte eilanden, gescheiden van het vasteland door minstens 2 tegels
   water. Daar liggen de rijkste doelen.
3. **Haven** (nieuw gebouw in je stad, Bronstijdperk): daarmee bouw je **transportschepen**. Elke stad met een haven krijgt
   een **kade** aan de dichtstbijzijnde kust op de wereldkaart, want geen enkele stad ligt zelf aan het water.
4. **Overtocht**: lopen naar je kade, inschepen, varen, aan land gaan bij het eiland en het laatste stuk te voet.

## 1. Eilanden in de kaart

- Gemaakt uit de seed, net als de rest van de kaart (niets extra in de database). In `fieldAt` (worldgen.js) komt per
  eiland een "bult" in de hoogte: zo tekent `worldmap.js` ze vanzelf mee, met strand, bos en reliëf.
- Plaatsing: 2 tot 3 eilanden in de zee langs de rand en 1 eiland in een groot meer in het midden ("het Heilige Eiland").
  Straal 2 tot 4 tegels, minstens 2 tegels water tot het vasteland, nooit binnen 9 tegels van een startgebied.
- Na het maken: flood fill over land → eiland-id per tegel (`landId`). Controle bij het maken: alle startgebieden liggen
  op het vasteland. Lukt dat niet, dan een andere plek proberen.
- **Enkel in nieuwe werelden** (bij een reset). In een lopende wereld zou het landschap onder bestaande steden
  veranderen. Kaartversie in `world` (bv. kolom `map_v`): oude werelden houden hun kaart en hun rechte marsen.

### Wat valt er te halen op een eiland?

- **Piratennest**: een sterk roverskamp (niveau 4–5) met 1,5× buit. Komt na 2 dagen terug, zoals de andere kampen.
- **Schatkist** (eenmalig per eiland): de eerste die er komt, krijgt een grote som goud.
- Het **Heilige Eiland** in het midden (later, fase 3): een relikwie dat je clan punten per uur geeft zolang jullie het
  met een garnizoen bezetten. Een doel voor het einde van het seizoen.

## 2. Marsen over land (water als hindernis)

- Route met A* over landtegels van de wereldkaart, zoals de wegen in `worldmap.js`: rond meren, langs de kust,
  bergen trager. De reistijd volgt uit de lengte van de route in plaats van de hemelsbrede afstand.
- De route wordt bewaard bij de mars (nieuwe kolom `marches.path`, JSON met tussenstops). Zo hoeft niemand ze opnieuw uit
  te rekenen en tekent `world.js` de stippellijn en het leger langs de echte route (`marchPos` volgt de lijn).
- Kost op de server: A* op 56×56 = ±0,1–0,5 ms, één keer bij het vertrekken. Geen extra query's per peiling.
- Gevolg: sommige aanvallen duren iets langer (rond een meer). Steden en kampen liggen allemaal op het vasteland, dus
  alles blijft bereikbaar zonder boot.

## 3. De haven (gebouw)

| | Voorstel |
|---|---|
| Tijdperk | 2 (Brons) |
| Kosten niveau 1 | 250 hout, 100 steen, 50 goud |
| Niveaus | 1–5 (niveau N vraagt tijdperk N, zoals de andere gebouwen) |
| Per niveau | +1 schip tegelijk in opbouw, inschepen 10% sneller, +1 vissersboot (fase 2) |
| Max. | 1 per stad |

- **De kade**: de dichtstbijzijnde kusttegel die je over land bereikt, vanaf je stad (`portOf` in worldgen.js, gewoon
  uitgerekend, niet bewaard). Op de wereldkaart verschijnt daar een steigertje met je vlag zodra je een haven hebt.
- In je stad: een houten haven met steiger, kraan, touwen, tonnen en een aangemeerd schip (3D-model in `models3d.js`,
  per volk een andere stijl). Ze staat aan de rand van je bouwgrond. Het water in je eigen gebied (de vijver) is te klein
  voor echte schepen, dus de haven in de stad staat symbool voor je kade aan de kust.

## 4. Boten

| Boot | Tijdperk | Kosten | Wat |
|---|---|---|---|
| Transportschip | 2 | 150 hout, 30 goud | vervoert 20 plaatsen (voetvolk 1, ruiter 2, olifant/ram 4); vaart 14 tegels/u |
| Vissersboot (fase 2) | 2 | 60 hout | +12 voedsel/u; max. 1 per havenniveau |
| Oorlogsgalei (fase 3) | 3 | 200 hout, 80 goud | beschermt een vloot, zeeslagen, kustplaatsen beschieten |

- Trainen via de gewone wachtrij (`s.queues.harbor`), zoals troepen in de kazerne.
- Boten staan in `s.units` (bv. `transport`), maar vechten niet mee op land en tellen niet als bevolking.

## 5. Een overtocht

1. Je kiest een doel op een eiland. Het spel rekent de route uit: te voet naar je kade, varen (A* over water), aan land bij
   de dichtstbijzijnde kust van het doel, te voet verder.
2. Heb je te weinig schepen, dan is de knop grijs: "Je hebt 2 transportschepen nodig (20 plaatsen per schip)".
3. Inschepen duurt even (10 min op snelheid 1, korter met een hogere haven). Schepen varen mee en komen samen met
   het leger terug. Sneuvelt het hele leger, dan varen de schepen leeg terug.
4. Op de kaart: een schip met een zeil in teamkleur vaart over het water, met golfjes achter zich.
5. Ook een doel op het vasteland mag over water als dat sneller is (bv. aan de overkant van een meer): het spel kiest de
   snelste route en toont beide tijden.

## 6. In de code (waar het komt)

- `public/shared/worldgen.js`: `islands(seed, size)`, de bult in `fieldAt`, `landIds(terrain)`, `portOf(terrain, x, y)`,
  `landRoute(terrain, a, b)` en `seaRoute(terrain, a, b)` (A*, deterministisch, geen Math.random).
- `public/shared/rules.js`: `BUILDINGS.harbor`, `UNITS.transport` (+ later `fishing`, `galley`), `SEA` (vaarsnelheid,
  inschepen, plaatsen per schip, gewicht per eenheid).
- `public/shared/sim.js`: boten trainen (wachtrij), haven in `boost()` voor de vissersboten.
- `functions/lib/game.js`: `planMarch()` geeft de stukken van de reis terug (`{ kind: 'land' | 'sea', pts, ms }`) en
  vervangt `travelMs`; `/march` controleert de schepen en bewaart `path` en `boats`.
- `migrations/0008_routes_en_boten.sql`: `marches.path TEXT`, `marches.boats INTEGER DEFAULT 0`, `world.map_v`,
  `camps.island INTEGER`.
- `public/js/world.js` + `worldmap.js`: eilanden, kades, schepen en routes langs de kust tekenen.
- `functions/lib/botbrain.js` (fase 2): sterke bots bouwen een haven en plunderen eilanden.
- Tests: route rond een meer, eiland enkel met schip bereikbaar, te weinig schepen, terugkeer met de schepen,
  determinisme van de kaart (zelfde seed = zelfde eilanden in browser en server).

## 7. Fasen

1. **Fase 1**: eilanden in nieuwe werelden, marsen over land rond water, haven, transportschepen, overtochten naar de
   piratennesten en schatkisten.
2. **Fase 2**: vissersboten, mooiere schepen en kades op de kaart, bots met een haven.
3. **Fase 3**: oorlogsgaleien en zeeslagen, havens plunderen, het Heilige Eiland met een relikwie.

## Open vragen voor de gebruiker

1. Mag **elke stad** een haven bouwen (met een kade aan de dichtstbijzijnde kust)? Steden liggen nu 5 tot 13 tegels van
   het water, dus anders kan niemand het gebruiken.
2. Mogen **gewone marsen** voortaan rond meren lopen (iets langere reistijden), zodat water overal een hindernis is?
3. Eilanden **enkel in een nieuwe wereld** (bij de volgende reset): goed zo?
4. Zeeslagen en oorlogsschepen: meteen in fase 1, of eerst zien hoe de overtochten bevallen?
