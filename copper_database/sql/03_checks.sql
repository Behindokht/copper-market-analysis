-- 03_checks.sql
-- Each block (separated by a line starting with "-- check") is one SELECT that returns
-- table_name, description, status, detail. build_db.py appends the rows to data_checks.

-- check: World Bank staging overview
SELECT 'stg_wb_prices_monthly', 'commodities / rows / date range', 'INFO',
       COUNT(DISTINCT commodity) || ' commodities; ' || COUNT(*) || ' values; ' || MIN(date) || ' to ' || MAX(date)
FROM stg_wb_prices_monthly;

-- check: World Bank cells dropped in staging
SELECT 'stg_wb_prices_monthly', 'raw cells dropped in staging (empty, non-numeric or bad period)', 'INFO',
       ((SELECT COUNT(*) FROM raw_wb_prices_monthly) - (SELECT COUNT(*) FROM stg_wb_prices_monthly)) || ' of '
       || (SELECT COUNT(*) FROM raw_wb_prices_monthly) || ' raw cells';

-- check: World Bank no duplicate month and commodity
SELECT 'stg_wb_prices_monthly', 'no duplicate (date, commodity)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' duplicated keys'
FROM (SELECT date, commodity FROM stg_wb_prices_monthly GROUP BY date, commodity HAVING COUNT(*) > 1);

-- check: World Bank no missing months since 1998 for the four commodities used
SELECT 'stg_wb_prices_monthly', commodity || ': no missing months since 1998',
       CASE WHEN n = expected THEN 'PASS' ELSE 'WARN' END,
       n || ' of ' || expected || ' months'
FROM (SELECT commodity, COUNT(*) AS n,
             (CAST(substr(MAX(date), 1, 4) AS INTEGER) - 1998) * 12 + CAST(substr(MAX(date), 6, 2) AS INTEGER) AS expected
      FROM stg_wb_prices_monthly
      WHERE commodity IN ('Copper', 'Aluminum', 'Gold', 'Crude oil, Brent') AND date >= '1998-01-01'
      GROUP BY commodity);

-- check: World Bank staging vs the old Python cleaning (frozen baseline), totals requires=baseline_wb_prices_monthly
SELECT 'stg_wb_prices_monthly vs python baseline', 'row count, date range, null values and sum of values match the old Python output',
       CASE WHEN s.n = b.n AND s.dmin = b.dmin AND s.dmax = b.dmax AND s.nulls = b.nulls AND ABS(s.total - b.total) < 0.001
            THEN 'PASS' ELSE 'FAIL' END,
       'sql ' || s.n || ' rows, ' || s.dmin || ' to ' || s.dmax || ', ' || s.nulls || ' nulls, sum ' || ROUND(s.total, 3)
       || ' | python ' || b.n || ' rows, ' || b.dmin || ' to ' || b.dmax || ', ' || b.nulls || ' nulls, sum ' || ROUND(b.total, 3)
FROM (SELECT COUNT(*) n, MIN(date) dmin, MAX(date) dmax, SUM(value IS NULL) nulls, SUM(value) total FROM stg_wb_prices_monthly) s,
     (SELECT SUM(n_rows) n, MIN(date_min) dmin, MAX(date_max) dmax, SUM(null_values) nulls, SUM(sum_value) total
      FROM baseline_wb_prices_monthly) b;

-- check: World Bank staging vs the old Python cleaning, per commodity requires=baseline_wb_prices_monthly
SELECT 'stg_wb_prices_monthly vs python baseline', 'every commodity matches the old Python output (unit, rows, first and last month, sum)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN COUNT(*) = 0 THEN (SELECT COUNT(*) FROM baseline_wb_prices_monthly) || ' commodities compared, all equal'
            ELSE COUNT(*) || ' commodities differ' END
FROM (SELECT COALESCE(b.commodity, s.commodity) AS commodity
      FROM baseline_wb_prices_monthly b
      LEFT JOIN (SELECT commodity, MIN(unit) AS unit, COUNT(*) AS n, MIN(date) AS dmin, MAX(date) AS dmax, SUM(value) AS total
                 FROM stg_wb_prices_monthly GROUP BY commodity) s ON s.commodity = b.commodity
      WHERE s.commodity IS NULL OR s.unit <> b.unit OR s.n <> b.n_rows OR s.dmin <> b.date_min OR s.dmax <> b.date_max
            OR ABS(s.total - b.sum_value) > 0.001
      UNION
      SELECT s.commodity FROM stg_wb_prices_monthly s
      WHERE s.commodity NOT IN (SELECT commodity FROM baseline_wb_prices_monthly));

-- check: FRED staging overview per series
SELECT 'stg_fred_monthly', series_id || ': values / date range', 'INFO',
       COUNT(*) || ' values; ' || MIN(date) || ' to ' || MAX(date)
FROM stg_fred_monthly GROUP BY series_id;

-- check: FRED raw cells dropped in staging
SELECT 'stg_fred_monthly', 'raw rows dropped in staging (blank, non-numeric or bad date)', 'INFO',
       ((SELECT COUNT(*) FROM raw_fred_palumusdm) + (SELECT COUNT(*) FROM raw_fred_cpiaucsl) + (SELECT COUNT(*) FROM raw_fred_exuseu)
        + (SELECT COUNT(*) FROM raw_fred_gs10) - (SELECT COUNT(*) FROM stg_fred_monthly)) || ' of '
       || ((SELECT COUNT(*) FROM raw_fred_palumusdm) + (SELECT COUNT(*) FROM raw_fred_cpiaucsl) + (SELECT COUNT(*) FROM raw_fred_exuseu)
        + (SELECT COUNT(*) FROM raw_fred_gs10)) || ' raw rows';

-- check: FRED monthly no duplicates and first of month
SELECT 'stg_fred_monthly', 'no duplicate (series_id, date) and every date is the first of a month',
       CASE WHEN d.n = 0 AND f.n = 0 THEN 'PASS' ELSE 'FAIL' END,
       d.n || ' duplicated keys; ' || f.n || ' dates that are not the first of a month'
FROM (SELECT COUNT(*) AS n FROM (SELECT series_id, date FROM stg_fred_monthly GROUP BY series_id, date HAVING COUNT(*) > 1)) d,
     (SELECT COUNT(*) AS n FROM stg_fred_monthly WHERE substr(date, 9, 2) <> '01') f;

-- check: FRED monthly no missing months between a series first and last month
SELECT 'stg_fred_monthly', series_id || ': no missing months', CASE WHEN n = expected THEN 'PASS' ELSE 'WARN' END,
       n || ' of ' || expected || ' months'
FROM (SELECT series_id, COUNT(*) AS n,
             (CAST(substr(MAX(date), 1, 4) AS INTEGER) - CAST(substr(MIN(date), 1, 4) AS INTEGER)) * 12
             + CAST(substr(MAX(date), 6, 2) AS INTEGER) - CAST(substr(MIN(date), 6, 2) AS INTEGER) + 1 AS expected
      FROM stg_fred_monthly GROUP BY series_id);

-- check: FRED plausible value ranges
SELECT 'stg_fred_monthly', series_id || ': values inside plausible range ' || lo || ' to ' || hi,
       CASE WHEN SUM(value < lo OR value > hi) = 0 THEN 'PASS' ELSE 'WARN' END,
       'min ' || MIN(value) || ', max ' || MAX(value)
FROM stg_fred_monthly
JOIN (SELECT 'EXUSEU' AS sid, 0.5 AS lo, 2.0 AS hi UNION ALL SELECT 'GS10', -1, 20
      UNION ALL SELECT 'PALUMUSDM', 100, 10000 UNION ALL SELECT 'CPIAUCSL', 10, 1000) r ON r.sid = series_id
GROUP BY series_id;

-- check: FRED staging vs the old Python cleaning (aluminium and CPI), every series requires=baseline_fred_monthly
SELECT 'stg_fred_monthly vs python baseline', 'aluminium and CPI match the old Python output (rows, first and last month, null values, sum)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN COUNT(*) = 0 THEN (SELECT COUNT(*) FROM baseline_fred_monthly) || ' series compared, all equal: '
            || (SELECT group_concat(series_id || ' ' || n_rows || ' rows', '; ') FROM baseline_fred_monthly)
            ELSE COUNT(*) || ' series differ' END
FROM baseline_fred_monthly b
LEFT JOIN (SELECT series_id, COUNT(*) AS n, MIN(date) AS dmin, MAX(date) AS dmax, SUM(value IS NULL) AS nulls, SUM(value) AS total
           FROM stg_fred_monthly GROUP BY series_id) s ON s.series_id = b.series_id
WHERE s.series_id IS NULL OR s.n <> b.n_rows OR s.dmin <> b.date_min OR s.dmax <> b.date_max
      OR s.nulls <> b.null_values OR ABS(s.total - b.sum_value) > 0.001;

-- check: dollar index daily overview
SELECT 'stg_fred_dtwexbgs_daily', 'days with a value / blank days dropped / date range', 'INFO',
       COUNT(*) || ' days; ' || ((SELECT COUNT(*) FROM raw_fred_dtwexbgs) - COUNT(*)) || ' blank days dropped; ' || MIN(date) || ' to ' || MAX(date)
FROM stg_fred_dtwexbgs_daily;

-- check: dollar index no duplicates and plausible range
SELECT 'stg_fred_dtwexbgs_daily', 'no duplicate dates and index inside 50 to 200',
       CASE WHEN (SELECT COUNT(*) FROM (SELECT date FROM stg_fred_dtwexbgs_daily GROUP BY date HAVING COUNT(*) > 1)) = 0
             AND SUM(value < 50 OR value > 200) = 0 THEN 'PASS' ELSE 'FAIL' END,
       'min ' || MIN(value) || ', max ' || MAX(value)
FROM stg_fred_dtwexbgs_daily;

-- check: dollar index days per month
SELECT 'stg_fred_dtwexbgs_daily', 'every complete month has at least 15 days with a value (needed for a monthly average)',
       CASE WHEN SUM(n < 15) = 0 THEN 'PASS' ELSE 'WARN' END,
       COUNT(*) || ' complete months; fewest days ' || MIN(n) || ', most ' || MAX(n)
FROM (SELECT substr(date, 1, 7) AS m, COUNT(*) AS n FROM stg_fred_dtwexbgs_daily
      WHERE substr(date, 1, 7) < (SELECT substr(MAX(date), 1, 7) FROM stg_fred_dtwexbgs_daily) GROUP BY m);

-- check: panel no missing or duplicate months
SELECT 'mart_monthly_panel', 'one row per month, no gaps or duplicates, from 1999-01 to the last World Bank copper month',
       CASE WHEN n = expected AND n = months AND dmax = (SELECT MAX(date) FROM stg_wb_prices_monthly WHERE commodity = 'Copper') THEN 'PASS' ELSE 'FAIL' END,
       n || ' rows; ' || dmin || ' to ' || dmax || '; expected ' || expected
FROM (SELECT COUNT(*) AS n, COUNT(DISTINCT month) AS months, MIN(month) AS dmin, MAX(month) AS dmax,
             (CAST(substr(MAX(month), 1, 4) AS INTEGER) - 1999) * 12 + CAST(substr(MAX(month), 6, 2) AS INTEGER) AS expected
      FROM mart_monthly_panel);

-- check: panel copper and aluminium equal the staging values
SELECT 'mart_monthly_panel', 'copper and aluminium in the panel equal the World Bank staging values (every month)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' months differ'
FROM mart_monthly_panel p
JOIN stg_wb_prices_monthly c ON c.date = p.month AND c.commodity = 'Copper'
JOIN stg_wb_prices_monthly a ON a.date = p.month AND a.commodity = 'Aluminum'
WHERE p.copper_usd_t_avg <> c.value OR p.aluminium_usd_t_avg <> a.value;

-- check: panel coverage per column
SELECT 'mart_monthly_panel', 'months with a value per column (copper, aluminium, euro rate, dollar index, 10-year rate, CPI, copper in euros)',
       CASE WHEN SUM(copper_usd_t_avg IS NOT NULL) = COUNT(*) AND SUM(aluminium_usd_t_avg IS NOT NULL) = COUNT(*)
                 AND SUM(usd_per_eur_avg IS NOT NULL) = COUNT(*) AND SUM(us10y_pct_avg IS NOT NULL) = COUNT(*)
                 AND SUM(copper_eur_t_avg IS NOT NULL) = COUNT(*) THEN 'PASS' ELSE 'WARN' END,
       'of ' || COUNT(*) || ' months: copper ' || SUM(copper_usd_t_avg IS NOT NULL) || ', aluminium ' || SUM(aluminium_usd_t_avg IS NOT NULL)
       || ', usd per eur ' || SUM(usd_per_eur_avg IS NOT NULL) || ', dollar index ' || SUM(dollar_index_avg IS NOT NULL)
       || ' (starts ' || MIN(CASE WHEN dollar_index_avg IS NOT NULL THEN month END) || '), 10-year ' || SUM(us10y_pct_avg IS NOT NULL)
       || ', CPI ' || SUM(cpi_index IS NOT NULL) || ', copper in EUR ' || SUM(copper_eur_t_avg IS NOT NULL)
FROM mart_monthly_panel;

