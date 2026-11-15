import {expect,it} from 'vitest';
import {atLocalTime,marsSun} from '../src/sim/marsSun.js';
import {createPowerController} from '../src/colony/ihan/power/controller.mjs';
import {groupStatus} from '../src/colony/ihan/power/group-hmi.mjs';

it('follows the scene sun even if the selected projection season would still be in daylight',()=>{
  const clock=atLocalTime(Date.UTC(2025,9,14)/1000,17.9*3600);
  const p=createPowerController();
  p.controls.season=90;
  p.controls.blackStart=false;
  const environment=unixSeconds=>{
    const sun=marsSun(unixSeconds);
    return {unixSeconds,lmst:sun.lmst/3600,sunElevationDeg:sun.elevation*180/Math.PI};
  };
  const first=environment(clock);
  expect(first.sunElevationDeg).toBeLessThan(0);
  p.update(first,true);
  p.update(environment(clock+5),true);
  const {daylight,production,groups}=p.telemetry.live;
  expect(daylight).toBe(false);
  expect(production).toBe(0);
  expect(groups.every(group=>group.charge===0)).toBe(true);
  expect(groups.map(group=>groupStatus({...group,daylight}))).toContain('Batarya güç veriyor');
  expect(groups.map(group=>groupStatus({...group,daylight}))).toContain('Gece · Güneş üretimi yok');
});

it('keeps low twilight readings consistent with the displayed kW and shows daylight charging',()=>{
  expect(groupStatus({daylight:true,draw:0,charge:0,pv:.004})).toBe('Güneş üretimi yok');
  expect(groupStatus({daylight:true,draw:0,charge:.5,pv:1})).toBe('Batarya şarj oluyor');
});
