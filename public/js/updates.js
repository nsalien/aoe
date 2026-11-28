// Nieuws: per volwaardige update een artikel voor de spelers (in het spel via de knop Nieuws, en los op /updates.html).
//
// Een nieuw artikel? Zet het BOVENAAN in UPDATES, met een id die 1 hoger is dan de vorige. Schrijf voor spelers, niet voor
// programmeurs: wat is er nieuw, waar vind je het en wat betekent het voor jou. Geen code, geen bestandsnamen.
//   id     oplopend nummer (de browser onthoudt het hoogste gelezen nummer)
//   at     datum en uur van publicatie ('2026-11-27T10:00:00+01:00'); wie later begon, krijgt oudere artikels niet als 'nieuw'
//   tag    kort label (bv. 'Clans', 'Gevechten', 'Grafisch')
//   icon   naam uit icons.js
//   title  kop, intro = korte samenvatting (1 tot 3 zinnen)
//   body   lijst van blokken: { h, icon, p } = tussenkop met tekst (p mag een lijst van alinea's zijn), { ul: [...] } = opsomming
// In teksten mag <b>…</b> en <i>…</i>; de rest van de opmaak doet updatesHtml.
import { icon } from './icons.js';

export const UPDATES = [
  {
    id: 7,
    at: '2026-11-28T19:00:00+01:00',
    tag: 'Regels',
    icon: 'cart',
    title: 'Karavanen: één per 8 uur naar dezelfde speler',
    intro: 'Clanleden steunen elkaar met karavanen vol grondstoffen, en dat blijft zo. Maar één speler onbeperkt volstoppen met '
      + 'de voorraad van zijn bondgenoten maakte het spel scheef. Daarom kan je nu naar eenzelfde speler maar <b>één karavaan per 8 uur</b> sturen.',
    body: [
      {
        h: 'Wat verandert er?', icon: 'clock',
        ul: [
          'Na een karavaan naar een speler moet je 8 uur wachten voor je diezelfde speler opnieuw grondstoffen kan sturen.',
          'Naar een ander clanlid mag wel meteen: de wachttijd geldt per ontvanger.',
          'Een karavaan kan nog altijd zoveel dragen als je markt toelaat (1.000 per niveau). Kies dus goed wat je meegeeft.',
          'De schatting van een vazal aan zijn heer telt niet mee.',
          'De computerspelers volgen dezelfde regel.',
        ],
      },
      {
        h: 'Waar zie je het?', icon: 'cart',
        p: 'Bij <b>Grondstoffen sturen</b> staat wanneer de volgende karavaan naar die speler kan (klokuur en hoe lang nog). Je ziet het '
          + 'ook op de wereldkaart bij de stad van je bondgenoot en in je markt, onder <b>Karavaan naar bondgenoot</b>.',
      },
    ],
  },
  {
    id: 6,
    at: '2026-11-28T17:00:00+01:00',
    tag: 'Snelheid',
    icon: 'motionoff',
    title: 'Rustige stad: één knop voor een soepeler spel',
    intro: 'Loopt het spel wat stroef op je gsm of oudere computer? Met de nieuwe knop <b>rustige stad</b> zet je alle beweging in je '
      + 'stad stil die niets met het spel zelf te maken heeft. Er hoeft dan veel minder getekend te worden.',
    body: [
      {
        h: 'Waar vind je het?', icon: 'motion',
        p: 'In je stad, rechts in de rij knoppen onder dag en nacht: de knop met het <b>lopende mannetje</b>. Tik erop en het mannetje '
          + 'wordt doorstreept. Nog eens tikken zet alles weer aan. Je toestel onthoudt je keuze, ook na het herladen.',
      },
      {
        h: 'Wat staat er dan stil?', icon: 'pause',
        ul: [
          'Geen dorpelingen die heen en weer lopen, en geen soldaten bij je kazerne.',
          'Geen schapen die rondlopen, geen vlinders, vuurvliegjes, eendjes of vogels.',
          'Geen rook uit de schoorstenen; de wieken van de molentjes en alle vlaggen staan stil.',
          'Het water, de bomen en de vissersbootjes (aan de steiger) bewegen niet meer.',
        ],
      },
      {
        h: 'Wat blijft er gewoon?', icon: 'star',
        ul: [
          'Vondsten rond je stad en de dorpeling die ze gaat halen.',
          'Groepen in je gebied, gevechten, het barbarenkamp en overvallen.',
          'Kies je je leger (kaart ingedrukt houden), dan zie je je soldaten wel, zodat je weet wie je stuurt.',
          'Groepen stel je ook samen in het stadsoverzicht, bij <b>Op pad in je gebied</b>.',
        ],
      },
    ],
  },
  {
    id: 5,
    at: '2026-11-28T15:00:00+01:00',
    tag: 'Leger',
    icon: 'people',
    title: 'Dorpelingen ontslaan: plaats maken voor je leger',
    intro: 'Zit je bevolking vol met dorpelingen en wil je meer soldaten? Je kan nu ook dorpelingen ontslaan. Hun plaats komt '
      + 'meteen vrij voor je leger en je krijgt een kwart van hun kosten terug.',
    body: [
      {
        h: 'Waar vind je het?', icon: 'minus',
        p: [
          'In je stad, bij <b>Dorpelingen</b>: de knop <b>Dorpelingen ontslaan</b>. Het venster <b>Ontslaan</b> (ook via '
          + '<b>Leger thuis</b> en het kaartje <b>Ontslaan</b> in <b>Mijn leger</b>) toont nu soldaten én dorpelingen.',
          'Wil je in de kazerne, de schietbaan of de stal iets trainen en is er geen plaats meer? Dan staat er een knop '
          + '<b>Troepen of dorpelingen ontslaan om plaats te maken</b>, en het venster rekent uit of er genoeg plaats vrijkomt.',
        ],
      },
      {
        h: 'Hoe werkt het?', icon: 'people',
        ul: [
          'Je kiest per taak wie er weg mag: dorpelingen zonder werk, of wie op voedsel, hout, steen, goud of de bootjes werkt.',
          'Het venster toont meteen hoeveel minder grondstoffen je dorp per uur opbrengt.',
          'Je krijgt <b>25%</b> van hun kosten terug.',
          'Je houdt altijd minstens <b>5 dorpelingen</b> over, zodat je stad nooit stilvalt.',
          'Enkel wie thuis is: niet wie in je gebied rondloopt of een vondst oogst. Wordt je stad net aangevallen, dan kan het pas na de slag.',
        ],
      },
    ],
  },
  {
    id: 4,
    at: '2026-11-28T12:00:00+01:00',
    tag: 'Bouwen',
    icon: 'move',
    title: 'Grotere gebouwen: kazerne, markt, stal… en een reusachtig monument',
    intro: 'Een kazerne was even klein als een huisje. Dat klopte niet. Acht gebouwen nemen nu <b>2x2 tegels</b> in en het monument '
      + 'zelfs <b>4x4</b>. Ze zijn ook helemaal opnieuw ontworpen, met een eigen erf vol leven.',
    body: [
      {
        h: 'Welke gebouwen?', icon: 'castle',
        ul: [
          '<b>2x2</b>: kazerne, schietbaan, stal, markt, belegwerkplaats, academie, gildehuis en bouwloods.',
          '<b>4x4</b>: het monument, een echt wereldwonder midden in je stad.',
          'Alle andere gebouwen (huizen, boerderijen, smidse, torens…) blijven even groot.',
        ],
      },
      {
        h: 'Nieuw uitzicht', icon: 'crown',
        p: [
          'Elk vergroot gebouw staat nu op een eigen erf. Bij de kazerne oefenen soldaten op strobaarden, op de schietbaan schieten '
          + 'boogschutters op doelen, in de stal staan paarden aan de drinkbak, op de markt kraampjes met luifels en kopers. Bij de '
          + 'belegwerkplaats staat een stormram op het erf, de academie heeft een plein met een fontein en beelden, het gildehuis '
          + 'een binnenplaats vol kisten, tonnen en een hijskraan, en bij de bouwloods staat een stuk muur in de steigers.',
          'Zoals altijd ziet elk niveau er beter uit en heeft elk volk zijn eigen bouwstijl. Het monument groeit van een getrapt '
          + 'plein tot een groot wonder met zuilen, beelden en goud.',
        ],
      },
      {
        h: 'Had je al zo\'n gebouw?', icon: 'move',
        p: [
          'Past het nog op zijn plek, dan verandert er niets: het is gewoon groter geworden. Past het er niet meer, bijvoorbeeld '
          + 'omdat er een huis naast staat, dan krijg je een melding en staat er bovenaan je stad een gouden knop '
          + '<b>Opnieuw plaatsen</b>. Ook in het overzicht van je stad (Details) staat de lijst.',
          'Tik op de knop: het gebouw verschijnt doorschijnend op de dichtste vrije plek. Kies een andere plek of tik op '
          + '<b>Zet hier</b>. Dat is <b>gratis en meteen klaar</b>, zonder bouwtijd. Heb je er meer, dan komt meteen het volgende.',
          'Tot je het neerzet, blijft het gewoon werken: je kazerne traint verder en de bonus van je gildehuis blijft. Enkel '
          + 'verbeteren kan pas als het weer op de kaart staat.',
        ],
      },
    ],
  },
  {
    id: 3,
    at: '2026-11-27T15:00:00+01:00',
    tag: 'Grafisch',
    icon: 'swords',
    title: 'Nieuwe oorlogsolifant en stormram',
    intro: 'De oorlogsolifant van de Perzen en de stormram zagen er nog uit als oude tekeningen tussen de andere troepen. '
      + 'Ze zijn helemaal opnieuw gemaakt in dezelfde 3D-stijl als de rest van je leger.',
    body: [
      {
        h: 'De oorlogsolifant', icon: 'crown',
        p: [
          'Een echte reus: gerimpelde huid, slagtanden met gouden punten en een kleed in de kleur van je clan, met gouden franje '
          + 'en een kopkleed. Op zijn rug staat een houten torentje met een <b>boogschutter</b>, en op zijn nek zit de berijder.',
          'Hij stapt poot per poot en zwaait met zijn slurf. In een gevecht stoot hij met zijn slagtanden en steekt hij kop en slurf '
          + 'in de lucht, terwijl de schutter in het torentje zijn boog spant.',
        ],
      },
      {
        h: 'De stormram', icon: 'shield',
        p: [
          'Een overdekte ram op vier spaakwielen, met een dak van huiden, schilden en een vaandel in de kleur van je clan. '
          + 'Vooraan steekt een zware stam met een ijzeren <b>ramskop</b>.',
          'Als hij rijdt, draaien de wielen. Bij een aanval zwaait de stam aan zijn kettingen naar achter en beukt hij tegen '
          + 'de poort. Je ziet hem zo in je stad, in de veldslag en in de oefenslag.',
        ],
      },
    ],
  },
  {
    id: 2,
    at: '2026-11-27T12:00:00+01:00',
    tag: 'Leger',
    icon: 'shield',
    title: 'Troepen ontslaan: plaats maken voor een ram',
    intro: 'Zit je bevolking vol en wil je toch nog een ram of een ridder trainen? Je kan nu soldaten die thuis zijn ontslaan. '
      + 'Hun plaats komt meteen vrij en je krijgt een kwart van wat ze kostten terug.',
    body: [
      {
        h: 'Waar vind je het?', icon: 'minus',
        p: [
          'In je stad, bij <b>Leger thuis</b>: de knop <b>Troepen ontslaan</b>. Ook in het tabblad <b>Mijn leger</b> onderaan staat '
          + 'een kaartje <b>Ontslaan</b>.',
          'Wil je een eenheid trainen en is er geen plaats meer? Dan staat er bij die eenheid meteen een knop <b>Troepen ontslaan '
          + 'om plaats te maken</b>. Het venster rekent dan voor je uit of er genoeg plaats vrijkomt (een ram vraagt er 3).',
        ],
      },
      {
        h: 'Hoe werkt het?', icon: 'people',
        ul: [
          'Kies per soort hoeveel soldaten je ontslaat (of tik op <b>alle</b>).',
          'Hun plaats in je bevolking komt meteen vrij.',
          'Je krijgt <b>25%</b> van hun kosten terug, zoals bij het afbreken van een gebouw.',
          'Enkel soldaten die thuis zijn: niet wie in je gebied rondloopt, onderweg is of bij een bondgenoot staat.',
          'Wordt je stad net aangevallen, dan kan het pas na de slag.',
        ],
      },
    ],
  },
  {
    id: 1,
    at: '2026-11-27T10:00:00+01:00',
    tag: 'Clans',
    icon: 'team',
    title: 'Clans: verlaten, toetreden, onderhandelen… en verraden',
    intro: 'Tot nu toe zat je het hele seizoen vast aan de bondgenoot die het spel je gaf. Vanaf nu kies je zelf met wie je optrekt: '
      + 'je kan je clan verlaten, bij een andere clan aankloppen, spelers uitnodigen en iedereen een privébericht sturen. '
      + 'En wie zijn bondgenoot in de rug wil steken, kan dat nu ook.',
    body: [
      {
        h: 'Je clan verlaten', icon: 'door',
        p: [
          'Open het <b>Team</b>-venster en kies onderaan <b>Clan verlaten</b>. Je sticht dan je eigen clan, met een eigen kleur op de '
          + 'kaart. Een naam kiezen mag, leeg laten ook.',
          'Troepen die je bij je bondgenoten gestationeerd had, keren naar huis, en hun troepen bij jou ook. Versterking die nog '
          + 'onderweg was, draait om.',
        ],
      },
      {
        h: 'Bij een andere clan komen', icon: 'flag',
        p: [
          'In het Team-venster staat de lijst <b>Clans in de vallei</b>. Tik op <b>Vraag toetreding</b>, of tik een stad aan op de '
          + 'wereldkaart en kies <b>Vraag om bij … te komen</b>. Een lid van die clan moet je verzoek aanvaarden.',
          'Omgekeerd haal je met <b>Uitnodigen</b> een speler naar jouw clan. Uitnodigingen en verzoeken staan bovenaan het '
          + 'Team-venster, met een rood getal op de Team-knop.',
          'Aanvaard je een uitnodiging, dan wissel je meteen: je hoeft je oude clan niet eerst te verlaten. Liepen er aanvallen '
          + 'tussen jou en je nieuwe clan, dan keren die om: jullie zijn nu bondgenoten.',
        ],
      },
      {
        h: 'Privéberichten: onderhandelen', icon: 'chat',
        p: [
          'De chat heeft een nieuw tabblad <b>Privé</b>. Daar zie je je gesprekken en begin je een gesprek met eender welke speler, '
          + 'ook uit een andere clan. Bij elke stad op de kaart en bij je clanleden staat ook een knop <b>Bericht</b>.',
          'Alleen jullie twee lezen het gesprek. Ideaal om een verbond te smeden, een wapenstilstand af te spreken of over '
          + 'grondstoffen te onderhandelen.',
        ],
      },
      {
        h: 'Verraad', icon: 'swords',
        p: [
          'Je kan een bondgenoot nu ook aanvallen terwijl hij nog in je clan zit. Tik zijn stad aan op de wereldkaart en open '
          + '<b>Verraad…</b>.',
          'Ongemerkt gaat dat niet: je slachtoffer en de hele clan zien je leger in het rood aankomen ("Verraad door …"), krijgen een '
          + 'melding op hun gsm, en na de slag staat het in de clanchat. Je troepen die in zijn stad gestationeerd staan, vechten niet '
          + 'mee. De clan kan een verrader daarna <b>3 dagen lang uit de clan zetten</b>.',
        ],
      },
      {
        h: 'De regels op een rij', icon: 'scales',
        ul: [
          'Een clan heeft hooguit <b>4 leden</b>.',
          'Na een wissel van clan wacht je <b>6 uur</b> voor je opnieuw wisselt (wie buitengezet wordt, hoeft niet te wachten).',
          'Uitnodigingen en verzoeken vervallen na <b>3 dagen</b>.',
          'Computerclans nemen geen spelers op.',
          'Nieuwe spelers worden nog altijd automatisch aan een bondgenoot gekoppeld.',
        ],
      },
    ],
  },
];

