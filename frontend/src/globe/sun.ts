/**
 * Where the sun is overhead (the subsolar point) at a given moment, for the day/night line.
 * Uses the U.S. Naval Observatory's low-precision formulas, good to about 0.01 degree
 * between 1950 and 2050, which is far finer than the globe can show.
 */

const DEG = Math.PI / 180;
const DAY_MS = 86_400_000;
/** Julian date of the Unix epoch, and of J2000.0. */
const JD_UNIX_EPOCH = 2_440_587.5;
const JD_J2000 = 2_451_545.0;

export interface SubsolarPoint {
  /** Latitude in degrees (the sun's declination). */
  lat: number;
  /** Longitude in degrees, -180 to 180. */
  lng: number;
}

function normalize180(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/** The point on Earth where the sun is directly overhead at `date`. */
export function sunPosition(date: Date): SubsolarPoint {
  const ms = date.getTime();
  const d = ms / DAY_MS + JD_UNIX_EPOCH - JD_J2000;

  const meanAnomaly = (357.529 + 0.98560028 * d) * DEG;
  const meanLongitude = 280.459 + 0.98564736 * d;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG;
  const obliquity = (23.439 - 0.00000036 * d) * DEG;

  const rightAscension =
    Math.atan2(
      Math.cos(obliquity) * Math.sin(eclipticLongitude),
      Math.cos(eclipticLongitude),
    ) / DEG;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude)) / DEG;

  // Equation of time, in degrees of rotation (1 degree = 4 minutes).
  const equationOfTime = normalize180(meanLongitude - rightAscension);
  const utcHours = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / 3_600_000;

  return {
    lat: declination,
    lng: normalize180(-15 * (utcHours - 12) - equationOfTime),
  };
}
