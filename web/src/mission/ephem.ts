// Low-precision Sun and Moon positions (Meeus, "Astronomical Algorithms", ch. 25 and 47,
// main terms only: Moon longitude ~0.3 deg, latitude ~0.2 deg, distance ~1,000 km) and
// Earth rotation (GMST). Good enough for phases, declination and lighting; not for navigation.

const D2R = Math.PI / 180;
const sinD = (d: number) => Math.sin(d * D2R);
const cosD = (d: number) => Math.cos(d * D2R);
const norm360 = (d: number) => ((d % 360) + 360) % 360;

export function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

const centuries = (jd: number) => (jd - 2451545.0) / 36525;

export function obliquityDeg(jd: number): number {
  return 23.439291 - 0.0130042 * centuries(jd);
}

/** Geocentric ecliptic longitude/latitude (deg) and distance (km) of the Moon. */
export function moonEcliptic(jd: number): { lon: number; lat: number; distKm: number } {
  const T = centuries(jd);
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const lon = Lp + 6.288774 * sinD(Mp) + 1.274027 * sinD(2 * D - Mp) + 0.658314 * sinD(2 * D)
    + 0.213618 * sinD(2 * Mp) - 0.185116 * sinD(M) - 0.114332 * sinD(2 * F)
    + 0.058793 * sinD(2 * D - 2 * Mp) + 0.057066 * sinD(2 * D - M - Mp) + 0.053322 * sinD(2 * D + Mp)
    + 0.045758 * sinD(2 * D - M) - 0.040923 * sinD(M - Mp) - 0.03472 * sinD(D) - 0.030383 * sinD(M + Mp);
  const lat = 5.128122 * sinD(F) + 0.280602 * sinD(Mp + F) + 0.277693 * sinD(Mp - F)
    + 0.173237 * sinD(2 * D - F) + 0.055413 * sinD(2 * D - F + Mp) + 0.046271 * sinD(2 * D - F - Mp);
  const distKm = 385000.56 - 20905.355 * cosD(Mp) - 3699.111 * cosD(2 * D - Mp) - 2955.968 * cosD(2 * D)
    - 569.925 * cosD(2 * Mp) + 48.888 * cosD(M) - 3.149 * cosD(2 * F) + 246.158 * cosD(2 * D - 2 * Mp)
    - 152.138 * cosD(2 * D - M - Mp) - 170.733 * cosD(2 * D + Mp) - 204.586 * cosD(2 * D - M);
  return { lon: norm360(lon), lat, distKm };
}

/** Geocentric ecliptic longitude of the Sun (deg). */
export function sunLongitude(jd: number): number {
  const T = centuries(jd);
  const L0 = 280.46646 + 36000.76983 * T;
  const M = 357.52911 + 35999.05029 * T;
  const C = (1.914602 - 0.004817 * T) * sinD(M) + 0.019993 * sinD(2 * M) + 0.000289 * sinD(3 * M);
  return norm360(L0 + C);
}

/** Ecliptic (lon, lat) -> equatorial declination and right ascension (deg). */
export function eclipticToEquatorial(lonDeg: number, latDeg: number, jd: number): { ra: number; dec: number } {
  const e = obliquityDeg(jd);
  const dec = Math.asin(sinD(latDeg) * cosD(e) + cosD(latDeg) * sinD(e) * sinD(lonDeg)) / D2R;
  const ra = Math.atan2(sinD(lonDeg) * cosD(e) - Math.tan(latDeg * D2R) * sinD(e), cosD(lonDeg)) / D2R;
  return { ra: norm360(ra), dec };
}

/** Greenwich mean sidereal time (deg). */
export function gmstDeg(jd: number): number {
  const T = centuries(jd);
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T);
}

/** Moon-Sun elongation (deg, 0 = new, 180 = full), measured eastward so it grows while waxing. */
export function elongationDeg(jd: number): number {
  return norm360(moonEcliptic(jd).lon - sunLongitude(jd));
}

export function illuminatedFraction(jd: number): number {
  return (1 - cosD(elongationDeg(jd))) / 2;
}

export function phaseName(jd: number): string {
  const e = elongationDeg(jd);
  const names: [number, string][] = [[22.5, "New Moon"], [67.5, "Waxing crescent"], [112.5, "First quarter"], [157.5, "Waxing gibbous"],
    [202.5, "Full Moon"], [247.5, "Waning gibbous"], [292.5, "Last quarter"], [337.5, "Waning crescent"], [360, "New Moon"]];
  return names.find(([lim]) => e < lim)![1];
}

