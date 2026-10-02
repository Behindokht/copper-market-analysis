-- 01_staging.sql
-- Staging layer: one stg_ table per source, built only from raw_ tables.
-- Staging fixes types, turns non-numeric cells into NULL and drops them, and trims text.
-- No joins between sources here (that is the marts layer).

DROP TABLE IF EXISTS stg_wb_prices_monthly;

-- World Bank Pink Sheet, monthly, long format.
-- raw period looks like '2026M08'. A value counts as a number only if it holds nothing but digits, '.', 'e', '+', '-'
-- (CAST alone would turn text such as '..' into 0, which would be a silent wrong price).
CREATE TABLE stg_wb_prices_monthly AS
SELECT
    substr(period_raw, 1, 4) || '-' || substr(period_raw, 6, 2) || '-01' AS date,
    trim(commodity_raw)                                                   AS commodity,
    trim(COALESCE(unit_raw, ''), '() ')                                   AS unit,
    CAST(value_raw AS REAL)                                               AS value,
    source_id
FROM raw_wb_prices_monthly
WHERE period_raw GLOB '[0-9][0-9][0-9][0-9]M[0-1][0-9]'
  AND value_raw GLOB '*[0-9]*'
  AND value_raw NOT GLOB '*[^0-9.eE+-]*';

CREATE INDEX ix_stg_wb ON stg_wb_prices_monthly(commodity, date);

-- FRED monthly series in long format (series_id, date, value). One raw table per series; the value column of each
-- raw table is named after the series. Same number guard as above; the date must look like YYYY-MM-DD.
DROP TABLE IF EXISTS stg_fred_monthly;
CREATE TABLE stg_fred_monthly AS
SELECT 'PALUMUSDM' AS series_id, trim(observation_date) AS date, CAST(PALUMUSDM AS REAL) AS value, source_id
FROM raw_fred_palumusdm
WHERE observation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND PALUMUSDM GLOB '*[0-9]*' AND PALUMUSDM NOT GLOB '*[^0-9.eE+-]*'
UNION ALL
SELECT 'CPIAUCSL', trim(observation_date), CAST(CPIAUCSL AS REAL), source_id
FROM raw_fred_cpiaucsl
WHERE observation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND CPIAUCSL GLOB '*[0-9]*' AND CPIAUCSL NOT GLOB '*[^0-9.eE+-]*'
UNION ALL
SELECT 'EXUSEU', trim(observation_date), CAST(EXUSEU AS REAL), source_id
FROM raw_fred_exuseu
WHERE observation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND EXUSEU GLOB '*[0-9]*' AND EXUSEU NOT GLOB '*[^0-9.eE+-]*'
UNION ALL
SELECT 'GS10', trim(observation_date), CAST(GS10 AS REAL), source_id
FROM raw_fred_gs10
WHERE observation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND GS10 GLOB '*[0-9]*' AND GS10 NOT GLOB '*[^0-9.eE+-]*';

CREATE INDEX ix_stg_fred ON stg_fred_monthly(series_id, date);

-- Broad dollar index, daily. The raw file has blank values on days with no published value (holidays); they are dropped here.
DROP TABLE IF EXISTS stg_fred_dtwexbgs_daily;
CREATE TABLE stg_fred_dtwexbgs_daily AS
SELECT trim(observation_date) AS date, CAST(DTWEXBGS AS REAL) AS value, source_id
FROM raw_fred_dtwexbgs
WHERE observation_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND DTWEXBGS GLOB '*[0-9]*' AND DTWEXBGS NOT GLOB '*[^0-9.eE+-]*';

CREATE INDEX ix_stg_dtwexbgs ON stg_fred_dtwexbgs_daily(date);

-- IEA Global EV Outlook data. The raw table holds every row of the data sheet as text. Staging keeps the three parameters used
-- (EV sales, EV sales share, EV stock), renames 'Aggregate group', and converts year and value to numbers. A row with a
-- non-numeric year or value is dropped (and counted in the checks).
DROP TABLE IF EXISTS stg_ev_data;
CREATE TABLE stg_ev_data AS
SELECT region_country, category, parameter, mode, powertrain,
       CAST(year AS INTEGER) AS year,
       unit,
       CAST(value AS REAL) AS value,
       "Aggregate group" AS aggregate_group,
       source_id
