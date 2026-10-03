# Map source data

`countries-110m.json`: Natural Earth 1:110m admin 0 countries, version 4.1.0, as TopoJSON from the world-atlas package, version 2.0.2 (https://github.com/topojson/world-atlas).

- Natural Earth data is in the public domain (https://www.naturalearthdata.com/about/terms-of-use/). Credit: Made with Natural Earth.
- The world-atlas package is under the ISC licence.
- Each country carries its three-digit ISO 3166-1 numeric code (the UN M49 code) as its id, which `copper_database/collected/usgs_country_iso.csv` uses.

`tools/build_map.py` projects it to Equal Earth and writes `docs/data/map.js` (plain SVG paths; no map library runs in the browser).
