import { AU } from '../sim/constants.js';
import { TRANSFER, heliocentricAt } from '../sim/transfer.js';
/** Legacy map uses AU-sized drawing units. Only the UI adapter converts SI. */
export function transferAt(progress) {
  const state = heliocentricAt(progress * TRANSFER.duration);
  return { ...state, ship: state.ship.map(x => x / AU), earth: state.earth.map(x => x / AU), mars: state.mars.map(x => x / AU) };
}
export const phaseStage = phase => ({ PRELAUNCH: 'ready', ASCENT: 'launch', PARKING_ORBIT: 'orbit', TMI_BURN: 'orbit',
  CRUISE: 'cruise', MOI_BURN: 'entry', MARS_ORBIT: 'entry', DEORBIT: 'entry', EDL: 'descent', LANDED: 'landed', FAILED: 'failed' })[phase];
export const PHASE_LABELS = { PRELAUNCH: 'DÜNYA / FIRLATMA RAMPASI', ASCENT: '01 / DÜNYA’DAN KALKIŞ',
  PARKING_ORBIT: '02 / DÜNYA PARK YÖRÜNGESİ', TMI_BURN: 'MARS TRANSFER ATEŞLEMESİ', CRUISE: '03 / MARS TRANSFERİ',
  MOI_BURN: 'MARS YAKALAMA ATEŞLEMESİ', MARS_ORBIT: '04 / MARS YÖRÜNGESİ', DEORBIT: 'YÖRÜNGEDEN ÇIKIŞ',
  EDL: '05 / MARS’A İNİŞ', LANDED: '06 / MARS YÜZEYİ', FAILED: 'GÖREV BAŞARISIZ' };
