// Werkt een stuk HTML bij zonder het te vervangen: enkel wat echt anders is, wordt aangepast.
// Zo blijven knoppen, invoervelden (met focus en cursor) en afbeeldingen dezelfde elementen,
// flitst er niets en gaan klikken niet verloren als het paneel ververst.

function sameNode(a, b) {
  return a.nodeType === b.nodeType && a.nodeName === b.nodeName;
}

export function morph(oldN, newN) {
  if (!sameNode(oldN, newN)) {
    oldN.replaceWith(newN);
    return;
  }
  if (oldN.nodeType === 3 || oldN.nodeType === 8) {
    if (oldN.nodeValue !== newN.nodeValue) oldN.nodeValue = newN.nodeValue;
    return;
  }
  if (oldN.nodeType !== 1) return;
  for (const a of [...oldN.attributes]) if (!newN.hasAttribute(a.name)) oldN.removeAttribute(a.name);
  for (const a of newN.attributes) if (oldN.getAttribute(a.name) !== a.value) oldN.setAttribute(a.name, a.value);
  morphChildren(oldN, newN);
}

function morphChildren(oldP, newP) {
  const oc = [...oldP.childNodes];
  const nc = [...newP.childNodes];
  for (let i = 0; i < nc.length; i++) {
    if (i < oc.length) morph(oc[i], nc[i]);
    else oldP.appendChild(nc[i]);
  }
  for (let i = nc.length; i < oc.length; i++) oc[i].remove();
}

// Zet de inhoud van el op html. Geeft true terug als er iets veranderde.
export function setHTML(el, html) {
  if (el._html === html) return false;
  const first = el._html === undefined;
  el._html = html;
  if (first) {
    el.innerHTML = html;
    return true;
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(el, tpl.content);
  return true;
}

// Vergeet de huidige inhoud zodat de volgende setHTML alles vervangt.
export function resetHTML(el) {
  el._html = undefined;
}