FROM raw_ev_data
WHERE parameter IN ('EV sales', 'EV sales share', 'EV stock')
  AND year GLOB '*[0-9]*' AND year NOT GLOB '*[^0-9.eE+-]*'
  AND value GLOB '*[0-9]*' AND value NOT GLOB '*[^0-9.eE+-]*';

CREATE INDEX ix_stg_ev ON stg_ev_data(parameter, region_country, year);

-- USGS Mineral Commodity Summaries 2026 data release (all commodities loaded raw). Staging keeps copper only.
-- value_text keeps the number as printed (for example '1,230'); value removes the thousands commas and is NULL for entries that are not numbers
-- (such as W or --). year is NULL for a range like 2021-24 (year_text keeps it). is_estimate marks the latest year, which USGS publishes as an estimate.
DROP TABLE IF EXISTS stg_usgs_copper;
CREATE TABLE stg_usgs_copper AS
WITH c AS (
    SELECT *,
           CASE WHEN Year GLOB '[0-9][0-9][0-9][0-9]' THEN CAST(Year AS INTEGER) END AS yr,
           REPLACE(Value, ',', '') AS v
    FROM raw_usgs_commodities
    WHERE Commodity = 'Copper'
)
SELECT Section AS section,
       Country AS country,
       Statistics AS statistic,
       Statistics_detail AS statistic_detail,
       Unit AS unit,
       Year AS year_text,
       yr AS year,
       CASE WHEN v GLOB '*[0-9]*' AND v NOT GLOB '*[^0-9.eE+-]*' THEN CAST(v AS REAL) END AS value,
       Value AS value_text,
       CASE WHEN yr IS NOT NULL AND yr = (SELECT MAX(yr) FROM c) THEN 1 ELSE 0 END AS is_estimate,
       Notes AS notes,
       source_id
FROM c
ORDER BY file_line;