-- check: CPI gap
SELECT 'mart_monthly_panel', 'only 2025-10 has no CPI (US federal shutdown, no October 2025 data; see README)',
       CASE WHEN COUNT(*) = 1 AND MIN(month) = '2025-10-01' THEN 'PASS' ELSE 'WARN' END,
       COUNT(*) || ' months without CPI: ' || COALESCE(group_concat(substr(month, 1, 7), ', '), 'none')
FROM mart_monthly_panel WHERE cpi_index IS NULL;

-- check: copper in euros arithmetic
SELECT 'mart_monthly_panel', 'copper in euros times USD per euro gives back the USD price (every month)',
       CASE WHEN SUM(ABS(copper_eur_t_avg * usd_per_eur_avg - copper_usd_t_avg) > 0.000001) = 0 THEN 'PASS' ELSE 'FAIL' END,
       SUM(ABS(copper_eur_t_avg * usd_per_eur_avg - copper_usd_t_avg) > 0.000001) || ' months off'
FROM mart_monthly_panel;

-- check: month-end dollar index is near the end of its own month
SELECT 'mart_monthly_panel', 'dollar index month-end date is in the same month and on or after day 24',
       CASE WHEN SUM(substr(dollar_index_month_end_date, 1, 7) <> substr(month, 1, 7)
                     OR CAST(substr(dollar_index_month_end_date, 9, 2) AS INTEGER) < 24) = 0 THEN 'PASS' ELSE 'WARN' END,
       COUNT(*) || ' months checked; earliest month-end day ' || MIN(CAST(substr(dollar_index_month_end_date, 9, 2) AS INTEGER))
FROM mart_monthly_panel WHERE dollar_index_month_end_date IS NOT NULL;

-- check: changes table row count and first row
SELECT 'mart_monthly_changes', 'same months as the panel; first month has no change',
       CASE WHEN (SELECT COUNT(*) FROM mart_monthly_changes) = (SELECT COUNT(*) FROM mart_monthly_panel)
             AND (SELECT copper_usd_logret_m FROM mart_monthly_changes ORDER BY month LIMIT 1) IS NULL THEN 'PASS' ELSE 'FAIL' END,
       (SELECT COUNT(*) FROM mart_monthly_changes) || ' rows';

-- check: log return and simple percent change tell the same story
SELECT 'mart_monthly_changes', 'exp(log return) - 1 equals the simple percent change / 100 (copper, euro rate, dollar index)',
       CASE WHEN SUM(ABS(EXP(copper_usd_logret_m) - 1 - copper_usd_pct_m / 100) > 0.000000001
                     OR ABS(EXP(usd_per_eur_logret_m) - 1 - usd_per_eur_pct_m / 100) > 0.000000001
                     OR ABS(EXP(dollar_index_logret_m) - 1 - dollar_index_pct_m / 100) > 0.000000001) = 0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' months compared'
FROM mart_monthly_changes WHERE copper_usd_logret_m IS NOT NULL AND usd_per_eur_logret_m IS NOT NULL AND dollar_index_logret_m IS NOT NULL;

-- check: euro price change = dollar price change minus euro exchange-rate change (exact in logs)
SELECT 'mart_monthly_changes', 'copper EUR log return = copper USD log return minus USD-per-euro log return (every month)',
       CASE WHEN SUM(ABS(copper_eur_logret_m - (copper_usd_logret_m - usd_per_eur_logret_m)) > 0.000000001) = 0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' months compared'
FROM mart_monthly_changes WHERE copper_eur_logret_m IS NOT NULL;

-- check: CPI changes are NULL only around the October 2025 gap
SELECT 'mart_monthly_changes', 'CPI change is missing only for the first month, 2025-10 and 2025-11',
       CASE WHEN group_concat(substr(month, 1, 7), ', ') = '1999-01, 2025-10, 2025-11' THEN 'PASS' ELSE 'WARN' END,
       'missing: ' || COALESCE(group_concat(substr(month, 1, 7), ', '), 'none')
FROM (SELECT month FROM mart_monthly_changes WHERE cpi_logret_m IS NULL ORDER BY month);

-- check: sample sizes for the tests
SELECT 'mart_monthly_changes', 'months available for each planned test (sample sizes)', 'INFO',
       'copper vs USD per euro ' || SUM(copper_usd_logret_m IS NOT NULL AND usd_per_eur_logret_m IS NOT NULL)
       || '; copper vs dollar index ' || SUM(copper_usd_logret_m IS NOT NULL AND dollar_index_logret_m IS NOT NULL)
       || '; with 10-year rate control ' || SUM(copper_usd_logret_m IS NOT NULL AND dollar_index_logret_m IS NOT NULL AND us10y_chg_pp_m IS NOT NULL)
       || '; real copper vs dollar index ' || SUM(copper_real_usd_logret_m IS NOT NULL AND dollar_index_logret_m IS NOT NULL)
FROM mart_monthly_changes;

-- check: LME overview requires=lme_data
SELECT 'stg_lme_copper_daily', 'date range and rows', 'INFO',
       MIN(date) || ' to ' || MAX(date) || '; ' || COUNT(*) || ' trading days'
FROM stg_lme_copper_daily;

-- check: LME raw lines dropped and duplicates requires=lme_data
SELECT 'stg_lme_copper_daily', 'raw lines read / dropped (summary lines and other non-dates) / duplicate dates removed',
       CASE WHEN dropped = files AND dup = 0 THEN 'PASS' ELSE 'WARN' END,
       raw || ' raw lines; ' || dropped || ' dropped (' || files || ' files, one Averages line each); ' || dup || ' duplicate dates removed'
FROM (SELECT (SELECT COUNT(*) FROM raw_lme_copper_daily) AS raw,
             (SELECT COUNT(*) FROM raw_lme_copper_daily) - (SELECT COUNT(*) FROM stg_lme_copper_daily) AS dropped,
             (SELECT COUNT(DISTINCT source_file) FROM raw_lme_copper_daily) AS files,
             (SELECT COUNT(*) FROM raw_lme_copper_daily WHERE "Date" GLOB '[0-3][0-9] [A-Z][a-z][a-z] [1-2][0-9][0-9][0-9]')
              - (SELECT COUNT(*) FROM stg_lme_copper_daily) AS dup);

-- check: LME every full year has enough trading days requires=lme_data
SELECT 'stg_lme_copper_daily', 'every full year has at least 240 trading days',
       CASE WHEN SUM(n < 240) = 0 THEN 'PASS' ELSE 'WARN' END,
       CASE WHEN SUM(n < 240) = 0 THEN 'all full years ok' ELSE group_concat(CASE WHEN n < 240 THEN y || ': ' || n END, ', ') END
FROM (SELECT substr(date, 1, 4) AS y, COUNT(*) AS n FROM stg_lme_copper_daily
      WHERE substr(date, 1, 4) < (SELECT substr(MAX(date), 1, 4) FROM stg_lme_copper_daily) GROUP BY y);

-- check: LME long gaps between trading days requires=lme_data
SELECT 'stg_lme_copper_daily', 'gaps longer than 5 calendar days', CASE WHEN COUNT(*) <= 5 THEN 'INFO' ELSE 'WARN' END,
       COUNT(*) || ' gaps, ending on ' || COALESCE(group_concat(date, ', '), 'none')
FROM (SELECT date, julianday(date) - julianday(LAG(date) OVER (ORDER BY date)) AS gap FROM stg_lme_copper_daily) WHERE gap > 5;

-- check: LME coverage per column requires=lme_data
SELECT 'stg_lme_copper_daily', 'coverage of ' || column_name, 'INFO', n_values || ' values from ' || dmin || ' to ' || dmax
FROM (SELECT 'cash_usd_t' AS column_name, COUNT(cash_usd_t) AS n_values, MIN(CASE WHEN cash_usd_t IS NOT NULL THEN date END) AS dmin, MAX(CASE WHEN cash_usd_t IS NOT NULL THEN date END) AS dmax FROM stg_lme_copper_daily
      UNION ALL SELECT 'three_month_usd_t' AS column_name, COUNT(three_month_usd_t) AS n_values, MIN(CASE WHEN three_month_usd_t IS NOT NULL THEN date END) AS dmin, MAX(CASE WHEN three_month_usd_t IS NOT NULL THEN date END) AS dmax FROM stg_lme_copper_daily
      UNION ALL SELECT 'fifteen_month_usd_t' AS column_name, COUNT(fifteen_month_usd_t) AS n_values, MIN(CASE WHEN fifteen_month_usd_t IS NOT NULL THEN date END) AS dmin, MAX(CASE WHEN fifteen_month_usd_t IS NOT NULL THEN date END) AS dmax FROM stg_lme_copper_daily
      UNION ALL SELECT 'inventory_t' AS column_name, COUNT(inventory_t) AS n_values, MIN(CASE WHEN inventory_t IS NOT NULL THEN date END) AS dmin, MAX(CASE WHEN inventory_t IS NOT NULL THEN date END) AS dmax FROM stg_lme_copper_daily
      UNION ALL SELECT 'volume_as_exported' AS column_name, COUNT(volume_as_exported) AS n_values, MIN(CASE WHEN volume_as_exported IS NOT NULL THEN date END) AS dmin, MAX(CASE WHEN volume_as_exported IS NOT NULL THEN date END) AS dmax FROM stg_lme_copper_daily
      UNION ALL SELECT 'cash_unofficial_usd_t' AS column_name, COUNT(cash_unofficial_usd_t) AS n_values, MIN(CASE WHEN cash_unofficial_usd_t IS NOT NULL THEN date END) AS dmin, MAX(CASE WHEN cash_unofficial_usd_t IS NOT NULL THEN date END) AS dmax FROM stg_lme_copper_daily);

-- check: LME plausible price range requires=lme_data
SELECT 'stg_lme_copper_daily', 'cash price inside 500 to 20,000 USD per tonne and inventory positive',
       CASE WHEN SUM(cash_usd_t < 500 OR cash_usd_t > 20000 OR inventory_t <= 0) = 0 THEN 'PASS' ELSE 'WARN' END,
       'cash min ' || MIN(cash_usd_t) || ', max ' || MAX(cash_usd_t) || '; inventory min ' || MIN(inventory_t)
FROM stg_lme_copper_daily;

-- check: LME staging vs the old Python cleaning, per column and per year (frozen baseline) requires=lme_data,baseline_lme_copper_daily
SELECT 'stg_lme_copper_daily vs python baseline',
       'rows, first and last date, non-null count, sum, min and max match the old Python output for every column, overall and for each year',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN COUNT(*) = 0 THEN (SELECT COUNT(*) FROM baseline_lme_copper_daily) || ' column-by-year summaries compared, all equal'
            ELSE COUNT(*) || ' summaries differ' END
