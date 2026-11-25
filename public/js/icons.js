// Eigen SVG-iconen in één stijl (in plaats van emoji, die per toestel anders ogen).
const O = '#3b2612';
const S = `stroke="${O}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"`;

const P = {
  castle: `<path d="M2.5 21v-9h1.6v1.3h1.6V12h1.8v9z" fill="#c4b9a2" ${S}/><path d="M21.5 21v-9h-1.6v1.3h-1.6V12h-1.8v9z" fill="#c4b9a2" ${S}/>
    <path d="M7.5 21V6h9v15z" fill="#ddd4c0" ${S}/><path d="M7.5 6V3.6h1.8v1.2h1.6V3.6h2.2v1.2h1.6V3.6h1.8V6" fill="#ddd4c0" ${S}/>
    <path d="M10 21v-3.4a2 2 0 0 1 4 0V21z" fill="#5a3a1e" ${S}/><path d="M10.3 9.5h1.2v2h-1.2zM12.5 9.5h1.2v2h-1.2z" fill="#3b2612"/>`,
  map: `<path d="M3 6l5-2 8 2 5-2v14l-5 2-8-2-5 2z" fill="#efe0bb" ${S}/><path d="M8 4v14M16 6v14" stroke="${O}" stroke-width="1" opacity=".45"/>
    <path d="M4.5 14c2-1.6 3.2.8 5-1.2s3-3 5-1.2 2.6 1.6 3.6-.6" fill="none" stroke="#b2372a" stroke-width="1.3" stroke-dasharray="1.6 1.4"/>
    <path d="M16.8 8.2l2 2m0-2l-2 2" stroke="#b2372a" stroke-width="1.6" stroke-linecap="round"/><path d="M5 8.5c1-.8 2-.4 2.6.3" stroke="#3f8f3c" stroke-width="1.4" fill="none"/>`,
  scroll: `<path d="M6.5 4h10.5a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8.5a2 2 0 0 1-2-2z" fill="#f3e5c3" ${S}/><path d="M4.5 4a2 2 0 0 1 2 2v1.5h-4V6a2 2 0 0 1 2-2z" fill="#d9c08d" ${S}/>
    <path d="M9.5 8h6.5M9.5 11h6.5M9.5 14h4" stroke="#8a6a3a" stroke-width="1.2" stroke-linecap="round"/><circle cx="16" cy="17" r="2" fill="#b2372a" ${S}/>`,
  team: `<path d="M3.5 5.5l5-2 5 2v5c0 4-2.5 6.5-5 7.5-2.5-1-5-3.5-5-7.5z" fill="#3f7fd9" ${S}/><path d="M10.5 8l5-2 5 2v5c0 4-2.5 6.5-5 7.5-2.5-1-5-3.5-5-7.5z" fill="#d64545" ${S}/>
    <path d="M15.5 9v8.5M12.5 12.5h6" stroke="#f2c95a" stroke-width="1.5" stroke-linecap="round"/>`,
  trophy: `<path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" fill="none" ${S}/><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#f2c230" ${S}/>
    <path d="M12 13v3.5" ${S}/><path d="M8.5 21h7l-.8-4.5H9.3z" fill="#d9a43a" ${S}/><path d="M9.6 5v2.6" stroke="#fff6c8" stroke-width="1.3" stroke-linecap="round"/>`,
  book: `<path d="M3.5 5c3-1.6 5.8-1.6 8.5 0v15c-2.7-1.6-5.5-1.6-8.5 0z" fill="#9b3a24" ${S}/><path d="M20.5 5c-3-1.6-5.8-1.6-8.5 0v15c2.7-1.6 5.5-1.6 8.5 0z" fill="#b5492f" ${S}/>
    <path d="M7.8 9.2a1.6 1.6 0 1 1 1.6 1.7v1.2" fill="none" stroke="#f2c95a" stroke-width="1.3" stroke-linecap="round"/><circle cx="9.4" cy="14.2" r=".8" fill="#f2c95a"/>
    <path d="M14.5 9h3.5M14.5 12h3.5" stroke="#f2c95a" stroke-width="1.2" stroke-linecap="round"/>`,
  door: `<path d="M5 21V9a7 5.5 0 0 1 14 0v12z" fill="#8b5a2b" ${S}/><path d="M9.7 21V9.2M14.3 21V9.2" stroke="#6b4220" stroke-width="1.1"/>
    <path d="M5 13h14" stroke="#4a3220" stroke-width="1.2"/><circle cx="16.4" cy="15.5" r="1" fill="#f2c230"/><path d="M2.5 21h19" ${S}/>`,
  people: `<circle cx="9" cy="8" r="3" fill="#f1c9a0" ${S}/><path d="M3.5 20c0-4 2.5-6.5 5.5-6.5s5.5 2.5 5.5 6.5z" fill="#8b6a43" ${S}/>
    <circle cx="16.5" cy="9" r="2.5" fill="#f1c9a0" ${S}/><path d="M15 13.5c.5-.3 1-.4 1.6-.4 2.6 0 4.4 2.3 4.4 6.1h-5" fill="#6b8f4a" ${S}/>`,
  move: `<path d="M12 2.5l3 3.2h-2v4.8h4.8v-2l3.2 3-3.2 3v-2H13v4.8h2l-3 3.2-3-3.2h2v-4.8H6.2v2L3 11.5l3.2-3v2H11V5.7H9z" fill="#e8c46a" ${S}/>`,
  hammer: `<path d="M13.6 9.4L4 19l1.6 1.6 9.6-9.6z" fill="#a8743f" ${S}/><path d="M10.6 6.2L14.5 3l6.5 6.5-3.2 3.9z" fill="#9aa1ab" ${S}/><path d="M13 5.5l5.5 5.5" stroke="#d7dbe0" stroke-width="1"/>`,
  target: `<circle cx="11" cy="13" r="8.5" fill="#f4efe0" ${S}/><circle cx="11" cy="13" r="5.6" fill="#d64545"/><circle cx="11" cy="13" r="2.9" fill="#f4efe0"/><circle cx="11" cy="13" r="1.2" fill="#d64545"/>
    <path d="M11 13l9-9" stroke="#6b4a2b" stroke-width="1.5" stroke-linecap="round"/><path d="M17 3.2l3.2.6.6 3.2" fill="none" stroke="#8a8f99" stroke-width="1.5" stroke-linecap="round"/>`,
  shield: `<path d="M12 2.5l8 3v6c0 5-3.5 8.8-8 10.5-4.5-1.7-8-5.5-8-10.5v-6z" fill="#3f7fd9" ${S}/><path d="M12 5v14M6.8 10.2h10.4" stroke="#f2c95a" stroke-width="1.8" stroke-linecap="round"/>`,
  swords: `<path d="M4.5 4.5l10 10M19.5 4.5l-10 10" stroke="${O}" stroke-width="3.4" stroke-linecap="round"/><path d="M4.5 4.5l10 10M19.5 4.5l-10 10" stroke="#e1e5ea" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M7.6 13.2l3.2 3.2M16.4 13.2l-3.2 3.2" stroke="#d9a43a" stroke-width="2" stroke-linecap="round"/><path d="M9.3 17.5L6.5 20.3M14.7 17.5l2.8 2.8" stroke="#6b4a2b" stroke-width="2.2" stroke-linecap="round"/>`,
  magnifier: `<path d="M14.6 14.6l5.6 5.6" stroke="#6b4a2b" stroke-width="3" stroke-linecap="round"/><circle cx="10" cy="10" r="6.2" fill="#d6ecf7" stroke="${O}" stroke-width="1.8"/><path d="M7 8.2a3.4 3.4 0 0 1 3-2.4" stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
  cart: `<path d="M17 10.5h4.5" ${S}/><ellipse cx="10" cy="8" rx="5.5" ry="2.4" fill="#f2c230" ${S}/><path d="M2.5 8.5h15l-1.6 7H4.1z" fill="#a8743f" ${S}/>
    <circle cx="7" cy="18" r="2.2" fill="#4a3220" ${S}/><circle cx="14" cy="18" r="2.2" fill="#4a3220" ${S}/>`,
  scales: `<path d="M12 3.5v15M7 21h10M4.5 7h15" ${S}/><circle cx="12" cy="3.6" r="1.2" fill="#f2c230" ${S}/>
    <path d="M4.5 7l-2.7 6M4.5 7l2.7 6M19.5 7l-2.7 6M19.5 7l2.7 6" stroke="${O}" stroke-width="1"/><path d="M1.5 13a3 2 0 0 0 6 0zM16.5 13a3 2 0 0 0 6 0z" fill="#f2c230" ${S}/>`,
  up: `<path d="M12 2.8l7.5 8.4h-4.3V21H8.8v-9.8H4.5z" fill="#4c9f45" ${S}/><path d="M12 5.5l-3.5 4" stroke="#bfe6a8" stroke-width="1.2" stroke-linecap="round"/>`,
  flag: `<path d="M5.5 21.5V2.5" stroke="${O}" stroke-width="1.8" stroke-linecap="round"/><path d="M6 3.5h12.5l-3 4.3 3 4.3H6z" fill="#d64545" ${S}/><path d="M8 5.5h5" stroke="#f4a0a0" stroke-width="1.1" stroke-linecap="round"/>`,
  crown: `<path d="M3 17.5L4.4 7.5l4.6 4 3-6.2 3 6.2 4.6-4L21 17.5z" fill="#f2c230" ${S}/><path d="M3 17.5h18V21H3z" fill="#d9a43a" ${S}/>
    <circle cx="12" cy="19.2" r="1" fill="#d64545"/><circle cx="7.5" cy="19.2" r=".9" fill="#3f7fd9"/><circle cx="16.5" cy="19.2" r=".9" fill="#3fae5a"/>`,
  bell: `<path d="M5.5 17V11a6.5 6.5 0 0 1 13 0v6l2 2h-17z" fill="#f2c230" ${S}/><circle cx="12" cy="20.6" r="1.7" fill="#8b5a2b" ${S}/><path d="M12 2.5v2" ${S}/><path d="M8.6 9.5a3.6 3.6 0 0 1 2.4-2.8" stroke="#fff6c8" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  dove: `<path d="M2.5 13.5c3.5.5 6-1 8-4 1.4-2.2 3.4-3.2 5.5-2.6l3.4-1.9-1 3.3c.9 4.6-2.5 9.7-9.4 9.7-3.2 0-5.4-1.6-6.5-4.5z" fill="#f4f6f8" ${S}/>
    <path d="M8.2 12.6c2.6-.4 4.6-2.7 5-5.6" fill="none" stroke="#9aa6b2" stroke-width="1.2" stroke-linecap="round"/><circle cx="17" cy="8" r=".8" fill="${O}"/>
    <path d="M19.5 11.5c1.2.6 2.4.6 3 .1M20.8 11.9l.4 1.2" stroke="#4c9f45" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  sun: `<g stroke="#e0a020" stroke-width="1.8" stroke-linecap="round"><path d="M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M4.8 19.2l1.7-1.7M17.5 6.5l1.7-1.7"/></g>
    <circle cx="12" cy="12" r="5" fill="#ffd23f" ${S}/>`,
  moon: `<path d="M19.5 15.5A8.5 8.5 0 0 1 8.5 4.5a8.5 8.5 0 1 0 11 11z" fill="#f2e6b8" ${S}/><circle cx="17.5" cy="5" r="1" fill="#f2e6b8"/><circle cx="20.5" cy="9" r=".7" fill="#f2e6b8"/>`,
  sunmoon: `<path d="M12 3a9 9 0 0 0 0 18z" fill="#ffd23f" ${S}/><path d="M12 3a9 9 0 0 1 0 18c2.6-2 3.7-5.4 3.7-9S14.6 5 12 3z" fill="#41507a" ${S}/><circle cx="16.2" cy="9" r=".8" fill="#f2e6b8"/><circle cx="17.6" cy="14" r=".6" fill="#f2e6b8"/>`,
  hourglass: `<path d="M6 2.5h12M6 21.5h12" ${S}/><path d="M7 2.5c0 5.5 4.2 6.5 4.2 9.5S7 16 7 21.5h10c0-5.5-4.2-6.5-4.2-9.5S17 8 17 2.5z" fill="#efe0bb" ${S}/>
    <path d="M9 19.8c.8-2.2 2.2-3 3-3s2.2.8 3 3zM9.6 6.5h4.8c-.6 1.5-1.6 2.4-2.4 3-.8-.6-1.8-1.5-2.4-3z" fill="#d9a43a"/>`,
  chat: `<path d="M3 5.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4H5a2 2 0 0 1-2-2z" fill="#f3e5c3" ${S}/><path d="M7 8.5h10M7 11.8h7" stroke="#8a6a3a" stroke-width="1.3" stroke-linecap="round"/>`,
  heart: `<path d="M12 20.5s-8-4.8-8-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.5c0 5.6-8 10.4-8 10.4z" fill="#d9483b" ${S}/><path d="M7.6 9.2a2.2 2.2 0 0 1 2.2-1.6" stroke="#ffd6cc" stroke-width="1.3" stroke-linecap="round" fill="none"/>`,
  star: `<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="#f2c230" ${S}/>`,
  clock: `<circle cx="12" cy="12" r="9" fill="#fff6e0" ${S}/><path d="M12 6.5V12l3.8 2.2" stroke="${O}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  tent: `<path d="M2 20L12 4l10 16z" fill="#a0402a" ${S}/><path d="M12 4l-3 16h6z" fill="#3b2612"/><path d="M12 4l4 16" stroke="#c2604a" stroke-width="1"/>`,
  home: `<path d="M3.5 11.5L12 4l8.5 7.5" fill="none" ${S}/><path d="M5.5 10v10.5h13V10" fill="#ead9b3" ${S}/><path d="M10 20.5v-5h4v5z" fill="#8b5a2b" ${S}/>`,
  plus: `<path d="M12 5v14M5 12h14" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`,
  minus: `<path d="M5 12h14" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>`,
  back: `<path d="M14.5 5L7.5 12l7 7" fill="none" stroke="${O}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16" stroke="${O}" stroke-width="2.2" stroke-linecap="round"/>`,
  horse: `<path d="M5 20l1-6c-1.5-1-2-3-1-4.5l3-3.5 1.5-3 1.5 2.5c3 .2 6 2 7.5 5.5l1.5 3.5-2 1-1.8-2.5-1.2 1.6 1 5.4h-2l-1-4.2-3 .7-.8 3.5z" fill="#8b5a2b" ${S}/><circle cx="9" cy="7.2" r=".7" fill="${O}"/>`,
  anvil: `<path d="M3 7h13c0 2.5 2 3.5 5 3.5v1.5H15l-1.5 3.5H17V19H6v-3.5h3.5L8 12H5c-1.5 0-2-1-2-2.5z" fill="#6b717c" ${S}/><path d="M5 8.2h9" stroke="#a9afb8" stroke-width="1" stroke-linecap="round"/>`,
  // formaties (bovenaanzicht, vooraan = boven)
  fline: `<path d="M12 2.2l2.2 2.6h-4.4z" fill="#d9a43a" ${S}/>${dots([[3.5, 10], [8.2, 10], [12.9, 10], [17.6, 10], [3.5, 15.5], [8.2, 15.5], [12.9, 15.5], [17.6, 15.5]].map(([x, y]) => [x + 1.4, y]))}`,
  fblock: `<path d="M12 2.2l2.2 2.6h-4.4z" fill="#d9a43a" ${S}/>${dots([[8, 8], [12, 8], [16, 8], [8, 12.2], [12, 12.2], [16, 12.2], [8, 16.4], [12, 16.4], [16, 16.4], [8, 20.6], [12, 20.6], [16, 20.6]], 1.5)}`,
  fwedge: `<path d="M12 2l2.2 2.6h-4.4z" fill="#d9a43a" ${S}/>${dots([[12, 8], [9, 12.5], [15, 12.5], [6, 17], [12, 17], [18, 17], [3, 21.2], [9, 21.2], [15, 21.2], [21, 21.2]], 1.45)}`,
  floose: `<path d="M12 2.2l2.2 2.6h-4.4z" fill="#d9a43a" ${S}/>${dots([[3.5, 10], [12, 10], [20.5, 10], [7.7, 17.5], [16.3, 17.5]])}`,
  fring: dots([[6, 6], [12, 6], [18, 6], [18, 12], [18, 18], [12, 18], [6, 18], [6, 12]]) + `<path d="M12 9.6v4.8M9.6 12h4.8" stroke="#d9a43a" stroke-width="1.6" stroke-linecap="round"/>`,
};

// stippen voor de formatie-iconen
function dots(list, r = 1.9) {
  return list.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#b2372a" stroke="${O}" stroke-width=".9"/>`).join('');
}

export function icon(name, cls = '') {
  const body = P[name] || P.star;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export const ICON_NAMES = Object.keys(P);