-- IEA Energy and AI data annex, World Data sheet. The raw table has one row per non-empty cell. A sheet row is a data row when
-- column C holds a label and at least one of the value columns D, E, F, H, I holds a number (cell type n); a row with a label and
-- no number is a section header (a header starting with '*' is a footnote and is ignored). Each data row belongs to the
-- latest section header above it, and the label 'IT' switches the rows below it to the IT equipment basis until the next header.
-- Columns: D = 2020, E = 2023, F = 2024 (estimates), H = 2030 (Base Case), I = 2035 (Base Case, exploratory).
DROP TABLE IF EXISTS stg_datacentre_annex_world;
CREATE TABLE stg_datacentre_annex_world AS
WITH w AS (
    SELECT excel_row,
           MAX(CASE WHEN excel_col = 'C' THEN value_text END) AS label,
           MAX(CASE WHEN excel_col = 'D' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2020,
           MAX(CASE WHEN excel_col = 'E' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2023,
           MAX(CASE WHEN excel_col = 'F' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2024,
           MAX(CASE WHEN excel_col = 'H' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2030,
           MAX(CASE WHEN excel_col = 'I' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2035
    FROM raw_iea_annex_cells
    WHERE sheet = 'World Data'
    GROUP BY excel_row
),
rows_ AS (
    SELECT *, (y2020 IS NOT NULL OR y2023 IS NOT NULL OR y2024 IS NOT NULL OR y2030 IS NOT NULL OR y2035 IS NOT NULL) AS has_number
    FROM w WHERE label IS NOT NULL
),
headers AS (SELECT excel_row, label FROM rows_ WHERE has_number = 0 AND substr(label, 1, 1) <> '*'),
data AS (
    SELECT r.*,
           (SELECT MAX(h.excel_row) FROM headers h WHERE h.excel_row < r.excel_row) AS header_row
    FROM rows_ r WHERE r.has_number = 1
),
data2 AS (
    SELECT d.*,
           (SELECT label FROM headers h WHERE h.excel_row = d.header_row) AS section,
           CASE WHEN EXISTS (SELECT 1 FROM rows_ i WHERE i.has_number = 1 AND i.label = 'IT' AND i.excel_row <= d.excel_row
                             AND i.excel_row > COALESCE(d.header_row, 0)) THEN 'IT equipment' ELSE 'Whole data centre' END AS basis
    FROM data d
),
long AS (
    SELECT excel_row, label, section, basis, 2020 AS year, 1 AS ord, y2020 AS value FROM data2 WHERE y2020 IS NOT NULL
    UNION ALL SELECT excel_row, label, section, basis, 2023, 2, y2023 FROM data2 WHERE y2023 IS NOT NULL
    UNION ALL SELECT excel_row, label, section, basis, 2024, 3, y2024 FROM data2 WHERE y2024 IS NOT NULL
    UNION ALL SELECT excel_row, label, section, basis, 2030, 4, y2030 FROM data2 WHERE y2030 IS NOT NULL
    UNION ALL SELECT excel_row, label, section, basis, 2035, 5, y2035 FROM data2 WHERE y2035 IS NOT NULL
)
SELECT 'S15' AS source_id,
       'World' AS region,
       CASE WHEN label = 'IT' THEN 'Total' ELSE label END AS segment,
       basis,
       CASE WHEN lower(section) LIKE '%installed capacity%' THEN 'Installed capacity'
            WHEN lower(section) LIKE '%electricity consumption%' THEN 'Electricity consumption'
            WHEN lower(section) LIKE '%power usage effectiveness%' THEN 'Power usage effectiveness'
            WHEN lower(section) LIKE '%load factor%' THEN 'Load factor' END AS metric,
       CASE WHEN lower(section) LIKE '%installed capacity%' THEN 'GW'
            WHEN lower(section) LIKE '%electricity consumption%' THEN 'TWh'
            WHEN lower(section) LIKE '%power usage effectiveness%' THEN 'ratio'
            WHEN lower(section) LIKE '%load factor%' THEN '%' END AS unit,
       year,
       CASE year WHEN 2030 THEN 'Base Case' WHEN 2035 THEN 'Base Case (exploratory)' ELSE 'Estimate' END AS scenario,
       value
FROM long
ORDER BY excel_row, ord;

-- IEA Energy and AI data annex, Regional Data sheet. Same approach as the world sheet, with the label in column B and the values in
-- C = 2020, D = 2023, E = 2024 (estimates) and G = 2030 (Base Case). Column F is a spacer (it holds zeros and #REF! errors) and is ignored.
-- Any row with a label and no number is a section header here (the regional sheet has no footnote rows to skip). Rows under a header that
-- starts with 'IT' are on the IT equipment basis.
DROP TABLE IF EXISTS stg_datacentre_annex_regional;
CREATE TABLE stg_datacentre_annex_regional AS
WITH w AS (
    SELECT excel_row,
           MAX(CASE WHEN excel_col = 'B' THEN value_text END) AS label,
           MAX(CASE WHEN excel_col = 'C' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2020,
           MAX(CASE WHEN excel_col = 'D' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2023,
           MAX(CASE WHEN excel_col = 'E' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2024,
           MAX(CASE WHEN excel_col = 'G' AND cell_type = 'n' THEN CAST(value_text AS REAL) END) AS y2030
    FROM raw_iea_annex_cells
    WHERE sheet = 'Regional Data'
    GROUP BY excel_row
),
rows_ AS (
    SELECT *, (y2020 IS NOT NULL OR y2023 IS NOT NULL OR y2024 IS NOT NULL OR y2030 IS NOT NULL) AS has_number
    FROM w WHERE label IS NOT NULL
),
headers AS (SELECT excel_row, label FROM rows_ WHERE has_number = 0),
data AS (
    SELECT r.*, (SELECT label FROM headers h WHERE h.excel_row = (SELECT MAX(h2.excel_row) FROM headers h2 WHERE h2.excel_row < r.excel_row)) AS section
    FROM rows_ r WHERE r.has_number = 1
),
long AS (
    SELECT excel_row, label, section, 2020 AS year, 1 AS ord, y2020 AS value FROM data WHERE y2020 IS NOT NULL
    UNION ALL SELECT excel_row, label, section, 2023, 2, y2023 FROM data WHERE y2023 IS NOT NULL
    UNION ALL SELECT excel_row, label, section, 2024, 3, y2024 FROM data WHERE y2024 IS NOT NULL
    UNION ALL SELECT excel_row, label, section, 2030, 4, y2030 FROM data WHERE y2030 IS NOT NULL
)
SELECT 'S15' AS source_id,
       label AS region,
       'All' AS segment,
       CASE WHEN substr(section, 1, 2) = 'IT' THEN 'IT equipment' ELSE 'Whole data centre' END AS basis,
       CASE WHEN lower(section) LIKE '%installed capacity%' THEN 'Installed capacity'
            WHEN lower(section) LIKE '%electricity consumption%' THEN 'Electricity consumption'
            WHEN lower(section) LIKE '%power usage effectiveness%' THEN 'Power usage effectiveness'
            WHEN lower(section) LIKE '%load factor%' THEN 'Load factor' END AS metric,
       CASE WHEN lower(section) LIKE '%installed capacity%' THEN 'GW'
            WHEN lower(section) LIKE '%electricity consumption%' THEN 'TWh'
            WHEN lower(section) LIKE '%power usage effectiveness%' THEN 'ratio'
            WHEN lower(section) LIKE '%load factor%' THEN '%' END AS unit,
       year,
       CASE year WHEN 2030 THEN 'Base Case' ELSE 'Estimate' END AS scenario,
       value
FROM long
ORDER BY excel_row, ord;

-- IEA data annex, World Data sheet: installed data-centre capacity (GW) for all four IEA cases, total and IT.
-- stg_datacentre_annex_world keeps only the Base case. Here the scenario blocks are read too: columns H and I are Base (2030, 2035),
-- K and L Lift-Off, N and O High Efficiency, Q and R Headwinds; D, E, F are the 2020, 2023, 2024 estimates shared by all cases.
-- Rows: the 'Total' row and the 'IT' row under the 'Installed capacity (GW)' header. The scenario names in row 2 are checked in 03_checks.sql.
-- 2035 values are marked exploratory by the IEA.
DROP TABLE IF EXISTS stg_datacentre_capacity_scenarios;
CREATE TABLE stg_datacentre_capacity_scenarios AS
WITH cells AS (
    SELECT excel_row, excel_col, cell_type, value_text FROM raw_iea_annex_cells WHERE sheet = 'World Data'
),
lab AS (SELECT excel_row, value_text AS label FROM cells WHERE excel_col = 'C'),
numrows AS (
    SELECT DISTINCT excel_row FROM cells
    WHERE excel_col IN ('D', 'E', 'F', 'H', 'I', 'K', 'L', 'N', 'O', 'Q', 'R') AND cell_type = 'n'
),
headers AS (SELECT excel_row, label FROM lab WHERE excel_row NOT IN (SELECT excel_row FROM numrows) AND substr(label, 1, 1) <> '*'),
rows_ AS (
    SELECT l.excel_row, l.label,
           (SELECT label FROM headers h WHERE h.excel_row = (SELECT MAX(h2.excel_row) FROM headers h2 WHERE h2.excel_row < l.excel_row)) AS section
    FROM lab l WHERE l.excel_row IN (SELECT excel_row FROM numrows)
),
cap AS (
    SELECT excel_row, CASE label WHEN 'Total' THEN 'Whole data centre' ELSE 'IT equipment' END AS basis
    FROM rows_ WHERE lower(section) LIKE '%installed capacity%' AND label IN ('Total', 'IT')
),
colmap(excel_col, iea_case, year) AS (
    VALUES ('D', 'Estimate', 2020), ('E', 'Estimate', 2023), ('F', 'Estimate', 2024),
           ('H', 'Base', 2030), ('I', 'Base', 2035), ('K', 'Lift-Off', 2030), ('L', 'Lift-Off', 2035),
           ('N', 'High Efficiency', 2030), ('O', 'High Efficiency', 2035), ('Q', 'Headwinds', 2030), ('R', 'Headwinds', 2035)
)
SELECT m.iea_case, c.basis, m.year, CAST(x.value_text AS REAL) AS capacity_gw,
       CASE WHEN m.year = 2035 THEN 1 ELSE 0 END AS is_exploratory, 'S15' AS source_id
FROM cap c
JOIN colmap m
JOIN cells x ON x.excel_row = c.excel_row AND x.excel_col = m.excel_col AND x.cell_type = 'n'
ORDER BY c.basis, m.year, m.iea_case;