FROM baseline_lme_copper_daily b
LEFT JOIN (
      SELECT 'cash_usd_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(cash_usd_t) AS n_values, SUM(cash_usd_t) AS sum_value, MIN(cash_usd_t) AS min_value, MAX(cash_usd_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'cash_usd_t', 'all', COUNT(*), COUNT(cash_usd_t), SUM(cash_usd_t), MIN(cash_usd_t), MAX(cash_usd_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'cash_unofficial_usd_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(cash_unofficial_usd_t) AS n_values, SUM(cash_unofficial_usd_t) AS sum_value, MIN(cash_unofficial_usd_t) AS min_value, MAX(cash_unofficial_usd_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'cash_unofficial_usd_t', 'all', COUNT(*), COUNT(cash_unofficial_usd_t), SUM(cash_unofficial_usd_t), MIN(cash_unofficial_usd_t), MAX(cash_unofficial_usd_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'three_month_usd_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(three_month_usd_t) AS n_values, SUM(three_month_usd_t) AS sum_value, MIN(three_month_usd_t) AS min_value, MAX(three_month_usd_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'three_month_usd_t', 'all', COUNT(*), COUNT(three_month_usd_t), SUM(three_month_usd_t), MIN(three_month_usd_t), MAX(three_month_usd_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'three_month_unofficial_usd_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(three_month_unofficial_usd_t) AS n_values, SUM(three_month_unofficial_usd_t) AS sum_value, MIN(three_month_unofficial_usd_t) AS min_value, MAX(three_month_unofficial_usd_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'three_month_unofficial_usd_t', 'all', COUNT(*), COUNT(three_month_unofficial_usd_t), SUM(three_month_unofficial_usd_t), MIN(three_month_unofficial_usd_t), MAX(three_month_unofficial_usd_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'fifteen_month_usd_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(fifteen_month_usd_t) AS n_values, SUM(fifteen_month_usd_t) AS sum_value, MIN(fifteen_month_usd_t) AS min_value, MAX(fifteen_month_usd_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'fifteen_month_usd_t', 'all', COUNT(*), COUNT(fifteen_month_usd_t), SUM(fifteen_month_usd_t), MIN(fifteen_month_usd_t), MAX(fifteen_month_usd_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'dec_1_usd_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(dec_1_usd_t) AS n_values, SUM(dec_1_usd_t) AS sum_value, MIN(dec_1_usd_t) AS min_value, MAX(dec_1_usd_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'dec_1_usd_t', 'all', COUNT(*), COUNT(dec_1_usd_t), SUM(dec_1_usd_t), MIN(dec_1_usd_t), MAX(dec_1_usd_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'dec_2_usd_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(dec_2_usd_t) AS n_values, SUM(dec_2_usd_t) AS sum_value, MIN(dec_2_usd_t) AS min_value, MAX(dec_2_usd_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'dec_2_usd_t', 'all', COUNT(*), COUNT(dec_2_usd_t), SUM(dec_2_usd_t), MIN(dec_2_usd_t), MAX(dec_2_usd_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'dec_3_usd_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(dec_3_usd_t) AS n_values, SUM(dec_3_usd_t) AS sum_value, MIN(dec_3_usd_t) AS min_value, MAX(dec_3_usd_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'dec_3_usd_t', 'all', COUNT(*), COUNT(dec_3_usd_t), SUM(dec_3_usd_t), MIN(dec_3_usd_t), MAX(dec_3_usd_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'inventory_t' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(inventory_t) AS n_values, SUM(inventory_t) AS sum_value, MIN(inventory_t) AS min_value, MAX(inventory_t) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'inventory_t', 'all', COUNT(*), COUNT(inventory_t), SUM(inventory_t), MIN(inventory_t), MAX(inventory_t), MIN(date), MAX(date) FROM stg_lme_copper_daily
      UNION ALL
      SELECT 'volume_as_exported' AS column_name, substr(date, 1, 4) AS scope, COUNT(*) AS n_rows, COUNT(volume_as_exported) AS n_values, SUM(volume_as_exported) AS sum_value, MIN(volume_as_exported) AS min_value, MAX(volume_as_exported) AS max_value, MIN(date) AS date_min, MAX(date) AS date_max FROM stg_lme_copper_daily GROUP BY substr(date, 1, 4)
      UNION ALL
      SELECT 'volume_as_exported', 'all', COUNT(*), COUNT(volume_as_exported), SUM(volume_as_exported), MIN(volume_as_exported), MAX(volume_as_exported), MIN(date), MAX(date) FROM stg_lme_copper_daily
     ) s ON s.column_name = b.column_name AND s.scope = CAST(b.scope AS TEXT)
WHERE s.scope IS NULL OR s.n_rows <> b.n_rows OR s.n_values <> b.n_values OR s.date_min <> b.date_min OR s.date_max <> b.date_max
      OR ABS(COALESCE(s.sum_value, 0) - b.sum_value) > 0.001
      OR COALESCE(s.min_value, -1) <> COALESCE(b.min_value, -1) OR COALESCE(s.max_value, -1) <> COALESCE(b.max_value, -1);

-- check: LME month-end columns in the panel requires=lme_data
SELECT 'mart_monthly_panel', 'LME month-end date is in the same month and on or after day 24; only complete months (before the last LME month)',
       CASE WHEN SUM(substr(copper_lme_cash_month_end_date, 1, 7) <> substr(month, 1, 7)
                     OR CAST(substr(copper_lme_cash_month_end_date, 9, 2) AS INTEGER) < 24) = 0
             AND MAX(month) = '2025-06-01' THEN 'PASS' ELSE 'WARN' END,
       COUNT(*) || ' months, ' || MIN(month) || ' to ' || MAX(month) || '; earliest month-end day '
       || MIN(CAST(substr(copper_lme_cash_month_end_date, 9, 2) AS INTEGER))
FROM mart_monthly_panel WHERE copper_lme_cash_month_end_date IS NOT NULL;

-- check: LME monthly average in the panel equals the average of the staging days requires=lme_data
SELECT 'mart_monthly_panel', 'LME monthly average cash price in the panel equals the average of the daily staging values (every month with data)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END, COUNT(*) || ' months differ'
FROM mart_monthly_panel p
WHERE p.copper_lme_cash_usd_t_avg IS NOT NULL
  AND ABS(p.copper_lme_cash_usd_t_avg - (SELECT AVG(cash_usd_t) FROM stg_lme_copper_daily d WHERE substr(d.date, 1, 7) = substr(p.month, 1, 7))) > 0.000001;

-- check: sample sizes for the month-end robustness check requires=lme_data
SELECT 'mart_monthly_changes', 'months available for the month-end check (LME copper and dollar index, averages and month-end on the same months)', 'INFO',
       'average-based ' || SUM(copper_lme_cash_avg_logret_m IS NOT NULL AND dollar_index_logret_m IS NOT NULL AND copper_lme_cash_month_end_logret_m IS NOT NULL AND dollar_index_month_end_logret_m IS NOT NULL)
       || ' months with all four changes'
FROM mart_monthly_changes;

-- check: copper-to-aluminium ratio table covers every month, no gaps
SELECT 'mart_cu_al_ratio', 'one row per month with no gaps, from the first to the last World Bank month',
       CASE WHEN n = expected AND n = months THEN 'PASS' ELSE 'FAIL' END,
       n || ' rows; ' || dmin || ' to ' || dmax || '; expected ' || expected
FROM (SELECT COUNT(*) AS n, COUNT(DISTINCT month) AS months, MIN(month) AS dmin, MAX(month) AS dmax,
             (CAST(substr(MAX(month), 1, 4) AS INTEGER) - CAST(substr(MIN(month), 1, 4) AS INTEGER)) * 12
             + CAST(substr(MAX(month), 6, 2) AS INTEGER) - CAST(substr(MIN(month), 6, 2) AS INTEGER) + 1 AS expected
      FROM mart_cu_al_ratio);

-- check: ratio equals copper divided by aluminium from the staging prices
SELECT 'mart_cu_al_ratio', 'ratio equals the World Bank staging copper price divided by the staging aluminium price (every month)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END, COUNT(*) || ' months differ'
FROM mart_cu_al_ratio m
JOIN stg_wb_prices_monthly c ON c.date = m.month AND c.commodity = 'Copper'
JOIN stg_wb_prices_monthly a ON a.date = m.month AND a.commodity = 'Aluminum'
WHERE ABS(m.cu_al_ratio - c.value / a.value) > 0.000000001;

-- check: forward changes look exactly 6 and 12 calendar months ahead
SELECT 'mart_cu_al_ratio', 'forward 6 and 12 month changes match the ratio six and twelve calendar months later (every month); last 6 and 12 months are empty',
       CASE WHEN bad = 0 AND null6 = 6 AND null12 = 12 THEN 'PASS' ELSE 'FAIL' END,
       bad || ' months differ; empty 6m outcomes ' || null6 || ', empty 12m outcomes ' || null12
FROM (SELECT (SELECT COUNT(*) FROM mart_cu_al_ratio a JOIN mart_cu_al_ratio b ON b.month = date(a.month, '+6 months')
              WHERE ABS(a.ratio_fwd_6m_logchg - LN(b.cu_al_ratio / a.cu_al_ratio)) > 0.000000001)
           + (SELECT COUNT(*) FROM mart_cu_al_ratio a JOIN mart_cu_al_ratio b ON b.month = date(a.month, '+12 months')
              WHERE ABS(a.ratio_fwd_12m_logchg - LN(b.cu_al_ratio / a.cu_al_ratio)) > 0.000000001) AS bad,
             (SELECT COUNT(*) FROM mart_cu_al_ratio WHERE ratio_fwd_6m_logchg IS NULL) AS null6,
             (SELECT COUNT(*) FROM mart_cu_al_ratio WHERE ratio_fwd_12m_logchg IS NULL) AS null12);

-- check: ratio change = copper change minus aluminium change (exact in logs)
SELECT 'mart_cu_al_ratio', 'forward ratio log change = copper log return minus aluminium log return (6 and 12 months, every month)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END, COUNT(*) || ' months differ'
FROM mart_cu_al_ratio
WHERE ABS(ratio_fwd_6m_logchg - (copper_fwd_6m_logret - aluminium_fwd_6m_logret)) > 0.000000001
   OR ABS(ratio_fwd_12m_logchg - (copper_fwd_12m_logret - aluminium_fwd_12m_logret)) > 0.000000001;

-- check: percentiles start after 120 months, stay between 0 and 100, and are 100 (0) at a new all-time high (low)
SELECT 'mart_cu_al_ratio', 'percentiles empty for the first 120 months, between 0 and 100 after, 100 at a new high and 0 at a new low',
       CASE WHEN early_filled = 0 AND missing_after = 0 AND out_of_range = 0 AND high_wrong = 0 AND low_wrong = 0 THEN 'PASS' ELSE 'FAIL' END,
       'first month with a percentile ' || first_month || '; high/low violations ' || (high_wrong + low_wrong)
FROM (SELECT (SELECT COUNT(*) FROM (SELECT month, cu_al_ratio_pctile_all_past p, cu_al_ratio_pctile_past_10y q,
                     ROW_NUMBER() OVER (ORDER BY month) AS n FROM mart_cu_al_ratio) WHERE n <= 120 AND (p IS NOT NULL OR q IS NOT NULL)) AS early_filled,
             (SELECT COUNT(*) FROM (SELECT cu_al_ratio_pctile_all_past p, cu_al_ratio_pctile_past_10y q,
                     ROW_NUMBER() OVER (ORDER BY month) AS n FROM mart_cu_al_ratio) WHERE n > 120 AND (p IS NULL OR q IS NULL)) AS missing_after,
             (SELECT COUNT(*) FROM mart_cu_al_ratio WHERE cu_al_ratio_pctile_all_past < 0 OR cu_al_ratio_pctile_all_past > 100
                     OR cu_al_ratio_pctile_past_10y < 0 OR cu_al_ratio_pctile_past_10y > 100) AS out_of_range,
             (SELECT COUNT(*) FROM mart_cu_al_ratio a WHERE a.cu_al_ratio_pctile_all_past IS NOT NULL
                     AND a.cu_al_ratio > (SELECT MAX(b.cu_al_ratio) FROM mart_cu_al_ratio b WHERE b.month < a.month)
                     AND (a.cu_al_ratio_pctile_all_past <> 100)) AS high_wrong,
             (SELECT COUNT(*) FROM mart_cu_al_ratio a WHERE a.cu_al_ratio_pctile_all_past IS NOT NULL
                     AND a.cu_al_ratio < (SELECT MIN(b.cu_al_ratio) FROM mart_cu_al_ratio b WHERE b.month < a.month)
                     AND (a.cu_al_ratio_pctile_all_past <> 0)) AS low_wrong,
             (SELECT MIN(month) FROM mart_cu_al_ratio WHERE cu_al_ratio_pctile_all_past IS NOT NULL) AS first_month);

-- check: signal table has the same months for every rule at a given horizon
SELECT 'mart_cu_al_signal_months', 'every rule uses the same months at each horizon (common sample)',
       CASE WHEN COUNT(DISTINCT n) = 1 THEN 'PASS' ELSE 'FAIL' END,
       group_concat(DISTINCT horizon_m || 'm: ' || n || ' months, ' || dmin || ' to ' || dmax)
FROM (SELECT horizon_m, rule_id, COUNT(*) AS n, MIN(month) AS dmin, MAX(month) AS dmax FROM mart_cu_al_signal_months GROUP BY horizon_m, rule_id)
GROUP BY horizon_m HAVING 1 = 1;

-- check: episode logic (months inside an episode are within the horizon of each other, different episodes are further apart)
SELECT 'mart_cu_al_signal_months', 'signal months in one episode are at most horizon months apart; the next episode starts more than horizon months later',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END, COUNT(*) || ' violations'
FROM (SELECT rule_id, horizon_m, episode_id, gap, is_episode_start
      FROM (SELECT rule_id, horizon_m, episode_id, is_episode_start,
                   (CAST(substr(month, 1, 4) AS INTEGER) * 12 + CAST(substr(month, 6, 2) AS INTEGER))
                   - LAG(CAST(substr(month, 1, 4) AS INTEGER) * 12 + CAST(substr(month, 6, 2) AS INTEGER))
                         OVER (PARTITION BY rule_id, horizon_m ORDER BY month) AS gap
            FROM mart_cu_al_signal_months WHERE signal_on = 1)
      WHERE gap IS NOT NULL AND ((is_episode_start = 0 AND gap > horizon_m) OR (is_episode_start = 1 AND gap <= horizon_m)));

-- check: signal-on months all carry an episode id, off months none
SELECT 'mart_cu_al_signal_months', 'signal-on months have an episode id, signal-off months have none',
       CASE WHEN SUM(signal_on = 1 AND episode_id IS NULL) + SUM(signal_on = 0 AND episode_id IS NOT NULL) = 0 THEN 'PASS' ELSE 'FAIL' END,
       SUM(signal_on = 1) || ' signal-on months; ' || COUNT(*) || ' rows'
FROM mart_cu_al_signal_months;

-- check: episodes per rule (information)
SELECT 'mart_cu_al_signal_months', 'independent episodes at 12 months: ' || ru.label, 'INFO',
       COALESCE(MAX(s.episode_id), 0) || ' episodes, ' || SUM(s.signal_on) || ' signal months of ' || COUNT(*)
FROM mart_cu_al_rules ru JOIN mart_cu_al_signal_months s ON s.rule_id = ru.rule_id AND s.horizon_m = 12
GROUP BY ru.rule_id;

-- check: EV staging overview
SELECT 'stg_ev_data', 'rows kept (EV sales, EV sales share, EV stock) / categories / years', 'INFO',
       COUNT(*) || ' rows; categories ' || (SELECT group_concat(category, ', ') FROM (SELECT DISTINCT category FROM stg_ev_data ORDER BY category))
       || '; years ' || MIN(year) || '-' || MAX(year)
FROM stg_ev_data;

-- check: EV rows dropped for a non-numeric year or value
SELECT 'stg_ev_data', 'rows of the three kept parameters dropped for a non-numeric year or value',
       CASE WHEN dropped = 0 THEN 'PASS' ELSE 'WARN' END, dropped || ' rows dropped; ' || kept || ' kept of ' || raw_rows || ' raw rows'
FROM (SELECT (SELECT COUNT(*) FROM raw_ev_data WHERE parameter IN ('EV sales', 'EV sales share', 'EV stock')) - (SELECT COUNT(*) FROM stg_ev_data) AS dropped,
             (SELECT COUNT(*) FROM stg_ev_data) AS kept, (SELECT COUNT(*) FROM raw_ev_data) AS raw_rows);

-- check: EV world car sales plausible
SELECT 'stg_ev_data', 'world EV car sales 2025 in plausible range (10 to 40 million)',
       CASE WHEN value > 10000000 AND value < 40000000 THEN 'PASS' ELSE 'WARN' END, printf('%,d', CAST(value AS INTEGER))
FROM stg_ev_data WHERE region_country = 'World' AND parameter = 'EV sales' AND mode = 'Cars' AND powertrain = 'EV' AND category = 'Historical' AND year = 2025;

-- check: ev_data staging vs the old Python cleaning (frozen baseline of column and group summaries) requires=baseline_ev_data
SELECT 'stg_ev_data vs python baseline',
       'row count, non-null counts, distinct counts, sums, min and max per column, and counts and sums per group match the old Python output',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN COUNT(*) = 0 THEN (SELECT COUNT(*) FROM baseline_ev_data) || ' column and group summaries compared, all equal'
            ELSE COUNT(*) || ' summaries differ' END
FROM (
    SELECT b.grouping, b.key_value FROM baseline_ev_data b
    LEFT JOIN (
      SELECT 'column:region_country' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(region_country) AS n_values, COUNT(DISTINCT region_country) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(region_country) AS min_text, MAX(region_country) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:category' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(category) AS n_values, COUNT(DISTINCT category) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(category) AS min_text, MAX(category) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:parameter' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(parameter) AS n_values, COUNT(DISTINCT parameter) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(parameter) AS min_text, MAX(parameter) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:mode' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(mode) AS n_values, COUNT(DISTINCT mode) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(mode) AS min_text, MAX(mode) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:powertrain' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(powertrain) AS n_values, COUNT(DISTINCT powertrain) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(powertrain) AS min_text, MAX(powertrain) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:unit' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(unit) AS n_values, COUNT(DISTINCT unit) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(unit) AS min_text, MAX(unit) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:aggregate_group' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(aggregate_group) AS n_values, COUNT(DISTINCT aggregate_group) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(aggregate_group) AS min_text, MAX(aggregate_group) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:source_id' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(source_id) AS n_values, COUNT(DISTINCT source_id) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(source_id) AS min_text, MAX(source_id) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:year', 'ALL', COUNT(*), COUNT(year), COUNT(DISTINCT year), SUM(year), MIN(year), MAX(year), NULL, NULL FROM stg_ev_data
      UNION ALL
      SELECT 'column:value', 'ALL', COUNT(*), COUNT(value), COUNT(DISTINCT value), SUM(value), MIN(value), MAX(value), NULL, NULL FROM stg_ev_data
      UNION ALL
      SELECT 'group:parameter|category|year', COALESCE(CAST(parameter AS TEXT), '') || '|' || COALESCE(CAST(category AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_ev_data GROUP BY parameter, category, year
      UNION ALL
      SELECT 'group:parameter|mode|powertrain', COALESCE(CAST(parameter AS TEXT), '') || '|' || COALESCE(CAST(mode AS TEXT), '') || '|' || COALESCE(CAST(powertrain AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_ev_data GROUP BY parameter, mode, powertrain
      UNION ALL
      SELECT 'group:region_country', COALESCE(CAST(region_country AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_ev_data GROUP BY region_country
      UNION ALL
      SELECT 'group:aggregate_group|parameter', COALESCE(CAST(aggregate_group AS TEXT), '') || '|' || COALESCE(CAST(parameter AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_ev_data GROUP BY aggregate_group, parameter
    ) s ON s.grouping = b.grouping AND s.key_value = b.key_value
    WHERE s.grouping IS NULL OR s.n_rows <> b.n_rows OR s.n_values <> b.n_values
          OR COALESCE(s.n_distinct, -1) <> COALESCE(b.n_distinct, -1)
          OR ABS(COALESCE(s.sum_value, 0) - COALESCE(b.sum_value, 0)) > 0.001
          OR COALESCE(s.min_num, -1e300) <> COALESCE(b.min_num, -1e300) OR COALESCE(s.max_num, -1e300) <> COALESCE(b.max_num, -1e300)
          OR s.min_text IS NOT b.min_text OR s.max_text IS NOT b.max_text
    UNION ALL
    -- groups that exist in the new table but not in the baseline
    SELECT s.grouping, s.key_value FROM (
      SELECT 'column:region_country' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(region_country) AS n_values, COUNT(DISTINCT region_country) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(region_country) AS min_text, MAX(region_country) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:category' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(category) AS n_values, COUNT(DISTINCT category) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(category) AS min_text, MAX(category) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:parameter' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(parameter) AS n_values, COUNT(DISTINCT parameter) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(parameter) AS min_text, MAX(parameter) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:mode' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(mode) AS n_values, COUNT(DISTINCT mode) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(mode) AS min_text, MAX(mode) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:powertrain' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(powertrain) AS n_values, COUNT(DISTINCT powertrain) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(powertrain) AS min_text, MAX(powertrain) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:unit' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(unit) AS n_values, COUNT(DISTINCT unit) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(unit) AS min_text, MAX(unit) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:aggregate_group' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(aggregate_group) AS n_values, COUNT(DISTINCT aggregate_group) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(aggregate_group) AS min_text, MAX(aggregate_group) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:source_id' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(source_id) AS n_values, COUNT(DISTINCT source_id) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(source_id) AS min_text, MAX(source_id) AS max_text FROM stg_ev_data
      UNION ALL
      SELECT 'column:year', 'ALL', COUNT(*), COUNT(year), COUNT(DISTINCT year), SUM(year), MIN(year), MAX(year), NULL, NULL FROM stg_ev_data
      UNION ALL
      SELECT 'column:value', 'ALL', COUNT(*), COUNT(value), COUNT(DISTINCT value), SUM(value), MIN(value), MAX(value), NULL, NULL FROM stg_ev_data
      UNION ALL
      SELECT 'group:parameter|category|year', COALESCE(CAST(parameter AS TEXT), '') || '|' || COALESCE(CAST(category AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_ev_data GROUP BY parameter, category, year
      UNION ALL
      SELECT 'group:parameter|mode|powertrain', COALESCE(CAST(parameter AS TEXT), '') || '|' || COALESCE(CAST(mode AS TEXT), '') || '|' || COALESCE(CAST(powertrain AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_ev_data GROUP BY parameter, mode, powertrain
      UNION ALL
      SELECT 'group:region_country', COALESCE(CAST(region_country AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_ev_data GROUP BY region_country
      UNION ALL
      SELECT 'group:aggregate_group|parameter', COALESCE(CAST(aggregate_group AS TEXT), '') || '|' || COALESCE(CAST(parameter AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_ev_data GROUP BY aggregate_group, parameter
    ) s WHERE s.grouping LIKE 'group:%' AND NOT EXISTS (SELECT 1 FROM baseline_ev_data b WHERE b.grouping = s.grouping AND b.key_value = s.key_value)
);

-- check: USGS staging overview
SELECT 'stg_usgs_copper', 'rows read (copper only) / sections', 'INFO',
       COUNT(*) || ' rows; sections ' || (SELECT group_concat(section, ', ') FROM (SELECT DISTINCT section FROM stg_usgs_copper ORDER BY section))
FROM stg_usgs_copper;

-- check: USGS mine production by country adds up to the world total, per year
SELECT 'stg_usgs_copper', year || ': mine production by country adds up to world total (2% tolerance for USGS rounding)',
       CASE WHEN ABS(s - total) / total * 100 < 2 THEN 'PASS' ELSE 'WARN' END,
       'sum ' || printf('%,d', CAST(ROUND(s) AS INTEGER)) || ' vs total ' || printf('%,d', CAST(ROUND(total) AS INTEGER)) || ' (' || printf('%.2f', ABS(s - total) / total * 100) || '% apart)'
FROM (SELECT m.year AS year, SUM(m.value) AS s, MAX(t.value) AS total
      FROM stg_usgs_copper m
      JOIN stg_usgs_copper t ON t.statistic_detail = 'Mine production: rounded' AND t.country = 'World total' AND t.year = m.year
      WHERE m.statistic_detail = 'Mine production' AND m.value IS NOT NULL
      GROUP BY m.year);

-- check: USGS reserves by country add up to the world total
SELECT 'stg_usgs_copper', 'reserves by country add up to world total (2% tolerance)',
       CASE WHEN ABS(s - total) / total * 100 < 2 THEN 'PASS' ELSE 'WARN' END,
       'sum ' || printf('%,d', CAST(ROUND(s) AS INTEGER)) || ' vs total ' || printf('%,d', CAST(ROUND(total) AS INTEGER)) || ' (' || printf('%.2f', ABS(s - total) / total * 100) || '% apart)'
FROM (SELECT (SELECT SUM(value) FROM stg_usgs_copper WHERE statistic_detail = 'Reserves' AND value IS NOT NULL) AS s,
             (SELECT value FROM stg_usgs_copper WHERE statistic_detail = 'Reserves: rounded' LIMIT 1) AS total);

-- check: USGS raw lines for copper and values that are not numbers
SELECT 'stg_usgs_copper', 'copper lines in the raw file and entries that are not numbers (kept as text in value_text, NULL in value)', 'INFO',
       (SELECT COUNT(*) FROM raw_usgs_commodities WHERE Commodity = 'Copper') || ' copper lines; ' || SUM(value IS NULL) || ' without a numeric value'
FROM stg_usgs_copper;

-- check: usgs_copper staging vs the old Python cleaning (frozen baseline of column and group summaries) requires=baseline_usgs_copper
SELECT 'stg_usgs_copper vs python baseline',
       'row count, non-null counts, distinct counts, sums, min and max per column, and counts and sums per group match the old Python output',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN COUNT(*) = 0 THEN (SELECT COUNT(*) FROM baseline_usgs_copper) || ' column and group summaries compared, all equal'
            ELSE COUNT(*) || ' summaries differ' END
FROM (
    SELECT b.grouping, b.key_value FROM baseline_usgs_copper b
    LEFT JOIN (
      SELECT 'column:section' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(section) AS n_values, COUNT(DISTINCT section) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(section) AS min_text, MAX(section) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:country' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(country) AS n_values, COUNT(DISTINCT country) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(country) AS min_text, MAX(country) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:statistic' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(statistic) AS n_values, COUNT(DISTINCT statistic) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(statistic) AS min_text, MAX(statistic) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:statistic_detail' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(statistic_detail) AS n_values, COUNT(DISTINCT statistic_detail) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(statistic_detail) AS min_text, MAX(statistic_detail) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:unit' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(unit) AS n_values, COUNT(DISTINCT unit) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(unit) AS min_text, MAX(unit) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:year_text' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(year_text) AS n_values, COUNT(DISTINCT year_text) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(year_text) AS min_text, MAX(year_text) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:value_text' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(value_text) AS n_values, COUNT(DISTINCT value_text) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(value_text) AS min_text, MAX(value_text) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:notes' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(notes) AS n_values, COUNT(DISTINCT notes) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(notes) AS min_text, MAX(notes) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:source_id' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(source_id) AS n_values, COUNT(DISTINCT source_id) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(source_id) AS min_text, MAX(source_id) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:year', 'ALL', COUNT(*), COUNT(year), COUNT(DISTINCT year), SUM(year), MIN(year), MAX(year), NULL, NULL FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:value', 'ALL', COUNT(*), COUNT(value), COUNT(DISTINCT value), SUM(value), MIN(value), MAX(value), NULL, NULL FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:is_estimate', 'ALL', COUNT(*), COUNT(is_estimate), COUNT(DISTINCT is_estimate), SUM(is_estimate), MIN(is_estimate), MAX(is_estimate), NULL, NULL FROM stg_usgs_copper
      UNION ALL
      SELECT 'group:section', COALESCE(CAST(section AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_usgs_copper GROUP BY section
      UNION ALL
      SELECT 'group:statistic_detail|year_text', COALESCE(CAST(statistic_detail AS TEXT), '') || '|' || COALESCE(CAST(year_text AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_usgs_copper GROUP BY statistic_detail, year_text
      UNION ALL
      SELECT 'group:country', COALESCE(CAST(country AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_usgs_copper GROUP BY country
    ) s ON s.grouping = b.grouping AND s.key_value = b.key_value
    WHERE s.grouping IS NULL OR s.n_rows <> b.n_rows OR s.n_values <> b.n_values
          OR COALESCE(s.n_distinct, -1) <> COALESCE(b.n_distinct, -1)
          OR ABS(COALESCE(s.sum_value, 0) - COALESCE(b.sum_value, 0)) > 0.001
          OR COALESCE(s.min_num, -1e300) <> COALESCE(b.min_num, -1e300) OR COALESCE(s.max_num, -1e300) <> COALESCE(b.max_num, -1e300)
          OR s.min_text IS NOT b.min_text OR s.max_text IS NOT b.max_text
    UNION ALL
    -- groups that exist in the new table but not in the baseline
    SELECT s.grouping, s.key_value FROM (
      SELECT 'column:section' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(section) AS n_values, COUNT(DISTINCT section) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(section) AS min_text, MAX(section) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:country' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(country) AS n_values, COUNT(DISTINCT country) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(country) AS min_text, MAX(country) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:statistic' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(statistic) AS n_values, COUNT(DISTINCT statistic) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(statistic) AS min_text, MAX(statistic) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:statistic_detail' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(statistic_detail) AS n_values, COUNT(DISTINCT statistic_detail) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(statistic_detail) AS min_text, MAX(statistic_detail) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:unit' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(unit) AS n_values, COUNT(DISTINCT unit) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(unit) AS min_text, MAX(unit) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:year_text' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(year_text) AS n_values, COUNT(DISTINCT year_text) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(year_text) AS min_text, MAX(year_text) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:value_text' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(value_text) AS n_values, COUNT(DISTINCT value_text) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(value_text) AS min_text, MAX(value_text) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:notes' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(notes) AS n_values, COUNT(DISTINCT notes) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(notes) AS min_text, MAX(notes) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:source_id' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(source_id) AS n_values, COUNT(DISTINCT source_id) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(source_id) AS min_text, MAX(source_id) AS max_text FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:year', 'ALL', COUNT(*), COUNT(year), COUNT(DISTINCT year), SUM(year), MIN(year), MAX(year), NULL, NULL FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:value', 'ALL', COUNT(*), COUNT(value), COUNT(DISTINCT value), SUM(value), MIN(value), MAX(value), NULL, NULL FROM stg_usgs_copper
      UNION ALL
      SELECT 'column:is_estimate', 'ALL', COUNT(*), COUNT(is_estimate), COUNT(DISTINCT is_estimate), SUM(is_estimate), MIN(is_estimate), MAX(is_estimate), NULL, NULL FROM stg_usgs_copper
      UNION ALL
      SELECT 'group:section', COALESCE(CAST(section AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_usgs_copper GROUP BY section
      UNION ALL
      SELECT 'group:statistic_detail|year_text', COALESCE(CAST(statistic_detail AS TEXT), '') || '|' || COALESCE(CAST(year_text AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_usgs_copper GROUP BY statistic_detail, year_text
      UNION ALL
      SELECT 'group:country', COALESCE(CAST(country AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_usgs_copper GROUP BY country
    ) s WHERE s.grouping LIKE 'group:%' AND NOT EXISTS (SELECT 1 FROM baseline_usgs_copper b WHERE b.grouping = s.grouping AND b.key_value = s.key_value)
);

-- check: IEA annex world overview
SELECT 'stg_datacentre_annex_world', 'rows read', 'INFO', COUNT(*) || ' world rows' FROM stg_datacentre_annex_world;

-- check: IEA annex world every row has a metric
SELECT 'stg_datacentre_annex_world', 'every row has a metric and a unit (a section header was found above it)',
       CASE WHEN SUM(metric IS NULL OR unit IS NULL) = 0 THEN 'PASS' ELSE 'WARN' END, SUM(metric IS NULL OR unit IS NULL) || ' rows without metric'
FROM stg_datacentre_annex_world;

-- check: IEA annex world segments add up to the total
WITH x AS (
    SELECT year, SUM(CASE WHEN segment <> 'Total' THEN value END) AS s, SUM(CASE WHEN segment = 'Total' THEN value END) AS t
    FROM stg_datacentre_annex_world WHERE metric = 'Electricity consumption' AND basis = 'Whole data centre' GROUP BY year
)
SELECT 'stg_datacentre_annex_world', 'hyperscale + colocation + enterprise add up to the total electricity (2% tolerance)',
       CASE WHEN (SELECT COUNT(*) FROM x WHERE ABS(s - t) / t > 0.02) = 0 THEN 'PASS' ELSE 'WARN' END,
       CASE WHEN (SELECT COUNT(*) FROM x WHERE ABS(s - t) / t > 0.02) = 0 THEN 'ok'
            ELSE (SELECT group_concat(year || ': ' || CAST(ROUND(s) AS INTEGER) || ' vs ' || t, ', ') FROM x WHERE ABS(s - t) / t > 0.02) END;

-- check: datacentre_annex_world staging vs the old Python cleaning (frozen baseline of column and group summaries) requires=baseline_datacentre_annex_world
SELECT 'stg_datacentre_annex_world vs python baseline',
       'row count, non-null counts, distinct counts, sums, min and max per column, and counts and sums per group match the old Python output',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN COUNT(*) = 0 THEN (SELECT COUNT(*) FROM baseline_datacentre_annex_world) || ' column and group summaries compared, all equal'
            ELSE COUNT(*) || ' summaries differ' END
FROM (
    SELECT b.grouping, b.key_value FROM baseline_datacentre_annex_world b
    LEFT JOIN (
      SELECT 'column:source_id' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(source_id) AS n_values, COUNT(DISTINCT source_id) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(source_id) AS min_text, MAX(source_id) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:region' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(region) AS n_values, COUNT(DISTINCT region) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(region) AS min_text, MAX(region) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:segment' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(segment) AS n_values, COUNT(DISTINCT segment) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(segment) AS min_text, MAX(segment) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:basis' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(basis) AS n_values, COUNT(DISTINCT basis) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(basis) AS min_text, MAX(basis) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:metric' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(metric) AS n_values, COUNT(DISTINCT metric) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(metric) AS min_text, MAX(metric) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:unit' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(unit) AS n_values, COUNT(DISTINCT unit) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(unit) AS min_text, MAX(unit) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:scenario' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(scenario) AS n_values, COUNT(DISTINCT scenario) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(scenario) AS min_text, MAX(scenario) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:year', 'ALL', COUNT(*), COUNT(year), COUNT(DISTINCT year), SUM(year), MIN(year), MAX(year), NULL, NULL FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:value', 'ALL', COUNT(*), COUNT(value), COUNT(DISTINCT value), SUM(value), MIN(value), MAX(value), NULL, NULL FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'group:metric|basis|year', COALESCE(CAST(metric AS TEXT), '') || '|' || COALESCE(CAST(basis AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_world GROUP BY metric, basis, year
      UNION ALL
      SELECT 'group:metric|basis|segment', COALESCE(CAST(metric AS TEXT), '') || '|' || COALESCE(CAST(basis AS TEXT), '') || '|' || COALESCE(CAST(segment AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_world GROUP BY metric, basis, segment
      UNION ALL
      SELECT 'group:scenario|year', COALESCE(CAST(scenario AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_world GROUP BY scenario, year
    ) s ON s.grouping = b.grouping AND s.key_value = b.key_value
    WHERE s.grouping IS NULL OR s.n_rows <> b.n_rows OR s.n_values <> b.n_values
          OR COALESCE(s.n_distinct, -1) <> COALESCE(b.n_distinct, -1)
          OR ABS(COALESCE(s.sum_value, 0) - COALESCE(b.sum_value, 0)) > 0.001
          OR COALESCE(s.min_num, -1e300) <> COALESCE(b.min_num, -1e300) OR COALESCE(s.max_num, -1e300) <> COALESCE(b.max_num, -1e300)
          OR s.min_text IS NOT b.min_text OR s.max_text IS NOT b.max_text
    UNION ALL
    -- groups that exist in the new table but not in the baseline
    SELECT s.grouping, s.key_value FROM (
      SELECT 'column:source_id' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(source_id) AS n_values, COUNT(DISTINCT source_id) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(source_id) AS min_text, MAX(source_id) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:region' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(region) AS n_values, COUNT(DISTINCT region) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(region) AS min_text, MAX(region) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:segment' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(segment) AS n_values, COUNT(DISTINCT segment) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(segment) AS min_text, MAX(segment) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:basis' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(basis) AS n_values, COUNT(DISTINCT basis) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(basis) AS min_text, MAX(basis) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:metric' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(metric) AS n_values, COUNT(DISTINCT metric) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(metric) AS min_text, MAX(metric) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:unit' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(unit) AS n_values, COUNT(DISTINCT unit) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(unit) AS min_text, MAX(unit) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:scenario' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(scenario) AS n_values, COUNT(DISTINCT scenario) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(scenario) AS min_text, MAX(scenario) AS max_text FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:year', 'ALL', COUNT(*), COUNT(year), COUNT(DISTINCT year), SUM(year), MIN(year), MAX(year), NULL, NULL FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'column:value', 'ALL', COUNT(*), COUNT(value), COUNT(DISTINCT value), SUM(value), MIN(value), MAX(value), NULL, NULL FROM stg_datacentre_annex_world
      UNION ALL
      SELECT 'group:metric|basis|year', COALESCE(CAST(metric AS TEXT), '') || '|' || COALESCE(CAST(basis AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_world GROUP BY metric, basis, year
      UNION ALL
      SELECT 'group:metric|basis|segment', COALESCE(CAST(metric AS TEXT), '') || '|' || COALESCE(CAST(basis AS TEXT), '') || '|' || COALESCE(CAST(segment AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_world GROUP BY metric, basis, segment
      UNION ALL
      SELECT 'group:scenario|year', COALESCE(CAST(scenario AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_world GROUP BY scenario, year
    ) s WHERE s.grouping LIKE 'group:%' AND NOT EXISTS (SELECT 1 FROM baseline_datacentre_annex_world b WHERE b.grouping = s.grouping AND b.key_value = s.key_value)
);

-- check: IEA annex regional overview
SELECT 'stg_datacentre_annex_regional', 'rows read', 'INFO', COUNT(*) || ' regional rows' FROM stg_datacentre_annex_regional;

-- check: IEA annex regional every row has a metric
SELECT 'stg_datacentre_annex_regional', 'every row has a metric and a unit (a section header was found above it)',
       CASE WHEN SUM(metric IS NULL OR unit IS NULL) = 0 THEN 'PASS' ELSE 'WARN' END, SUM(metric IS NULL OR unit IS NULL) || ' rows without metric'
FROM stg_datacentre_annex_regional;

-- check: IEA annex six regions add up to the world figure
WITH x AS (
    SELECT SUM(CASE WHEN region IN ('North America', 'Central and South America', 'Europe', 'Africa', 'Middle East', 'Asia Pacific') THEN value END) AS parts,
           MAX(CASE WHEN region = 'World' THEN value END) AS world
    FROM stg_datacentre_annex_regional
    WHERE metric = 'Electricity consumption' AND basis = 'Whole data centre' AND year = 2024
)
SELECT 'stg_datacentre_annex_regional', '2024 six regions add up to the world electricity figure (3% tolerance)',
       CASE WHEN ABS(parts - world) / world < 0.03 THEN 'PASS' ELSE 'WARN' END,
       'sum ' || printf('%.1f', parts) || ' vs world ' || printf('%.1f', world)
FROM x;

-- check: datacentre_annex_regional staging vs the old Python cleaning (frozen baseline of column and group summaries) requires=baseline_datacentre_annex_regional
SELECT 'stg_datacentre_annex_regional vs python baseline',
       'row count, non-null counts, distinct counts, sums, min and max per column, and counts and sums per group match the old Python output',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN COUNT(*) = 0 THEN (SELECT COUNT(*) FROM baseline_datacentre_annex_regional) || ' column and group summaries compared, all equal'
            ELSE COUNT(*) || ' summaries differ' END
FROM (
    SELECT b.grouping, b.key_value FROM baseline_datacentre_annex_regional b
    LEFT JOIN (
      SELECT 'column:source_id' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(source_id) AS n_values, COUNT(DISTINCT source_id) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(source_id) AS min_text, MAX(source_id) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:region' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(region) AS n_values, COUNT(DISTINCT region) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(region) AS min_text, MAX(region) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:segment' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(segment) AS n_values, COUNT(DISTINCT segment) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(segment) AS min_text, MAX(segment) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:basis' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(basis) AS n_values, COUNT(DISTINCT basis) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(basis) AS min_text, MAX(basis) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:metric' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(metric) AS n_values, COUNT(DISTINCT metric) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(metric) AS min_text, MAX(metric) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:unit' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(unit) AS n_values, COUNT(DISTINCT unit) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(unit) AS min_text, MAX(unit) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:scenario' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(scenario) AS n_values, COUNT(DISTINCT scenario) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(scenario) AS min_text, MAX(scenario) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:year', 'ALL', COUNT(*), COUNT(year), COUNT(DISTINCT year), SUM(year), MIN(year), MAX(year), NULL, NULL FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:value', 'ALL', COUNT(*), COUNT(value), COUNT(DISTINCT value), SUM(value), MIN(value), MAX(value), NULL, NULL FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'group:metric|basis|year', COALESCE(CAST(metric AS TEXT), '') || '|' || COALESCE(CAST(basis AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_regional GROUP BY metric, basis, year
      UNION ALL
      SELECT 'group:metric|basis|region', COALESCE(CAST(metric AS TEXT), '') || '|' || COALESCE(CAST(basis AS TEXT), '') || '|' || COALESCE(CAST(region AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_regional GROUP BY metric, basis, region
      UNION ALL
      SELECT 'group:scenario|year', COALESCE(CAST(scenario AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_regional GROUP BY scenario, year
    ) s ON s.grouping = b.grouping AND s.key_value = b.key_value
    WHERE s.grouping IS NULL OR s.n_rows <> b.n_rows OR s.n_values <> b.n_values
          OR COALESCE(s.n_distinct, -1) <> COALESCE(b.n_distinct, -1)
          OR ABS(COALESCE(s.sum_value, 0) - COALESCE(b.sum_value, 0)) > 0.001
          OR COALESCE(s.min_num, -1e300) <> COALESCE(b.min_num, -1e300) OR COALESCE(s.max_num, -1e300) <> COALESCE(b.max_num, -1e300)
          OR s.min_text IS NOT b.min_text OR s.max_text IS NOT b.max_text
    UNION ALL
    -- groups that exist in the new table but not in the baseline
    SELECT s.grouping, s.key_value FROM (
      SELECT 'column:source_id' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(source_id) AS n_values, COUNT(DISTINCT source_id) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(source_id) AS min_text, MAX(source_id) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:region' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(region) AS n_values, COUNT(DISTINCT region) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(region) AS min_text, MAX(region) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:segment' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(segment) AS n_values, COUNT(DISTINCT segment) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(segment) AS min_text, MAX(segment) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:basis' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(basis) AS n_values, COUNT(DISTINCT basis) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(basis) AS min_text, MAX(basis) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:metric' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(metric) AS n_values, COUNT(DISTINCT metric) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(metric) AS min_text, MAX(metric) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:unit' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(unit) AS n_values, COUNT(DISTINCT unit) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(unit) AS min_text, MAX(unit) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:scenario' AS grouping, 'ALL' AS key_value, COUNT(*) AS n_rows, COUNT(scenario) AS n_values, COUNT(DISTINCT scenario) AS n_distinct, NULL AS sum_value, NULL AS min_num, NULL AS max_num, MIN(scenario) AS min_text, MAX(scenario) AS max_text FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:year', 'ALL', COUNT(*), COUNT(year), COUNT(DISTINCT year), SUM(year), MIN(year), MAX(year), NULL, NULL FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'column:value', 'ALL', COUNT(*), COUNT(value), COUNT(DISTINCT value), SUM(value), MIN(value), MAX(value), NULL, NULL FROM stg_datacentre_annex_regional
      UNION ALL
      SELECT 'group:metric|basis|year', COALESCE(CAST(metric AS TEXT), '') || '|' || COALESCE(CAST(basis AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_regional GROUP BY metric, basis, year
      UNION ALL
      SELECT 'group:metric|basis|region', COALESCE(CAST(metric AS TEXT), '') || '|' || COALESCE(CAST(basis AS TEXT), '') || '|' || COALESCE(CAST(region AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_regional GROUP BY metric, basis, region
      UNION ALL
      SELECT 'group:scenario|year', COALESCE(CAST(scenario AS TEXT), '') || '|' || COALESCE(CAST(year AS TEXT), ''), COUNT(*), COUNT(value), NULL, SUM(value), NULL, NULL, NULL, NULL FROM stg_datacentre_annex_regional GROUP BY scenario, year
    ) s WHERE s.grouping LIKE 'group:%' AND NOT EXISTS (SELECT 1 FROM baseline_datacentre_annex_regional b WHERE b.grouping = s.grouping AND b.key_value = s.key_value)
);

-- ===================== Demand scenario checks =====================
-- check: data-centre capacity scenario block mapping
SELECT 'stg_datacentre_capacity_scenarios', 'scenario names in row 2 of the annex are Base, Lift-Off, High Efficiency, Headwinds in columns H, K, N, Q (column mapping holds)',
       CASE WHEN SUM(ok) = 4 THEN 'PASS' ELSE 'FAIL' END, SUM(ok) || ' of 4 headers as expected'
FROM (SELECT (excel_col = 'H' AND value_text = 'Base') OR (excel_col = 'K' AND value_text = 'Lift-Off')
             OR (excel_col = 'N' AND value_text = 'High Efficiency') OR (excel_col = 'Q' AND value_text = 'Headwinds') AS ok
      FROM raw_iea_annex_cells WHERE sheet = 'World Data' AND excel_row = 2 AND excel_col IN ('H', 'K', 'N', 'Q'));

-- check: Base case capacity equals the existing annex table
SELECT 'stg_datacentre_capacity_scenarios', 'Base-case capacity (total and IT, 2030 and 2035) equals stg_datacentre_annex_world',
       CASE WHEN COUNT(*) = 0 AND (SELECT COUNT(*) FROM stg_datacentre_capacity_scenarios WHERE iea_case = 'Base') = 4 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' differences'
FROM stg_datacentre_capacity_scenarios s
LEFT JOIN stg_datacentre_annex_world w ON w.metric = 'Installed capacity' AND w.year = s.year AND w.segment = 'Total' AND w.basis = s.basis
WHERE s.iea_case = 'Base' AND (w.value IS NULL OR ABS(w.value - s.capacity_gw) > 0.000001);

-- check: estimates in the capacity table equal the annex estimates
SELECT 'stg_datacentre_capacity_scenarios', 'estimate years (2020, 2023, 2024) equal stg_datacentre_annex_world for total and IT',
       CASE WHEN COUNT(*) = 0 AND (SELECT COUNT(*) FROM stg_datacentre_capacity_scenarios WHERE iea_case = 'Estimate') = 6 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' differences'
FROM stg_datacentre_capacity_scenarios s
LEFT JOIN stg_datacentre_annex_world w ON w.metric = 'Installed capacity' AND w.year = s.year AND w.segment = 'Total' AND w.basis = s.basis
WHERE s.iea_case = 'Estimate' AND (w.value IS NULL OR ABS(w.value - s.capacity_gw) > 0.000001);

-- check: IT capacity is below total capacity in every case
SELECT 'stg_datacentre_capacity_scenarios', 'IT capacity is below total capacity in every case and year',
       CASE WHEN SUM(i.capacity_gw >= t.capacity_gw) = 0 THEN 'PASS' ELSE 'WARN' END,
       'IT / total ranges from ' || printf('%.2f', MIN(i.capacity_gw / t.capacity_gw)) || ' to ' || printf('%.2f', MAX(i.capacity_gw / t.capacity_gw))
FROM stg_datacentre_capacity_scenarios t
JOIN stg_datacentre_capacity_scenarios i ON i.iea_case = t.iea_case AND i.year = t.year AND i.basis = 'IT equipment'
WHERE t.basis = 'Whole data centre';

-- check: EV sales parts add up to the EV total (rounding tolerance 2%)
SELECT 'mart_ev_sales_path', 'BEV + PHEV + FCEV equal the EV total within 2% for 2025 and 2035 (IEA rounds to 2 significant figures)',
       CASE WHEN MAX(ABS(bev + phev + COALESCE(fcev, 0) - ev) / ev) < 0.02 THEN 'PASS' ELSE 'WARN' END,
       'largest difference ' || printf('%.2f', MAX(ABS(bev + phev + COALESCE(fcev, 0) - ev) / ev * 100)) || '%'
FROM mart_ev_sales_path WHERE path_method = 'direct';

-- check: direct endpoints equal the IEA values in staging
SELECT 'mart_ev_sales_path', 'direct 2025 and 2035 BEV, PHEV, EV and share equal stg_ev_data (World, Cars)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END, COUNT(*) || ' differences'
FROM mart_ev_sales_path p
WHERE p.path_method = 'direct' AND (
      ABS(p.bev - (SELECT value FROM stg_ev_data WHERE region_country = 'World' AND mode = 'Cars' AND parameter = 'EV sales' AND powertrain = 'BEV'
                   AND year = p.year AND category = CASE WHEN p.year = 2025 THEN 'Historical' ELSE 'Projection-' || p.iea_scenario END)) > 0.5
   OR ABS(p.share_pct - (SELECT value FROM stg_ev_data WHERE region_country = 'World' AND mode = 'Cars' AND parameter = 'EV sales share' AND powertrain = 'EV'
                   AND year = p.year AND category = CASE WHEN p.year = 2025 THEN 'Historical' ELSE 'Projection-' || p.iea_scenario END)) > 0.000001);

-- check: interpolated 2030 values sit between the endpoints and follow their formulas
SELECT 'mart_ev_sales_path', '2030 linear is the midpoint and constant growth is the geometric mean of the 2025 and 2035 values (BEV, PHEV, EV, share); constant growth is below linear',
       CASE WHEN SUM(ABS(l.bev - (a.bev + b.bev) / 2.0) > 1 OR ABS(g.bev - sqrt(a.bev * b.bev)) > 1 OR ABS(l.share_pct - (a.share_pct + b.share_pct) / 2.0) > 0.000001
                     OR ABS(g.ev - sqrt(a.ev * b.ev)) > 1 OR g.bev >= l.bev) = 0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' scenarios checked'
FROM mart_ev_sales_path a
JOIN mart_ev_sales_path b ON b.iea_scenario = a.iea_scenario AND b.year = 2035 AND b.path_method = 'direct'
JOIN mart_ev_sales_path l ON l.iea_scenario = a.iea_scenario AND l.year = 2030 AND l.path_method = 'linear'
JOIN mart_ev_sales_path g ON g.iea_scenario = a.iea_scenario AND g.year = 2030 AND g.path_method = 'constant_growth'
WHERE a.year = 2025 AND a.path_method = 'direct';

-- check: total sales and rounding band
SELECT 'mart_ev_sales_path', 'total car sales = EV sales / share, with min below central below max (derived, not from EV data)',
       CASE WHEN SUM(total_sales_min < total_sales_central AND total_sales_central < total_sales_max
                     AND ABS(total_sales_central - ev / (share_pct / 100.0)) < 1) = COUNT(*) THEN 'PASS' ELSE 'FAIL' END,
       'world car sales 2025 about ' || printf('%.1f', MAX(CASE WHEN year = 2025 THEN total_sales_central END) / 1000000.0) || ' million (band '
       || printf('%.1f', MAX(CASE WHEN year = 2025 THEN total_sales_min END) / 1000000.0) || ' to ' || printf('%.1f', MAX(CASE WHEN year = 2025 THEN total_sales_max END) / 1000000.0) || ')'
FROM mart_ev_sales_path;

-- check: EV copper identity (transition + market growth = direct change in copper in new cars)
SELECT 'mart_ev_copper_cases', 'transition + car-market growth equals the change in copper in new cars computed directly from BEV, PHEV and non-EV sales (every central case)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END, COUNT(*) || ' cases differ'
FROM mart_ev_copper_cases c
JOIN mart_ev_sales_path t ON t.iea_scenario = c.iea_scenario AND t.year = c.year AND t.path_method = c.path_method
JOIN mart_ev_sales_path b ON b.iea_scenario = c.iea_scenario AND b.year = 2025 AND b.path_method = 'direct'
WHERE c.growth_case = 'central'
  AND ABS(c.combined_new_car_copper_change_t
          - ((t.bev * c.bev_kg + t.phev * c.phev_kg + (t.total_sales_central - t.bev - t.phev) * c.petrol_kg)
             - (b.bev * c.bev_kg + b.phev * c.phev_kg + (b.total_sales_central - b.bev - b.phev) * c.petrol_kg)) / 1000.0) > 0.001;

-- check: EV case table is complete
SELECT 'mart_ev_copper_cases', 'one row for every scenario, 2030 path (2) or 2035, BEV, PHEV, petrol-car and rounding case (2 x 3 x 3 x 3 x 6 x 3)',
       CASE WHEN COUNT(*) = 972 AND COUNT(DISTINCT iea_scenario || year || path_method || bev_case || phev_case || petrol_case || growth_case) = 972 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' rows'
FROM mart_ev_copper_cases;

-- check: kilograms to tonnes arithmetic, recomputed as a sum of parts for one case. No source figures are typed here: the extra cars are read from mart_ev_sales_path (2030 linear path minus the 2025 actuals), and the copper per car are the middle values of S11 (BEV 86.5, PHEV 63.5, mid-size petrol 20 kg)
SELECT 'mart_ev_copper_cases', 'CPS 2030 linear, mid copper per car: transition = (extra BEV x (BEV kg - petrol kg) + extra PHEV x (PHEV kg - petrol kg)) / 1000 tonnes, extra cars read from mart_ev_sales_path',
       CASE WHEN ABS(c.transition_t - ((p30.bev - p25.bev) * (86.5 - 20.0) + (p30.phev - p25.phev) * (63.5 - 20.0)) / 1000.0) < 1 THEN 'PASS' ELSE 'FAIL' END,
       printf('%,d', CAST(c.transition_t AS INTEGER)) || ' t'
FROM mart_ev_copper_cases c
JOIN mart_ev_sales_path p30 ON p30.iea_scenario = c.iea_scenario AND p30.year = 2030 AND p30.path_method = 'linear'
JOIN mart_ev_sales_path p25 ON p25.iea_scenario = c.iea_scenario AND p25.year = 2025 AND p25.path_method = 'direct'
WHERE c.iea_scenario = 'CPS' AND c.year = 2030 AND c.path_method = 'linear' AND c.bev_case = 'mid' AND c.phev_case = 'mid' AND c.petrol_case = 'midsize_mid' AND c.growth_case = 'central';

-- check: data-centre path arithmetic
SELECT 'mart_dc_capacity_path', 'even path: yearly build x years = total additions; constant growth: the yearly builds add up to the same total and the target-year build is first-year build x (1+g)^(years-1)',
       CASE WHEN SUM(ABS(CASE path WHEN 'even' THEN build_in_target_year_gw * n_years
                                   ELSE build_first_year_gw * (power(1 + growth_rate, n_years) - 1) / growth_rate END - additions_total_gw) > 0.000001
                     OR (path = 'constant_growth' AND ABS(build_in_target_year_gw - build_first_year_gw * power(1 + growth_rate, n_years - 1)) > 0.000001)) = 0
            THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' paths checked; Base 2030: even ' || printf('%.2f', MAX(CASE WHEN iea_case = 'Base' AND year = 2030 AND basis = 'Whole data centre' AND path = 'even' THEN build_in_target_year_gw END))
       || ' GW a year, constant growth ' || printf('%.2f', MAX(CASE WHEN iea_case = 'Base' AND year = 2030 AND basis = 'Whole data centre' AND path = 'constant_growth' THEN build_in_target_year_gw END)) || ' GW in 2030'
FROM mart_dc_capacity_path;

-- check: data-centre copper arithmetic
SELECT 'mart_dc_copper_cases', 'new-capacity copper = GW x 1000 x t per MW, extra = (build - base build) x 1000 x t per MW (every case)',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END, COUNT(*) || ' cases differ'
FROM mart_dc_copper_cases
WHERE ABS(new_capacity_copper_t - build_in_target_year_gw * 1000.0 * t_per_mw) > 0.001
   OR ABS(extra_vs_base_t - (build_in_target_year_gw - base_build_gw) * 1000.0 * t_per_mw) > 0.001;

-- check: negative extras are explained
SELECT 'mart_dc_copper_cases', 'every negative extra-over-base-year number carries the explanation (a slower build, not negative demand), and gross new-capacity copper is never negative',
       CASE WHEN SUM(extra_vs_base_t < 0 AND note IS NULL) = 0 AND SUM(new_capacity_copper_t <= 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
       SUM(extra_vs_base_t < 0) || ' of ' || COUNT(*) || ' cases are negative and all carry the note'
FROM mart_dc_copper_cases;

-- check: headline negative rows carry the note
SELECT 'mart_demand_headline', 'every headline data-centre row with a negative low value carries the explanation',
       CASE WHEN SUM(low_t < 0 AND component_id = 'dc_extra_vs_base_year_build' AND note IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END,
       SUM(low_t < 0 AND component_id = 'dc_extra_vs_base_year_build') || ' rows with a negative low value'
FROM mart_demand_headline;

-- check: headline percentages are percent of the 2025e world mine production
SELECT 'mart_demand_headline', 'percent of mine output = tonnes / 2025e world mine production x 100 (every row), and the base is the USGS 2025 estimate',
       CASE WHEN COUNT(*) = 0 AND (SELECT value FROM mart_demand_context WHERE metric = 'world_mine_production_2025e_t') = 23000000.0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' rows differ; base ' || printf('%,d', CAST((SELECT value FROM mart_demand_context WHERE metric = 'world_mine_production_2025e_t') AS INTEGER)) || ' t'
FROM mart_demand_headline
WHERE ABS(mid_pct_of_mine - mid_t / (SELECT value FROM mart_demand_context WHERE metric = 'world_mine_production_2025e_t') * 100.0) > 0.000001;

-- check: low <= mid <= high in the headline table (for the cases where the ranges are monotonic)
SELECT 'mart_demand_headline', 'low is not above mid and mid is not above high for the EV terms and the data-centre new-capacity rows',
       CASE WHEN SUM(low_t > mid_t + 0.001 OR mid_t > high_t + 0.001) = 0 THEN 'PASS' ELSE 'WARN' END,
       SUM(low_t > mid_t + 0.001 OR mid_t > high_t + 0.001) || ' rows out of order of ' || COUNT(*)
FROM mart_demand_headline WHERE component_id <> 'dc_extra_vs_base_year_build';

-- check: sensitivity reference row equals the headline reference
SELECT 'mart_demand_sensitivity', 'reference case in the sensitivity table equals EV transition (CPS, 2030, linear, mid) + data-centre extra (Base, even, total capacity, mid) from the headline table',
       CASE WHEN ABS(s.headline_total_t - (e.mid_t + d.mid_t)) < 0.001 THEN 'PASS' ELSE 'FAIL' END,
       printf('%,d', CAST(s.headline_total_t AS INTEGER)) || ' t = ' || printf('%.2f', s.headline_total_pct_of_mine) || '% of 2025e mine output'
FROM mart_demand_sensitivity s
JOIN mart_demand_headline e ON e.component_id = 'ev_transition' AND e.year = 2030 AND e.variant = 'CPS' AND e.path_method = 'linear'
JOIN mart_demand_headline d ON d.component_id = 'dc_extra_vs_base_year_build' AND d.year = 2030 AND d.variant = 'Base' AND d.path_method = 'even' AND d.basis = 'Whole data centre'
WHERE s.bar_order = 0;

-- check: every sensitivity bar has its alternatives
SELECT 'mart_demand_sensitivity', 'every bar from 1 to 13 has at least one alternative row and the reference row exists once',
       CASE WHEN COUNT(DISTINCT CASE WHEN bar_order BETWEEN 1 AND 13 THEN bar_order END) = 13 AND SUM(bar_order = 0) = 1 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' rows, ' || COUNT(DISTINCT bar_order) || ' bar groups'
FROM mart_demand_sensitivity;

-- check: unreconciled S13 figure (information next to the known issue)
SELECT 'mart_demand_context', 'S13 reports ' || printf('%.1f', s13 / 1000000.0) || ' Mt of data-centre copper demand for 2025; the model gives ' || printf('%.2f', lo / 1000000.0) || ' to ' || printf('%.2f', hi / 1000000.0)
       || ' Mt for the 2024 build (known issue K02, unreconciled)', 'INFO',
       'S13 is ' || printf('%.1f', s13 / hi) || ' to ' || printf('%.1f', s13 / lo) || ' times the model'
FROM (SELECT (SELECT value FROM mart_demand_context WHERE metric = 's13_dc_copper_demand_2025_t') AS s13,
             (SELECT value FROM mart_demand_context WHERE metric = 'model_dc_build_2024_copper_low_t') AS lo,
             (SELECT value FROM mart_demand_context WHERE metric = 'model_dc_build_2024_copper_high_t') AS hi);

-- check: IT capacity versus total capacity in the data-centre result (information; the capacity basis of the t/MW is unresolved, known issue K01)
SELECT 'mart_dc_copper_cases', 'IT-capacity basis gives a lower data-centre result than total capacity (Base, 2030, even, mid, 2023-24 base): new-capacity copper and extra over the base year', 'INFO',
       'new-capacity copper ' || printf('%.0f', (1 - i.new_capacity_copper_t / t.new_capacity_copper_t) * 100) || '% lower on IT capacity; extra over base year '
       || printf('%.0f', (1 - i.extra_vs_base_t / t.extra_vs_base_t) * 100) || '% lower'
FROM mart_dc_copper_cases t
JOIN mart_dc_copper_cases i ON i.iea_case = t.iea_case AND i.year = t.year AND i.path = t.path AND i.intensity_case = t.intensity_case AND i.base_build_case = t.base_build_case AND i.basis = 'IT equipment'
WHERE t.basis = 'Whole data centre' AND t.iea_case = 'Base' AND t.year = 2030 AND t.path = 'even' AND t.intensity_case = 'mid' AND t.base_build_case = '2023-24';

-- check: every USGS country has an ISO mapping (the supply map needs it)
SELECT 'usgs_country_iso', 'every USGS country name (production 2025 and reserves) is in the ISO mapping table',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       CASE WHEN COUNT(*) = 0 THEN 'all matched' ELSE 'unmatched: ' || GROUP_CONCAT(country, '; ') END
FROM (SELECT DISTINCT country FROM stg_usgs_copper WHERE statistic_detail IN ('Mine production', 'Reserves') AND value IS NOT NULL AND country NOT LIKE 'World%')
WHERE country NOT IN (SELECT usgs_name FROM usgs_country_iso);

-- check: ISO mapping rows are well formed
SELECT 'usgs_country_iso', 'placeable rows have a 3-letter ISO code and an M49 code; the not placeable row has neither',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' bad rows'
FROM usgs_country_iso
WHERE (placeable = 1 AND (iso_a3 IS NULL OR length(iso_a3) <> 3 OR m49 IS NULL))
   OR (placeable = 0 AND (iso_a3 IS NOT NULL OR m49 IS NOT NULL));

-- check: events are dated, labelled and have a status
SELECT 'events', 'every event has a month (YYYY-MM), a label, a description and a status of proposed or approved',
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' bad rows'
FROM events
WHERE month NOT GLOB '[12][0-9][0-9][0-9]-[01][0-9]' OR label IS NULL OR description IS NULL OR status NOT IN ('proposed', 'approved');

-- check: plaque price equals the World Bank price requires=res_story_copper_record_facts
SELECT 'res_story_copper_record_facts', 'the latest price on the plaque equals the World Bank copper price for that month',
       CASE WHEN ABS(f.value - w.value) < 0.01 THEN 'PASS' ELSE 'FAIL' END,
       substr(f.month, 1, 7) || ': ' || f.value || ' in the result table, ' || w.value || ' in staging'
FROM res_story_copper_record_facts f JOIN stg_wb_prices_monthly w ON w.date = f.month AND w.commodity = 'Copper'
WHERE f.fact_id = 'nominal_latest';

-- check: the record as quoted is the highest World Bank price requires=res_story_copper_record_facts
SELECT 'res_story_copper_record_facts', 'the record as quoted is the highest monthly World Bank copper price since 1960',
       CASE WHEN ABS(f.value - (SELECT MAX(value) FROM stg_wb_prices_monthly WHERE commodity = 'Copper')) < 0.01 THEN 'PASS' ELSE 'FAIL' END,
       substr(f.month, 1, 7) || ': ' || f.value
FROM res_story_copper_record_facts f WHERE f.fact_id = 'nominal_record';

-- check: one real record in both result tables requires=res_interlude_records
SELECT 'res_interlude_records', 'copper''s real record is the same month and value as in the story facts (plaque, chapter 1 and summary use it)',
       CASE WHEN substr(f.month, 1, 7) = i.real_peak_month AND ABS(f.value - i.real_peak) < 0.5 THEN 'PASS' ELSE 'FAIL' END,
       i.real_peak_month || ' ' || ROUND(i.real_peak, 0) || ' vs ' || substr(f.month, 1, 7) || ' ' || f.value
FROM res_story_copper_record_facts f, res_interlude_records i
WHERE f.fact_id = 'real_peak_all' AND i.commodity = 'copper';

-- check: interlude prices equal the World Bank prices requires=res_interlude_records
SELECT 'res_interlude_records', 'the latest price of each of the five series equals the World Bank price for that month',
       CASE WHEN SUM(ABS(i.latest_nominal - w.value) < 0.01) = COUNT(*) AND COUNT(*) = 5 THEN 'PASS' ELSE 'FAIL' END,
       SUM(ABS(i.latest_nominal - w.value) < 0.01) || ' of ' || COUNT(*) || ' series match'
FROM res_interlude_records i JOIN stg_wb_prices_monthly w ON w.commodity = i.world_bank_name AND w.date = i.latest_month || '-01';

-- check: the euro record requires=res_euro_record
SELECT 'res_euro_record', 'the latest euro price equals the panel and is the highest since January 1999',
       CASE WHEN ABS(e.value - ROUND(p.copper_eur_t_avg, 0)) < 0.5 AND p.copper_eur_t_avg >= (SELECT MAX(copper_eur_t_avg) FROM mart_monthly_panel) - 0.01 THEN 'PASS' ELSE 'FAIL' END,
       e.month || ': ' || e.value || ' EUR per tonne'
FROM res_euro_record e JOIN mart_monthly_panel p ON p.month = e.month || '-01'
WHERE e.fact_id = 'eur_latest';

-- check: supply adds up requires=res_supply_countries
SELECT 'res_supply_countries', 'countries plus other countries add up to the USGS world total (0.5% tolerance) and match staging',
       CASE WHEN ABS(c.listed - w.production_2025e_kt) / w.production_2025e_kt < 0.005 AND c.mismatch = 0 THEN 'PASS' ELSE 'FAIL' END,
       c.listed || ' kt listed, world ' || w.production_2025e_kt || ' kt; ' || c.mismatch || ' rows differ from staging'
FROM (SELECT SUM(r.production_2025e_kt) AS listed,
             SUM(CASE WHEN ABS(r.production_2025e_kt - u.value) > 0.01 THEN 1 ELSE 0 END) AS mismatch
      FROM res_supply_countries r JOIN stg_usgs_copper u ON u.country = r.country AND u.statistic_detail = 'Mine production' AND u.year = 2025
      WHERE r.country <> 'World total') c,
     (SELECT production_2025e_kt FROM res_supply_countries WHERE country = 'World total') w;

-- check: the dollar direction counts reconcile requires=res_story_guess_dollar
SELECT 'res_story_guess_dollar', 'opposite, same direction and unchanged months add up to the months compared',
       CASE WHEN o.value + s.value + u.value = m.value THEN 'PASS' ELSE 'FAIL' END,
       o.value || ' + ' || s.value || ' + ' || u.value || ' of ' || m.value
FROM res_story_guess_dollar o, res_story_guess_dollar s, res_story_guess_dollar u, res_story_guess_dollar m
WHERE o.fact_id = 'opposite_months' AND s.fact_id = 'same_direction_months' AND u.fact_id = 'unchanged_months' AND m.fact_id = 'months_total';

-- check: the scatter has the months of the correlation requires=res_dollar_scatter
SELECT 'res_dollar_correlations', 'the dollar chapter scatter has the same months as the correlation with the broad dollar index',
       CASE WHEN (SELECT COUNT(*) FROM res_dollar_scatter) = c.months THEN 'PASS' ELSE 'FAIL' END,
       (SELECT COUNT(*) FROM res_dollar_scatter) || ' points, ' || c.months || ' months'
FROM res_dollar_correlations c WHERE c.comparison LIKE 'Copper vs broad dollar index%';

-- check: the ratio tests requires=res_cu_al_threshold_table
SELECT 'res_cu_al_threshold_table', 'every rule has both horizons and an adjusted p-value between 0 and 1',
       CASE WHEN COUNT(*) = 2 * COUNT(DISTINCT rule_id) AND MIN(p_holm) >= 0 AND MAX(p_holm) <= 1 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' rows, ' || COUNT(DISTINCT rule_id) || ' rules, ' || SUM(p_holm < 0.05) || ' below 0.05 after adjustment'
FROM res_cu_al_threshold_table;

-- check: the demand total requires=res_demand_sensitivity
SELECT 'res_demand_sensitivity', 'the reference total is the EV transition plus the data-centre extra over the 2024 build',
       CASE WHEN ABS(headline_total_t - ev_transition_t - dc_extra_vs_base_t) < 1 THEN 'PASS' ELSE 'FAIL' END,
       ROUND(headline_total_t, 0) || ' t = ' || ROUND(ev_transition_t, 0) || ' + ' || ROUND(dc_extra_vs_base_t, 0)
FROM res_demand_sensitivity WHERE bar_order = 0;

-- check: the checks shown on the site requires=res_dashboard_checks
SELECT 'res_dashboard_checks', 'the list of checks shown on the site has no failed check',
       CASE WHEN SUM(status = 'FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END,
       SUM(status = 'PASS') || ' passed, ' || SUM(status = 'WARN') || ' warnings, ' || SUM(status = 'FAIL') || ' failed'
FROM res_dashboard_checks;

-- check: end-use shares sum to 100
SELECT 'copper_end_use', 'the six end-use shares add up to 100 percent (one scope, one year)',
       CASE WHEN SUM(share_pct) = 100 AND COUNT(*) = 6 AND COUNT(DISTINCT scope || year) = 1 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' sectors add up to ' || SUM(share_pct) || ' percent'
FROM copper_end_use;

-- check: physical constants are present
SELECT 'physical_constants', 'copper and aluminium both have a conductivity and a density, and annealed copper is 100 percent IACS by definition',
       CASE WHEN SUM(property = 'density_20C') = 2 AND SUM(property LIKE '%conductivity') = 2
                 AND (SELECT value FROM physical_constants WHERE material LIKE 'Copper%' AND property = 'volume_conductivity') = 100.0 THEN 'PASS' ELSE 'FAIL' END,
       SUM(property = 'density_20C') || ' densities, ' || SUM(property LIKE '%conductivity') || ' conductivities'
FROM physical_constants;

-- check: copper context facts are present
SELECT 'copper_context_facts', 'facts F01 to F07 are present, the percentages are between 0 and 100 and each has a source',
       CASE WHEN COUNT(*) = 7 AND SUM(fact_id IN ('F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07')) = 7
                 AND SUM(unit = 'percent' AND (value < 0 OR value > 100)) = 0 AND SUM(source_id IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' facts'
FROM copper_context_facts;

-- check: the ICSG mine output equals the USGS figure for 2024
SELECT 'copper_context_facts', 'ICSG world mine production 2024 (F05) equals the USGS world mine production 2024 (both about 23 million tonnes)',
       CASE WHEN ABS(f.value * 1000 - u.value) / u.value < 0.02 THEN 'PASS' ELSE 'WARN' END,
       f.value || ' million tonnes (ICSG) vs ' || u.value || ' thousand tonnes (USGS)'
FROM copper_context_facts f, stg_usgs_copper u
WHERE f.fact_id = 'F05' AND u.country = 'World total' AND u.statistic_detail = 'Mine production: rounded' AND u.year = 2024;

-- check: end-use result table equals the collected table requires=res_uses_end_use
SELECT 'res_uses_end_use', 'the end-use result table has the six sectors and the same shares as the collected ICSG table, adding up to 100',
       CASE WHEN COUNT(*) = 6 AND SUM(r.share_pct) = 100 AND SUM(r.share_pct = c.share_pct) = 6 THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' sectors, sum ' || SUM(r.share_pct)
FROM res_uses_end_use r JOIN copper_end_use c ON c.sector = r.sector;

-- check: the 12-month change on the plaque requires=res_uses_facts
SELECT 'res_uses_facts', 'the 12-month change equals the World Bank prices of August 2026 and August 2025',
       CASE WHEN ABS(f.value - (a.value / b.value - 1) * 100) < 0.01 THEN 'PASS' ELSE 'FAIL' END,
       ROUND(f.value, 2) || '% = ' || a.value || ' / ' || b.value || ' - 1'
FROM res_uses_facts f, stg_wb_prices_monthly a, stg_wb_prices_monthly b
WHERE f.fact_id = 'copper_12m_change_pct' AND a.commodity = 'Copper' AND a.date = '2026-08-01' AND b.commodity = 'Copper' AND b.date = '2025-08-01';

-- check: refinery shares match USGS requires=res_refined_vs_mined
SELECT 'res_refined_vs_mined', 'refinery output of each country in the chart equals the USGS figure, and every share is of the USGS world total',
       CASE WHEN SUM(ABS(r.refinery_kt - u.value) < 0.01) = COUNT(*) AND SUM(ABS(r.refinery_share_pct - ROUND(100.0 * u.value / r.world_refinery_kt, 1)) < 0.01) = COUNT(*) THEN 'PASS' ELSE 'FAIL' END,
       SUM(ABS(r.refinery_kt - u.value) < 0.01) || ' of ' || COUNT(*) || ' countries match'
FROM res_refined_vs_mined r JOIN stg_usgs_copper u ON u.country = r.country AND u.statistic_detail = 'Refinery production' AND u.year = 2025 AND u.section LIKE 'World Mine%';

-- check: Japan has no mine output requires=res_refined_vs_mined
SELECT 'res_refined_vs_mined', 'a country without a USGS mine figure has no mine share (never zero)',
       CASE WHEN SUM(mine_listed = 0 AND mine_share_pct IS NULL) = SUM(mine_listed = 0) AND SUM(mine_listed = 0) >= 1 THEN 'PASS' ELSE 'FAIL' END,
       SUM(mine_listed = 0) || ' country without a mine figure'
FROM res_refined_vs_mined;

-- check: aluminium break-even recomputed from the physical constants requires=res_aluminium_case
SELECT 'res_aluminium_case', 'the break-even ratio equals 1 / ((1 / conductivity) x (aluminium density / copper density)) from the collected constants',
       CASE WHEN ABS(b.value - 1.0 / ((100.0 / a.value) * (d.value / c.value))) < 0.0005 THEN 'PASS' ELSE 'FAIL' END,
       ROUND(b.value, 4) || ' from conductivity ' || a.value || ' percent IACS, densities ' || d.value || ' and ' || c.value
FROM res_aluminium_case b,
     (SELECT value FROM physical_constants WHERE material LIKE 'Aluminium%' AND property = 'volume_conductivity') a,
     (SELECT value FROM physical_constants WHERE material LIKE 'Copper%' AND property = 'density_20C') c,
     (SELECT value FROM physical_constants WHERE material LIKE 'Aluminium%' AND property = 'density_20C') d
WHERE b.fact_id = 'breakeven_ratio';

-- check: the run above the break-even is unbroken requires=res_aluminium_case
SELECT 'res_aluminium_case', 'no month after the last month below the break-even is at or below it, and that last month is the one named',
       CASE WHEN SUM(m.cu_al_ratio <= b.be AND m.month > l.lb || '-01') = 0
                 AND MAX(CASE WHEN m.cu_al_ratio <= b.be THEN m.month END) = l.lb || '-01' THEN 'PASS' ELSE 'FAIL' END,
       'last month at or below the break-even: ' || l.lb
FROM mart_cu_al_ratio m,
     (SELECT CAST(value AS REAL) AS be FROM res_aluminium_case WHERE fact_id = 'breakeven_ratio') b,
     (SELECT value AS lb FROM res_aluminium_case WHERE fact_id = 'last_month_below') l;

-- check: the demand total against Russia requires=res_demand_scale
SELECT 'res_demand_scale', 'the 2030 reference total in the scale sentence equals the sensitivity table, and Russia equals the USGS figure',
       CASE WHEN ABS(t.value - s.headline_total_t / 1000.0) < 0.5 AND ABS(r.value - u.value) < 0.01 THEN 'PASS' ELSE 'FAIL' END,
       ROUND(t.value, 0) || ' kt against Russia ' || r.value || ' kt'
FROM res_demand_scale t, res_demand_scale r, res_demand_sensitivity s, stg_usgs_copper u
WHERE t.fact_id = 'total_2030_kt' AND r.fact_id = 'russia_mine_2025e_kt' AND s.bar_order = 0
  AND u.country = 'Russia' AND u.statistic_detail = 'Mine production' AND u.year = 2025 AND u.section LIKE 'World Mine%';

-- check: the figure list of the story brief requires=res_story_figure_checks
SELECT 'res_story_figure_checks', 'every figure computed for the story brief reproduces its expected value',
       CASE WHEN SUM(status = 'PASS') = COUNT(*) THEN 'PASS' ELSE 'FAIL' END,
       SUM(status = 'PASS') || ' of ' || COUNT(*) || ' figures pass'
FROM res_story_figure_checks;

-- check: the dashboard series equals the monthly panel for the months both cover requires=res_dash_series
SELECT 'res_dash_series', 'dashboard copper (dollars and euros) equals the monthly panel in every month since 1999',
       CASE WHEN COUNT(*) > 300 AND SUM(ABS(d.cu_usd - p.copper_usd_t_avg) < 0.001) = COUNT(*) AND SUM(ABS(d.cu_eur - p.copper_eur_t_avg) < 0.01) = COUNT(*) THEN 'PASS' ELSE 'FAIL' END,
       SUM(ABS(d.cu_usd - p.copper_usd_t_avg) < 0.001) || ' of ' || COUNT(*) || ' months match'
FROM res_dash_series d JOIN mart_monthly_panel p ON substr(p.month, 1, 7) = d.month;

-- check: the dashboard ratio equals the ratio mart in every month requires=res_dash_series
SELECT 'res_dash_series', 'dashboard copper-to-aluminium ratio equals the ratio mart in every month, and the series has one row per month',
       CASE WHEN COUNT(*) = (SELECT COUNT(*) FROM mart_cu_al_ratio) AND SUM(ABS(d.ratio - m.cu_al_ratio) < 0.0001) = COUNT(*) THEN 'PASS' ELSE 'FAIL' END,
       COUNT(*) || ' months'
FROM res_dash_series d JOIN mart_cu_al_ratio m ON substr(m.month, 1, 7) = d.month;

-- check: the real series is empty only where US CPI is missing requires=res_dash_series
SELECT 'res_dash_series', 'the real copper value is empty in exactly the months with no US CPI value (October 2025) and nowhere else',
       CASE WHEN SUM(cu_real IS NULL) = 1 AND MAX(CASE WHEN cu_real IS NULL THEN month END) = '2025-10' THEN 'PASS' ELSE 'FAIL' END,
       SUM(cu_real IS NULL) || ' empty month(s)'
FROM res_dash_series;

-- check: the dashboard figures requires=res_dash_figure_checks
SELECT 'res_dash_figure_checks', 'every latest-month figure on the dashboard reproduces from an independent source table',
       CASE WHEN SUM(status = 'PASS') = COUNT(*) THEN 'PASS' ELSE 'FAIL' END,
       SUM(status = 'PASS') || ' of ' || COUNT(*) || ' figures pass'
FROM res_dash_figure_checks;
