# Credits and licences

## Fonts (self-hosted in `docs/fonts/`)

- **Newsreader** (titles, questions, big figures; variable, optical size and weight, normal and italic), Copyright 2020 The Newsreader Project Authors, <https://github.com/productiontype/Newsreader>. Licensed under the SIL Open Font License 1.1 (`docs/fonts/OFL-Newsreader.txt`). Used unmodified, in Latin subsets.
- **Atkinson Hyperlegible Next** (text, labels and the small capitals; 400, 500, 600 and 700), Copyright 2020-2024 The Atkinson Hyperlegible Next Project Authors, <https://github.com/googlefonts/atkinson-hyperlegible-next> (designed for the Braille Institute of America). Licensed under the SIL Open Font License 1.1 (`docs/fonts/OFL-Atkinson-Hyperlegible-Next.txt`). Used unmodified, in a Latin subset. The woff2 files are the Fontsource packaging of the project's release (npm `@fontsource/atkinson-hyperlegible-next`, version 5.3.0).
- **Atkinson Hyperlegible Mono** (axis ticks, readouts and figures in tables; 400 and 500), Copyright 2020-2024 The Atkinson Hyperlegible Mono Project Authors, <https://github.com/googlefonts/atkinson-hyperlegible-next-mono>. Licensed under the SIL Open Font License 1.1 (`docs/fonts/OFL-Atkinson-Hyperlegible-Mono.txt`). Used unmodified, in a Latin subset. Same packaging (npm `@fontsource/atkinson-hyperlegible-mono`).

## Code ideas

- **Liquid glass.** The glass on the nav bars, the filter bar, the opener plaque and the closing panel (`docs/js/glass.js`) follows the idea of **liquid-glass-react** by rdev, <https://github.com/rdev/liquid-glass-react>, MIT licence: a rim lens made with an SVG displacement map, a colour split at the rim, light frost and a highlight that follows the pointer. It is rebuilt in plain JavaScript and SVG; no code from the library is included and React is not used. MIT licence text: Copyright (c) rdev, permission is granted to use, copy, modify and distribute the software, provided the copyright notice and permission notice are included in copies of the software itself.

The opener photo (`docs/img/copper-plate.jpg`) is not part of the repository until its licence is confirmed; without it the opener is plain ink.

Nothing is loaded from the web when the site runs.

## Data shown on the site

| What | Source | Licence and credit |
|---|---|---|
| Copper prices (monthly, nominal, from 1960) | World Bank Commodity Price Data (The Pink Sheet) | Open data, CC BY 4.0 as the World Bank's default licence for datasets it produces (<https://datacatalog.worldbank.org/public-licenses>). Credit: *adapted from World Bank Commodity Price Data*. Changes made: deflated with US CPI, rebased or turned into monthly changes, as described on each page. The licence line for the Pink Sheet itself is still to be confirmed (see `copper_database/collected/sources.csv`, S02) |
| US inflation (CPIAUCSL) | U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban Consumers: All Items in U.S. City Average, retrieved from FRED, Federal Reserve Bank of St. Louis | Public domain, citation requested |
| Broad dollar index (DTWEXBGS), euro exchange rate (EXUSEU), 10-year yield (GS10) | Board of Governors of the Federal Reserve System (US), retrieved from FRED, Federal Reserve Bank of St. Louis | Public domain, citation requested |
| Gold, tin, aluminium and Brent oil prices on the Dashboard | World Bank Commodity Price Data (The Pink Sheet) | Same licence and credit line as the copper prices (CC BY 4.0; the Pink Sheet licence line is still to be confirmed). Gold and tin are also shown in the story |
| Missing October 2025 US CPI | U.S. Bureau of Labor Statistics, 2025 federal government shutdown impact on the CPI (FAQ) | Public domain (US government work) |

| Mine output and reserves by country | US Geological Survey, Mineral Commodity Summaries 2026, copper | US government work; generally public domain (see `sources.csv`, S06) |
| World outline for the supply map | Natural Earth, 1:110m admin 0 country boundaries, version 4.1.0 (<https://www.naturalearthdata.com/>) | Public domain. Made with Natural Earth |
| Map data as TopoJSON | world-atlas 2.0.2 (<https://github.com/topojson/world-atlas>) | ISC licence; the data is Natural Earth. The outline is projected to Equal Earth by `tools/build_map.py` |
| Country codes (ISO alpha-3 and UN M49) | United Nations Statistics Division, M49 standard | Codes cited |
| Dates and facts in the chart events | Federal Reserve History (S22, S23, S27), World Health Organization (S24), Freeport-McMoRan news release (S26) | Facts cited with a link, no text copied; see `collected/events.csv` and `sources.csv` |
| Electric-car and data-centre scenario inputs | International Energy Agency (S05, S15, S21); copper per car and per MW from secondary articles (S11, S13) | IEA terms to be confirmed before publishing; see `copper_database/README.md` |

The full list, with reliability and licence notes, is in `copper_database/collected/sources.csv` and on the data-quality page of the site.

## Not published

The London Metal Exchange (LME) price series is commercial data and is **not** shown or published anywhere on this site or in this repository. The one result that was computed from it (the month-end robustness check) is provided as derived statistics only.

## Everything else

Charts, text and code are the author's own work (Behindokht Alipour). Historical results are not forecasts and not investment advice.
