const DAY = 86400;
const AU = 149597870.7;
const SUN_MU = 132712440018;
const EARTH_MU = 398600.4418;
const MARS_MU = 42828.375;
const earth = AU;
const mars = 1.523679 * AU;
const semiMajor = (earth + mars) / 2;
const eccentricity = (mars - earth) / (mars + earth);
const duration = Math.PI * Math.sqrt(semiMajor ** 3 / SUN_MU);
const marsRate = Math.sqrt(SUN_MU / mars ** 3);
const phase = Math.PI - marsRate * duration;
const earthVInfinity = Math.sqrt(SUN_MU * (2 / earth - 1 / semiMajor)) - Math.sqrt(SUN_MU / earth);
const marsVInfinity = Math.sqrt(SUN_MU / mars) - Math.sqrt(SUN_MU * (2 / mars - 1 / semiMajor));
const departureBurn = (mu, radius, excess) => Math.sqrt(excess ** 2 + 2 * mu / radius) - Math.sqrt(mu / radius);

export const flight = {
  travelDays: duration / DAY,
  phaseDegrees: phase * 180 / Math.PI,
  earthOrbitSpeed: Math.sqrt(EARTH_MU / 6578.137),
  injection: departureBurn(EARTH_MU, 6578.137, earthVInfinity),
  capture: departureBurn(MARS_MU, 3639.5, marsVInfinity)
};

export function transferAt(progress) {
  const mean = Math.PI * progress;
  let anomaly = mean;
  for (let i = 0; i < 6; i++) {
    anomaly -= (anomaly - eccentricity * Math.sin(anomaly) - mean) / (1 - eccentricity * Math.cos(anomaly));
  }
  const radius = semiMajor * (1 - eccentricity * Math.cos(anomaly));
  const earthAngle = Math.sqrt(SUN_MU / earth ** 3) * duration * progress;
  const marsAngle = phase + marsRate * duration * progress;
  return {
    ship: [semiMajor * (Math.cos(anomaly) - eccentricity) / AU, semiMajor * Math.sqrt(1 - eccentricity ** 2) * Math.sin(anomaly) / AU],
    earth: [Math.cos(earthAngle), Math.sin(earthAngle)],
    mars: [mars * Math.cos(marsAngle) / AU, mars * Math.sin(marsAngle) / AU],
    speed: Math.sqrt(SUN_MU * (2 / radius - 1 / semiMajor)),
    days: duration * progress / DAY
  };
}
