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
