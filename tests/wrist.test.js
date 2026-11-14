import { describe, expect, it, vi, afterEach } from 'vitest';
import { createMission } from '../src/sim/mission.js';
import { createColony, exampleLanding, assignAstronaut, advanceSol } from '../src/colony/mars-koloni.mjs';
import { AU, DAY } from '../src/sim/constants.js';
import { SOL } from '../src/sim/landingPayload.js';
import { CREW_RATES } from '../src/data/sls.js';
import { colonyWristData, flightWristData, wristMET } from '../src/ui/wristData.js';
import { mountWristTerminal } from '../src/ui/wristTerminal.js';

describe('ARES flight projection', () => {
  it('maps actual mission telemetry without changing it and uses the current crew count', () => {
    const telemetry = { ...createMission({ crewCount: 2 }).getTelemetry(),
      missionTime: DAY + 3661, countdown: { running: false, time: -10 } };
    const before = structuredClone(telemetry);
    const data = flightWristData(telemetry);
    expect(data.phaseLabel).toBe('DÜNYA / FIRLATMA RAMPASI');
    expect(data.met).toBe('T− 00:00:10');
    expect(data.nextEvent).toBe('Geri sayımı başlat');
    expect(data.crew).toHaveLength(2);
    for (const key of Object.keys(CREW_RATES)) {
      expect(data.resources[key].days).toBeCloseTo(320);
      expect(data.resources[key].kg).toBe(telemetry.supplies[key]);
    }
    telemetry.crew.push({ id: 'extra', health: 100 });
    expect(flightWristData(telemetry).resources.water.days).toBeCloseTo(320 * 2 / 3);
    telemetry.crew.pop();
    expect(telemetry).toEqual(before);
  });

  it('switches altitude and surface speed to AU and heliocentric speed in cruise', () => {
    const telemetry = createMission().getTelemetry();
    const near = flightWristData({ ...telemetry, phase: 'EDL', altitude: 125000, velocity: 3500, surfaceVelocity: 3400 });
    expect(near.navigation).toMatchObject({ distance: 125, distanceUnit: 'km', velocity: 3.4, velocityLabel: 'Yüzeye göre hız' });
    const cruise = flightWristData({ ...telemetry, phase: 'CRUISE', missionTime: DAY + 3661,
      heliocentric: { ship: [AU, AU, 0], speed: 30000 } });
    expect(cruise.navigation.distance).toBeCloseTo(Math.SQRT2);
    expect(cruise.navigation).toMatchObject({ distanceUnit: 'AU', velocity: 30, velocityLabel: 'Güneş’e göre hız' });
    expect(cruise.met).toBe('T+ 1g 01:01:01');
    expect(cruise.nextEvent).toBe('Mars yakalama ateşlemesi');
  });

  it('shows the real shortage, zero stock, power state and upcoming staging event', () => {
    const telemetry = createMission().getTelemetry();
    const data = flightWristData({ ...telemetry, phase: 'ASCENT',
      supplies: { oxygen: CREW_RATES.oxygen * 3 / 2, water: 0, food: CREW_RATES.food * 3 * 7 },
      cabinPower: false, stages: [{ id: 'srb', attached: true }] });
    expect(data.resources.oxygen.days).toBeCloseTo(.5);
    expect(data.resources.water.days).toBe(0);
    expect(data.resources.food.days).toBe(7);
    expect(data.power.enabled).toBe(false);
    expect(data.nextEvent).toBe('Katı itici ayrılması');
  });

  it('tolerates partial telemetry without fabricating healthy or infinite readings', () => {
    expect(() => flightWristData({ phase: 'ASCENT' })).not.toThrow();
    expect(flightWristData().resources.oxygen.days).toBeNull();
    expect(flightWristData().navigation.distance).toBeNull();
    expect(flightWristData().power.enabled).toBeNull();
    expect(wristMET(undefined)).toBe('—');
    expect(wristMET(-.02)).toBe('T− 00:00:00');
  });
});

