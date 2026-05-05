// Geolocation helpers — extract location data from the Cloudflare request object.
// Cloudflare provides this for free on every request via request.cf.

const CONTINENT_NAMES = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
};

/**
 * Extract city/country/continent/lat/lng from a Cloudflare-tagged request.
 * Returns null fields gracefully when CF data is missing (e.g., during local
 * dev when `request.cf` is undefined).
 */
export function extractGeo(request) {
  const cf = request.cf || {};
  const country = cf.country || null;
  const continent = cf.continent || null;
  const city = cf.city || null;
  const region = cf.region || null;
  const lat = cf.latitude ? parseFloat(cf.latitude) : null;
  const lng = cf.longitude ? parseFloat(cf.longitude) : null;

  let country_name = null;
  if (country) {
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      country_name = dn.of(country) || null;
    } catch {
      country_name = country;
    }
  }

  const continent_name = continent ? (CONTINENT_NAMES[continent] || null) : null;

  return {
    country,
    country_name,
    continent,
    continent_name,
    city,
    region,
    lat,
    lng,
  };
}
