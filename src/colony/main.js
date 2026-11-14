import { bindEclss } from './ihan/eclss.mjs';
// Colony page entry. Scene, FPS and colony rules: İhan (src/colony/scene, mars-koloni.mjs, mars-atolye.mjs).
import { createColony, createColonyFromFlight, exampleLanding } from './mars-koloni.mjs';
import { readLandingPayload } from './handoff.js';
import { mountWristTerminal } from '../ui/wristTerminal.js';
import { colonyWristData } from '../ui/wristData.js';
import { REALISM_NOTES, REALISM_SOURCES } from './realism.js';
// DASHBOARD: independent read-only observer; scene hooks remain owned by the host.
import { mountDashboard } from './dashboard.mjs';

const landing = readLandingPayload(exampleLanding);
// ARES integration: subscribe before the scene emits its first colony:state snapshot.
// The initial projection is read-only; the scene remains the sole colony state owner.
// Flight payload supplies are crew-sols; İhan's createColonyFromFlight converts them to person-sols.
let wristDetail = { state: landing.source === 'flight' ? createColonyFromFlight(landing) : createColony(landing) };
// DASHBOARD: capture overlay keys before wrist and scene listeners are registered.
const dashboard = mountDashboard({ onOpen: () => { closeDrawer(false); wrist.setRaised(false); } });
const wrist = mountWristTerminal({ root: document.querySelector('main') ?? document.body,
  getData: () => colonyWristData(wristDetail) });
function onColonyState(event) {
  if (!event.detail || typeof event.detail !== 'object') return;
  wristDetail = { ...wristDetail, ...event.detail, state: event.detail.state ?? wristDetail.state };
  // The terminal samples at 4 Hz while raised, even if the scene publishes every frame.
}
window.addEventListener('colony:state', onColonyState);
function disposeWrist() {
  wrist.dispose();
  window.removeEventListener('colony:state', onColonyState);
  window.removeEventListener('pagehide', onPageHide);
}
function onPageHide(event) { if (!event.persisted) disposeWrist(); }
window.addEventListener('pagehide', onPageHide);
if (import.meta.hot) import.meta.hot.dispose(disposeWrist);
// Dynamic import ensures the event listener above exists before scene initialization.
void import('./scene/mars-demo.mjs');
const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const target = document.getElementById('landing-source');
if (target) {
  const s = landing.supplies;
  const source = document.createElement('b');
  source.textContent = landing.source === 'flight' ? 'Uçuştan gelen iniş verisi' : 'Örnek iniş verisi';
  target.replaceChildren(source, document.createTextNode(' · Jezero Krateri'));
  target.title = `İniş stoku · O₂ ${number.format(s.oxygen)} · Su ${number.format(s.water)} · Yiyecek ${number.format(s.food)} ${landing.source === 'flight' ? 'ekip-solü' : 'kişi-sol'} · Yedek parça ${number.format(s.spareParts)} adet`;
}

// UI-only drawer controller. Scene controls keep their original IDs and handlers.
const canvas = document.getElementById('scene');
const toggles = [...document.querySelectorAll('[data-drawer]')];
const drawers = [...document.querySelectorAll('.colony-drawer')];
const events = new AbortController();
const disposeEclss = bindEclss();
const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: events.signal });
let activeDrawer = null;

function showDrawer(id) {
  activeDrawer = id;
  document.body.classList.toggle('drawer-open', Boolean(id));
  for (const drawer of drawers) drawer.hidden = drawer.id !== id;
  for (const toggle of toggles) toggle.setAttribute('aria-expanded', String(toggle.dataset.drawer === id));
}

function closeDrawer(returnFocus = true) {
  const previous = activeDrawer;
  showDrawer(null);
  if (returnFocus) toggles.find(toggle => toggle.dataset.drawer === previous)?.focus({ preventScroll: true });
}

// DASHBOARD: release observer listeners and its timer on page teardown.
listen(window, 'pagehide', event => { if (!event.persisted) dashboard.dispose(); });
if (import.meta.hot) import.meta.hot.dispose(() => dashboard.dispose());

for (const toggle of toggles) listen(toggle, 'click', () => {
  showDrawer(activeDrawer === toggle.dataset.drawer ? null : toggle.dataset.drawer);
});
for (const button of document.querySelectorAll('[data-close-drawer]')) listen(button, 'click', () => closeDrawer());

listen(document, 'keydown', event => {
  if (event.code !== 'Escape' || !activeDrawer || document.pointerLockElement === canvas) return;
  // Consume Escape only when closing our drawer; leave terminal and FPS handling alone otherwise.
  event.preventDefault();
  event.stopImmediatePropagation();
  closeDrawer();
}, { capture: true });

listen(document, 'pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  document.body.classList.toggle('pointer-locked', locked);
  if (locked) closeDrawer(false);
});
// Clicking the world dismisses a drawer without cancelling the scene's own interaction.
listen(canvas, 'pointerdown', () => closeDrawer(false));
listen(document.getElementById('view-mode'), 'click', () => {
  closeDrawer(false);
  canvas.focus({ preventScroll: true });
});

const notesRoot = document.getElementById('realism-notes');
for (const note of REALISM_NOTES) {
  const article = document.createElement('article');
  article.id = `realism-${note.id}`;
  article.className = 'realism-note';
  article.tabIndex = -1;
  const title = document.createElement('h3');
  title.textContent = note.title;
  const text = document.createElement('p');
  text.textContent = note.text;
  const sources = document.createElement('p');
  note.sources.forEach((key, index) => {
    if (index) sources.append(' · ');
    const source = REALISM_SOURCES[key];
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = source.label;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    sources.append(link);
  });
  article.append(title, text, sources);
  notesRoot.append(article);
}
for (const button of document.querySelectorAll('[data-realism]')) {
  const note = REALISM_NOTES.find(item => item.id === button.dataset.realism);
  button.title = note.text;
  listen(button, 'click', () => {
    showDrawer('realism-drawer');
    const article = document.getElementById(`realism-${note.id}`);
    article.focus({ preventScroll: true });
    article.scrollIntoView({ block: 'nearest' });
  });
}

// Full-page navigation owns this controller; release listeners on teardown.
listen(window, 'pagehide', event => { if (!event.persisted) { events.abort(); disposeEclss(); } });
if (import.meta.hot) import.meta.hot.dispose(() => {events.abort(); disposeEclss();});

import './ihan/power-mission.mjs'; // İhan 96b5438: three-sol microgrid mission (drawer 09)