describe('ARES colony projection', () => {
  it('converts person-sols using the living crew and the Mars sol duration', () => {
    const state = createColony(exampleLanding), before = structuredClone(state);
    const data = colonyWristData({ state, lmst: '14:22:03', headlamp: false, storm: false,
      activeTask: 'Yaşam modülünü kur', sunElevationDeg: 42 });
    expect(data).toMatchObject({ sol: 0, lmst: '14:22:03', livingCrew: 3, headlamp: false,
      storm: false, activeTask: 'Yaşam modülünü kur', sunElevationDeg: 42 });
    for (const key of Object.keys(CREW_RATES)) {
      expect(data.resources[key].personSols).toBe(12);
      expect(data.resources[key].sols).toBe(4);
      expect(data.resources[key].days).toBeCloseTo(4 * SOL / DAY);
    }
    expect(data.energy).toMatchObject({ startup: 8, battery: 0, generation: null, capacity: null });
    expect(state).toEqual(before);
    const twoAlive = { ...state, crew: state.crew.map((person, i) => ({ ...person, health: i ? 100 : 0 })) };
    expect(colonyWristData({ state: twoAlive }).resources.oxygen.sols).toBe(6);
    expect(colonyWristData({ state: twoAlive }).livingCrew).toBe(2);
  });

  it('reads colony roles and energy accounting directly from the state', () => {
    let state = createColony(exampleLanding);
    state = assignAstronaut(state, state.crew[0].id, 'construction');
    expect(colonyWristData({ state }).crew[0].roleLabel).toBe('İnşaat');
    state = advanceSol(state);
    const data = colonyWristData({ state, activeTask: { label: 'Kaynak kontrolü' } });
    const last = state.timeline.at(-1);
    expect(data.energy).toMatchObject({ generation: last.generation, used: last.used, capacity: last.capacity, battery: state.battery });
    expect(data.storm).toBe(last.storm);
    expect(data.activeTask).toBe('Kaynak kontrolü');
  });

  it('handles event overrides, optional fields, clock forms and no living crew', () => {
    const state = createColony(exampleLanding);
    expect(colonyWristData({ state, storm: true, headlamp: true, lmst: 12.5 })).toMatchObject({
      stormLabel: 'Toz fırtınası', headlamp: true, lmst: '12:30:00' });
    expect(colonyWristData({ lmst: { hours: 8, minutes: 4, seconds: 2 } }).lmst).toBe('08:04:02');
    expect(colonyWristData({ lmst: 24 }).lmst).toBe('00:00:00');
    expect(colonyWristData()).toMatchObject({ sol: null, lmst: null, storm: null, headlamp: null, livingCrew: 0 });
    const dead = { ...state, crew: state.crew.map(person => ({ ...person, health: 0 })) };
    expect(colonyWristData({ state: dead }).resources.food.days).toBeNull();
    expect(colonyWristData({ state: dead }).resources.food.personSols).toBe(12);
  });
});

// Minimal event/element fixture: test input and disposal without starting a browser/WebGL.
function terminalFixture() {
  const win = new EventTarget();
  win.setInterval = setInterval; win.clearInterval = clearInterval;
  const element = () => Object.assign(new EventTarget(), {
    textContent: '', innerHTML: '', inert: false,
    classList: { toggle: vi.fn() }, setAttribute: vi.fn(), remove: vi.fn(), contains: () => false,
  });
  const host = element(), tabs = Array.from({ length: 4 }, element), nodes = new Map();
  host.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  host.querySelectorAll = () => tabs;
  const doc = { defaultView: win, createElement: () => host, activeElement: null };
  const root = { ownerDocument: doc, append: vi.fn() };
  function key(code, options = {}, type = 'keydown') {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { code, key: code === 'AltLeft' ? 'Alt' : code, ...options });
    win.dispatchEvent(event);
    return event;
  }
  return { root, win, host, nodes, tabs, key };
}

afterEach(() => { vi.useRealTimers(); });