/** Selenographic longitude/latitude of the sub-solar point (Meeus ch. 53, nutation ignored). */
export function subSolarPoint(jd: number): { lon: number; lat: number } {
  const T = centuries(jd);
  const m = moonEcliptic(jd);
  const ls = sunLongitude(jd);
  const R = 149597870.7; // Sun distance ~1 AU is fine at this precision
  const k = m.distKm / R;
  const lamH = ls + 180 + (k * 57.296) * cosD(m.lat) * sinD(ls - m.lon);
  const betH = k * m.lat;
  const F = 93.272095 + 483202.0175233 * T;
  const Om = 125.0445479 - 1934.1362891 * T;
  const I = 1.54242;
  const W = lamH - Om;
  const A = Math.atan2(sinD(W) * cosD(betH) * cosD(I) - sinD(betH) * sinD(I), cosD(W) * cosD(betH)) / D2R;
  const lon = norm360(A - F);
  const lat = Math.asin(-sinD(W) * cosD(betH) * sinD(I) - sinD(betH) * cosD(I)) / D2R;
  return { lon: lon > 180 ? lon - 360 : lon, lat };
}

/** Sun elevation (deg) at a lunar site (selenographic lat/lon, east positive); morning = Sun rising. */
export function lunarSunElevation(jd: number, latDeg: number, lonDeg: number): { elev: number; morning: boolean } {
  const s = subSolarPoint(jd);
  let dl = norm360(s.lon - lonDeg);
  if (dl > 180) dl -= 360; // sun east of site (dl > 0) = morning
  const elev = Math.asin(sinD(latDeg) * sinD(s.lat) + cosD(latDeg) * cosD(s.lat) * cosD(dl)) / D2R;
  return { elev, morning: dl > 0 };
}

export const APOLLO11 = { lat: 0.674, lon: 23.473 }; // Tranquility Base, NASA/LROC

/** Moon unit vector in the ecliptic frame (x to the vernal equinox). */
export function moonDirEcliptic(jd: number): [number, number, number] {
  const m = moonEcliptic(jd);
  return [cosD(m.lat) * cosD(m.lon), cosD(m.lat) * sinD(m.lon), sinD(m.lat)];
}

/** Sun unit vector in the ecliptic frame. */
export function sunDirEcliptic(jd: number): [number, number, number] {
  const l = sunLongitude(jd);
  return [cosD(l), sinD(l), 0];
}

/** Equatorial (x to equinox, z to north pole) -> ecliptic frame. */
export function equatorialToEcliptic(v: [number, number, number], jd: number): [number, number, number] {
  const e = obliquityDeg(jd);
  return [v[0], cosD(e) * v[1] + sinD(e) * v[2], -sinD(e) * v[1] + cosD(e) * v[2]];
}

/** Launch-site position (unit vector) in the equatorial inertial frame at a given time. */
export function siteEquatorial(latDeg: number, lonDeg: number, jd: number): [number, number, number] {
  const a = gmstDeg(jd) + lonDeg;
  return [cosD(latDeg) * cosD(a), cosD(latDeg) * sinD(a), sinD(latDeg)];
}

/** Selenographic longitude/latitude of the sub-Earth point: the optical librations l, b
 * (Meeus ch. 53, nutation ignored). The Moon nods by up to ~7.9 deg in longitude and ~6.7 deg in latitude. */
export function subEarthPoint(jd: number): { lon: number; lat: number } {
  const T = centuries(jd);
  const m = moonEcliptic(jd);
  const F = 93.272095 + 483202.0175233 * T;
  const Om = 125.0445479 - 1934.1362891 * T;
  const I = 1.54242;
  const W = m.lon - Om;
  const A = Math.atan2(sinD(W) * cosD(m.lat) * cosD(I) - sinD(m.lat) * sinD(I), cosD(W) * cosD(m.lat)) / D2R;
  const lon = norm360(A - F);
  const lat = Math.asin(-sinD(W) * cosD(m.lat) * sinD(I) - sinD(m.lat) * cosD(I)) / D2R;
  return { lon: lon > 180 ? lon - 360 : lon, lat };
}

/** Elevation of Earth's centre (deg) above a flat horizon at a lunar site. */
export function lunarEarthElevation(jd: number, latDeg: number, lonDeg: number): number {
  const e = subEarthPoint(jd);
  return Math.asin(sinD(latDeg) * sinD(e.lat) + cosD(latDeg) * cosD(e.lat) * cosD(lonDeg - e.lon)) / D2R;
}
