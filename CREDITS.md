# Credits and licences

## Fonts (self-hosted in `docs/fonts/`)

- **Merriweather** (headings), Copyright The Merriweather Project Authors, <https://github.com/EbenSorkin/Merriweather4>. Licensed under the SIL Open Font License 1.1 (`docs/fonts/OFL-Merriweather.txt`). Used unmodified, in the Latin subsets distributed by Fontsource.
- **Open Sans** (text, tabular numerals), Copyright The Open Sans Project Authors, <https://github.com/googlefonts/opensans>. Licensed under the SIL Open Font License 1.1 (`docs/fonts/OFL-OpenSans.txt`). Used unmodified, in the Latin subsets distributed by Fontsource.

Nothing is loaded from the web when the site runs.

## Data shown on the site

| What | Source | Licence and credit |
|---|---|---|
| Copper prices (monthly, nominal, from 1960) | World Bank Commodity Price Data (The Pink Sheet) | Open data, CC BY 4.0 as the World Bank's default licence for datasets it produces (<https://datacatalog.worldbank.org/public-licenses>). Credit: *adapted from World Bank Commodity Price Data*. Changes made: deflated with US CPI, rebased or turned into monthly changes, as described on each page. The licence line for the Pink Sheet itself is still to be confirmed (see `copper_database/collected/sources.csv`, S02) |
| US inflation (CPIAUCSL) | U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban Consumers: All Items in U.S. City Average, retrieved from FRED, Federal Reserve Bank of St. Louis | Public domain, citation requested |
| Broad dollar index (DTWEXBGS), euro exchange rate (EXUSEU), 10-year yield (GS10) | Board of Governors of the Federal Reserve System (US), retrieved from FRED, Federal Reserve Bank of St. Louis | Public domain, citation requested |
| Missing October 2025 US CPI | U.S. Bureau of Labor Statistics, 2025 federal government shutdown impact on the CPI (FAQ) | Public domain (US government work) |

Pages not built yet will add their sources here when they go live (IEA, USGS and the secondary articles are listed in `copper_database/collected/sources.csv` with their reliability and licence notes).

## Not published

The London Metal Exchange (LME) price series is commercial data and is **not** shown or published anywhere on this site or in this repository. The one result that was computed from it (the month-end robustness check) is provided as derived statistics only.

## Everything else

Charts, text and code are the author's own work (Behindokht Alipour). Historical results are not forecasts and not investment advice.