describe('ARES keyboard and lifecycle', () => {
  it('keeps decorative grip layers outside the interactive case and follows host lighting', () => {
    vi.useFakeTimers();
    const fixture = terminalFixture();
    const exitPointerLock = vi.fn();
    fixture.root.ownerDocument.exitPointerLock = exitPointerLock;
    let data = flightWristData();
    const terminal = mountWristTerminal({ root: fixture.root, getData: () => data });
    const markup = fixture.host.innerHTML;
    expect(markup.indexOf('ares-grip-back')).toBeLessThan(markup.indexOf('<section class="ares-case"'));
    expect(markup.indexOf('ares-grip-front')).toBeGreaterThan(markup.indexOf('</section>'));
    expect(markup.match(/alt="" aria-hidden="true" draggable="false"/g)).toHaveLength(2);
    expect(markup).not.toContain('class="ares-sleeve"');
    expect(fixture.host.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true');
    terminal.setRaised(true);
    expect(fixture.nodes.get('.ares-arm').inert).toBe(false);
    expect(fixture.host.setAttribute).toHaveBeenCalledWith('aria-hidden', 'false');
    expect(fixture.host.setAttribute).toHaveBeenCalledWith('data-light', 'cabin');
    data = colonyWristData(); terminal.update();
    expect(fixture.host.setAttribute).toHaveBeenCalledWith('data-light', 'mars');
    fixture.tabs[2].dispatchEvent(new Event('click'));
    expect(terminal.screen).toBe(2);
    fixture.nodes.get('.ares-close').dispatchEvent(new Event('click'));
    expect(terminal.raised).toBe(false);
    expect(fixture.nodes.get('.ares-arm').inert).toBe(true);
    expect(exitPointerLock).not.toHaveBeenCalled();
    terminal.dispose();
  });

  it('toggles once with Alt/Q, cycles with Tab/Shift+Tab/wheel, closes with Escape and releases listeners', () => {
    vi.useFakeTimers();
    const fixture = terminalFixture(), onToggle = vi.fn();
    const terminal = mountWristTerminal({ root: fixture.root, getData: () => colonyWristData(), onToggle });
    const legacyKeyHandler = vi.fn();
    fixture.win.addEventListener('keydown', legacyKeyHandler);
    expect(fixture.key('AltLeft').defaultPrevented).toBe(true);
    expect(terminal.raised).toBe(true);
    fixture.key('AltLeft', { repeat: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(fixture.key('AltLeft', {}, 'keyup').defaultPrevented).toBe(true);
    fixture.key('Tab'); expect(terminal.screen).toBe(1);
    fixture.key('Tab', { shiftKey: true }); expect(terminal.screen).toBe(0);
    const wheel = new Event('wheel', { cancelable: true }); Object.assign(wheel, { deltaY: -10 });
    fixture.win.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true); expect(terminal.screen).toBe(3);
    expect(fixture.key('Escape').defaultPrevented).toBe(true);
    expect(terminal.raised).toBe(false);
    expect(fixture.key('Escape').defaultPrevented).toBe(false);
    legacyKeyHandler.mockClear();
    fixture.key('KeyQ'); expect(terminal.raised).toBe(true);
    expect(legacyKeyHandler).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    terminal.dispose(); terminal.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(fixture.host.remove).toHaveBeenCalledTimes(1);
    expect(fixture.key('KeyQ').defaultPrevented).toBe(false);
  });

  it('refreshes live data only when raised, escapes task text and supports silent host synchronization', () => {
    vi.useFakeTimers();
    const fixture = terminalFixture(), onToggle = vi.fn();
    let detail = { state: createColony(exampleLanding), activeTask: '<img src=x onerror=alert(1)>' };
    const getData = vi.fn(() => colonyWristData(detail));
    const terminal = mountWristTerminal({ root: fixture.root, getData, onToggle });
    vi.advanceTimersByTime(1000); expect(getData).not.toHaveBeenCalled();
    terminal.setRaised(true); expect(onToggle).not.toHaveBeenCalled();
    expect(fixture.nodes.get('.ares-content').innerHTML).toContain('&lt;img');
    detail = { ...detail, state: { ...detail.state, sol: 3 } };
    vi.advanceTimersByTime(250);
    expect(fixture.nodes.get('[data-ares-phase]').textContent).toContain('SOL 3');
    terminal.setRaised(false); expect(vi.getTimerCount()).toBe(0);
    terminal.dispose();
  });
});