export const latestUpdate = () => UPDATES[0] || null;

// Hoeveel artikels zijn nieuw voor deze speler? Gelezen = id ≤ seen; artikels van voor de speler begon, tellen niet.
export function unreadUpdates(seen, joinedAt = 0) {
  return UPDATES.filter((u) => u.id > (seen || 0) && Date.parse(u.at) >= (joinedAt || 0));
}

const dateText = (at) => new Date(at).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const paras = (p) => (Array.isArray(p) ? p : p ? [p] : []).map((t) => `<p>${t}</p>`).join('');

function articleHtml(u, isNew, open) {
  const body = u.body.map((b) => `<section>${b.h ? `<h4>${b.icon ? icon(b.icon) : ''}${b.h}</h4>` : ''}${paras(b.p)}${b.ul ? `<ul>${b.ul.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}</section>`).join('');
  return `<article class="upd${isNew ? ' new' : ''}" id="update-${u.id}">
    <details ${open ? 'open' : ''}><summary>
      <div class="upd-meta"><span class="upd-tag">${icon(u.icon || 'news')}${u.tag || 'Update'}</span><time datetime="${u.at}">${dateText(u.at)}</time>${isNew ? '<b class="upd-new">nieuw</b>' : ''}</div>
      <h3>${u.title}</h3><p class="upd-intro">${u.intro}</p><span class="upd-more">Lees meer</span></summary>
      <div class="upd-body">${body}</div></details></article>`;
}

// de lijst: het nieuwste artikel (en elk ongelezen) staat open, oudere zijn ingeklapt
export function updatesHtml({ seen = Infinity, joinedAt = 0, heading = true } = {}) {
  const fresh = new Set(unreadUpdates(seen, joinedAt).map((u) => u.id));
  return `${heading ? `<h2>${icon('news')} Nieuws uit de vallei</h2>` : ''}
    <p class="desc">Bij elke grote update lees je hier wat er veranderd is in het spel. Het nieuwste staat bovenaan.</p>
    <div class="updates">${UPDATES.length ? UPDATES.map((u, i) => articleHtml(u, fresh.has(u.id), i === 0 || fresh.has(u.id))).join('') : '<p class="empty">Nog geen nieuws.</p>'}</div>`;
}
