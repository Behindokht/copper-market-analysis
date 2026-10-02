-- 02_marts.sql
-- Marts layer: analysis-ready tables built only from stg_ tables.
--
-- Column naming rule (so averages and month-end values are never mixed by accident):
--   *_avg        monthly average (World Bank and FRED monthly series are monthly averages; the dollar index is the
--                mean of the daily values in the month)
--   *_month_end  value on the last day of the month that has a value (robustness check only, not used in the main tests).
--                LME month-end and LME average columns only cover complete months: the last month of LME data (July 2025,
--                data ends on the 25th) is left empty so a mid-month price is never called a month-end price.
--   *_logret_m   monthly log return, ln(x_t / x_t-1), used for statistics
--   *_pct_m      simple monthly change in percent, (x_t / x_t-1 - 1) * 100, used for charts and labels
--   us10y_chg_pp_m   change of the interest rate in percentage points (a rate has no return)

DROP TABLE IF EXISTS mart_monthly_panel;
DROP TABLE IF EXISTS mart_monthly_changes;

-- One row per calendar month from 1999-01 (first month of EUR/USD) to the last month of World Bank copper.
-- A series with no value in a month stays NULL; nothing is filled in or interpolated.
CREATE TABLE mart_monthly_panel AS
WITH RECURSIVE spine(month) AS (
    SELECT '1999-01-01'
    UNION ALL
    SELECT date(month, '+1 month') FROM spine
    WHERE month < (SELECT MAX(date) FROM stg_wb_prices_monthly WHERE commodity = 'Copper')
),
wb AS (
    SELECT date AS month,
           MAX(CASE WHEN commodity = 'Copper'   THEN value END) AS copper_usd_t_avg,
           MAX(CASE WHEN commodity = 'Aluminum' THEN value END) AS aluminium_usd_t_avg
    FROM stg_wb_prices_monthly
    WHERE commodity IN ('Copper', 'Aluminum')
    GROUP BY date
),
fred AS (
    SELECT date AS month,
           MAX(CASE WHEN series_id = 'EXUSEU'    THEN value END) AS usd_per_eur_avg,
           MAX(CASE WHEN series_id = 'GS10'      THEN value END) AS us10y_pct_avg,
           MAX(CASE WHEN series_id = 'CPIAUCSL'  THEN value END) AS cpi_index
    FROM stg_fred_monthly
    GROUP BY date
),
lme AS (
    SELECT substr(date, 1, 7) || '-01' AS month,
           AVG(cash_usd_t)  AS cash_avg,
           MAX(date)        AS last_day
    FROM stg_lme_copper_daily
    WHERE cash_usd_t IS NOT NULL
      AND substr(date, 1, 7) < (SELECT substr(MAX(date), 1, 7) FROM stg_lme_copper_daily)
    GROUP BY substr(date, 1, 7)
),
dxy AS (
    SELECT substr(date, 1, 7) || '-01' AS month,
           AVG(value)  AS dollar_index_avg,
           COUNT(*)    AS dollar_index_days,
           MAX(date)   AS dollar_index_last_day
    FROM stg_fred_dtwexbgs_daily
    GROUP BY substr(date, 1, 7)
)
SELECT
    s.month,
    wb.copper_usd_t_avg,
    wb.aluminium_usd_t_avg,
    fred.usd_per_eur_avg,
    -- copper in euros: average USD price divided by average USD per euro (close to, not exactly, the average of daily euro prices)
    wb.copper_usd_t_avg / fred.usd_per_eur_avg AS copper_eur_t_avg,
    dxy.dollar_index_avg,
    dxy.dollar_index_days,
    fred.us10y_pct_avg,
    fred.cpi_index,
    dxy.dollar_index_last_day            AS dollar_index_month_end_date,
    e.value                              AS dollar_index_month_end,
    lme.cash_avg                         AS copper_lme_cash_usd_t_avg,
    lme.last_day                         AS copper_lme_cash_month_end_date,
    le.cash_usd_t                        AS copper_lme_cash_usd_t_month_end
FROM spine s
LEFT JOIN wb   ON wb.month   = s.month
LEFT JOIN fred ON fred.month = s.month
LEFT JOIN dxy  ON dxy.month  = s.month
LEFT JOIN stg_fred_dtwexbgs_daily e ON e.date = dxy.dollar_index_last_day
LEFT JOIN lme ON lme.month = s.month
LEFT JOIN stg_lme_copper_daily le ON le.date = lme.last_day
ORDER BY s.month;

CREATE UNIQUE INDEX ix_mart_panel_month ON mart_monthly_panel(month);

-- Monthly changes from the panel. LAG looks at the previous calendar month because the panel has no missing months,
-- and a change is NULL whenever either month has no value (for example CPI around 2025-10).
CREATE TABLE mart_monthly_changes AS
SELECT
    month,
    LN(copper_usd_t_avg / LAG(copper_usd_t_avg) OVER w)           AS copper_usd_logret_m,
    (copper_usd_t_avg / LAG(copper_usd_t_avg) OVER w - 1) * 100   AS copper_usd_pct_m,
    LN(aluminium_usd_t_avg / LAG(aluminium_usd_t_avg) OVER w)         AS aluminium_usd_logret_m,
    (aluminium_usd_t_avg / LAG(aluminium_usd_t_avg) OVER w - 1) * 100 AS aluminium_usd_pct_m,
    LN(usd_per_eur_avg / LAG(usd_per_eur_avg) OVER w)             AS usd_per_eur_logret_m,
    (usd_per_eur_avg / LAG(usd_per_eur_avg) OVER w - 1) * 100     AS usd_per_eur_pct_m,
    LN(copper_eur_t_avg / LAG(copper_eur_t_avg) OVER w)           AS copper_eur_logret_m,
    (copper_eur_t_avg / LAG(copper_eur_t_avg) OVER w - 1) * 100   AS copper_eur_pct_m,
    LN(dollar_index_avg / LAG(dollar_index_avg) OVER w)           AS dollar_index_logret_m,
    (dollar_index_avg / LAG(dollar_index_avg) OVER w - 1) * 100   AS dollar_index_pct_m,
    us10y_pct_avg - LAG(us10y_pct_avg) OVER w                     AS us10y_chg_pp_m,
    LN(cpi_index / LAG(cpi_index) OVER w)                         AS cpi_logret_m,
    (cpi_index / LAG(cpi_index) OVER w - 1) * 100                 AS cpi_pct_m,
    -- inflation-adjusted copper: log return of copper minus log return of CPI (exact in logs)
    LN(copper_usd_t_avg / LAG(copper_usd_t_avg) OVER w) - LN(cpi_index / LAG(cpi_index) OVER w) AS copper_real_usd_logret_m,
    -- robustness check inputs: LME copper and the dollar index both as monthly averages and both as month-end values
    -- (EUR/USD is only available as a monthly average, so the month-end check covers the dollar index only)
    LN(copper_lme_cash_usd_t_avg / LAG(copper_lme_cash_usd_t_avg) OVER w)             AS copper_lme_cash_avg_logret_m,
    LN(copper_lme_cash_usd_t_month_end / LAG(copper_lme_cash_usd_t_month_end) OVER w) AS copper_lme_cash_month_end_logret_m,
    LN(dollar_index_month_end / LAG(dollar_index_month_end) OVER w)                   AS dollar_index_month_end_logret_m
FROM mart_monthly_panel
WINDOW w AS (ORDER BY month)
ORDER BY month;

CREATE UNIQUE INDEX ix_mart_changes_month ON mart_monthly_changes(month);

-- ---------------------------------------------------------------------------------------------------------------------
-- Copper-to-aluminium price ratio (World Bank monthly averages, nominal USD, 1960 to the last month).
-- Price question only: the ratio and what the ratio did over the following 6 and 12 months. No demand data is used here.
--
-- Column naming: cu_al_ratio = copper price / aluminium price. *_fwd_6m_* / *_fwd_12m_* look FORWARD from the month in the
-- row (an outcome, never to be used as an input). _logchg / _logret are log changes (statistics), _pct is the simple
-- percent change (charts and labels). The percentile columns use only data BEFORE the month (no look-ahead) and start once
-- 120 months of history exist (1970-01):
--   cu_al_ratio_pctile_all_past   share of all earlier months (since 1960) with a ratio at or below this month's, 0 to 100
--   cu_al_ratio_pctile_past_10y   same, but only against the previous 120 months (adapts to a changed price level)
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS mart_cu_al_ratio;
DROP TABLE IF EXISTS mart_cu_al_rules;
DROP TABLE IF EXISTS mart_cu_al_signal_months;

CREATE TABLE mart_cu_al_ratio AS
WITH base AS (
    SELECT date AS month,
           MAX(CASE WHEN commodity = 'Copper'   THEN value END) AS copper_usd_t_avg,
           MAX(CASE WHEN commodity = 'Aluminum' THEN value END) AS aluminium_usd_t_avg
    FROM stg_wb_prices_monthly
    WHERE commodity IN ('Copper', 'Aluminum')
    GROUP BY date
),
r AS (
    SELECT ROW_NUMBER() OVER (ORDER BY month) AS n, month, copper_usd_t_avg, aluminium_usd_t_avg,
           copper_usd_t_avg / aluminium_usd_t_avg AS cu_al_ratio
    FROM base
    WHERE copper_usd_t_avg IS NOT NULL AND aluminium_usd_t_avg IS NOT NULL
)
SELECT
    r.month,
    r.copper_usd_t_avg,
    r.aluminium_usd_t_avg,
    r.cu_al_ratio,
    CASE WHEN r.n > 120 THEN
        (SELECT COUNT(*) FROM r r2 WHERE r2.n < r.n AND r2.cu_al_ratio <= r.cu_al_ratio) * 100.0 / (r.n - 1) END AS cu_al_ratio_pctile_all_past,
    CASE WHEN r.n > 120 THEN
        (SELECT COUNT(*) FROM r r2 WHERE r2.n < r.n AND r2.n >= r.n - 120 AND r2.cu_al_ratio <= r.cu_al_ratio) * 100.0 / 120 END AS cu_al_ratio_pctile_past_10y,
    LN(LEAD(r.cu_al_ratio, 6)  OVER w / r.cu_al_ratio)                      AS ratio_fwd_6m_logchg,
    (LEAD(r.cu_al_ratio, 6)  OVER w / r.cu_al_ratio - 1) * 100              AS ratio_fwd_6m_pct,
    LN(LEAD(r.cu_al_ratio, 12) OVER w / r.cu_al_ratio)                      AS ratio_fwd_12m_logchg,
    (LEAD(r.cu_al_ratio, 12) OVER w / r.cu_al_ratio - 1) * 100              AS ratio_fwd_12m_pct,
    LN(LEAD(r.copper_usd_t_avg, 6)  OVER w / r.copper_usd_t_avg)            AS copper_fwd_6m_logret,
    LN(LEAD(r.aluminium_usd_t_avg, 6)  OVER w / r.aluminium_usd_t_avg)      AS aluminium_fwd_6m_logret,
    LN(LEAD(r.copper_usd_t_avg, 12) OVER w / r.copper_usd_t_avg)            AS copper_fwd_12m_logret,
    LN(LEAD(r.aluminium_usd_t_avg, 12) OVER w / r.aluminium_usd_t_avg)      AS aluminium_fwd_12m_logret
FROM r
WINDOW w AS (ORDER BY r.n)
ORDER BY r.month;

CREATE UNIQUE INDEX ix_mart_cu_al_ratio_month ON mart_cu_al_ratio(month);

-- The signal rules that readers can compare: a fixed ratio level, or a percentile of the ratio within its own past.
CREATE TABLE mart_cu_al_rules AS
WITH t(rule_type, threshold) AS (
    VALUES ('fixed_ratio', 2.0), ('fixed_ratio', 2.5), ('fixed_ratio', 3.0), ('fixed_ratio', 3.5), ('fixed_ratio', 4.0),
           ('pctile_all_past', 50.0), ('pctile_all_past', 60.0), ('pctile_all_past', 70.0), ('pctile_all_past', 80.0),
           ('pctile_all_past', 90.0), ('pctile_all_past', 95.0),
           ('pctile_past_10y', 50.0), ('pctile_past_10y', 60.0), ('pctile_past_10y', 70.0), ('pctile_past_10y', 80.0),
           ('pctile_past_10y', 90.0), ('pctile_past_10y', 95.0)
)
SELECT ROW_NUMBER() OVER (ORDER BY CASE rule_type WHEN 'fixed_ratio' THEN 1 WHEN 'pctile_all_past' THEN 2 ELSE 3 END, threshold) AS rule_id, rule_type, threshold,
       CASE rule_type WHEN 'fixed_ratio' THEN 'ratio at or above ' || threshold
                      WHEN 'pctile_all_past' THEN 'ratio at or above its ' || CAST(threshold AS INTEGER) || 'th percentile of all earlier months'
                      ELSE 'ratio at or above its ' || CAST(threshold AS INTEGER) || 'th percentile of the previous 10 years' END AS label
FROM t;

-- One row per month, rule and horizon (6 or 12 months), on a common sample: months from 1970-01 (a full 10-year history exists)
-- that also have a known outcome. signal_on = 1 when the rule fires.
-- Episodes: months with the signal on are grouped into one episode when the next signal month comes within `horizon_m`
-- months of the previous one, because the forward windows of such months overlap. Only signal-on months carry an episode_id;
-- is_episode_start marks the first month of each episode.
CREATE TABLE mart_cu_al_signal_months AS
WITH h(horizon_m) AS (VALUES (6), (12)),
n AS (SELECT ROW_NUMBER() OVER (ORDER BY month) AS n, * FROM mart_cu_al_ratio),
base AS (
    SELECT ru.rule_id, ru.rule_type, ru.threshold, h.horizon_m, n.n, n.month,
           CASE ru.rule_type WHEN 'fixed_ratio' THEN n.cu_al_ratio
                             WHEN 'pctile_all_past' THEN n.cu_al_ratio_pctile_all_past
                             ELSE n.cu_al_ratio_pctile_past_10y END AS signal_value,
           CASE h.horizon_m WHEN 6 THEN n.ratio_fwd_6m_logchg ELSE n.ratio_fwd_12m_logchg END AS fwd_ratio_logchg,
           CASE h.horizon_m WHEN 6 THEN n.copper_fwd_6m_logret ELSE n.copper_fwd_12m_logret END AS fwd_copper_logret,
           CASE h.horizon_m WHEN 6 THEN n.aluminium_fwd_6m_logret ELSE n.aluminium_fwd_12m_logret END AS fwd_aluminium_logret
    FROM mart_cu_al_rules ru CROSS JOIN h CROSS JOIN n
    WHERE n.cu_al_ratio_pctile_all_past IS NOT NULL
),
valid AS (
    SELECT *, CASE WHEN signal_value >= threshold THEN 1 ELSE 0 END AS signal_on
    FROM base
    WHERE fwd_ratio_logchg IS NOT NULL AND signal_value IS NOT NULL
),
on_rows AS (
    SELECT rule_id, horizon_m, n,
           CASE WHEN LAG(n) OVER (PARTITION BY rule_id, horizon_m ORDER BY n) IS NULL
                  OR n - LAG(n) OVER (PARTITION BY rule_id, horizon_m ORDER BY n) > horizon_m THEN 1 ELSE 0 END AS is_episode_start
    FROM valid WHERE signal_on = 1
),
ep AS (
    SELECT rule_id, horizon_m, n, is_episode_start,
           SUM(is_episode_start) OVER (PARTITION BY rule_id, horizon_m ORDER BY n) AS episode_id
    FROM on_rows
)
SELECT v.rule_id, v.rule_type, v.threshold, v.horizon_m, v.month, v.signal_value, v.signal_on,
       v.fwd_ratio_logchg, v.fwd_copper_logret, v.fwd_aluminium_logret,
       ep.episode_id, COALESCE(ep.is_episode_start, 0) AS is_episode_start
FROM valid v
LEFT JOIN ep ON ep.rule_id = v.rule_id AND ep.horizon_m = v.horizon_m AND ep.n = v.n
ORDER BY v.rule_id, v.horizon_m, v.month;

CREATE INDEX ix_mart_cu_al_sig ON mart_cu_al_signal_months(rule_id, horizon_m, month);

-- ---------------------------------------------------------------------------------------------------------------------
-- Demand scenario (notebook 03): extra copper per year in 2030 (main year) and 2035 from electric cars and data centres,
-- compared with USGS world mine production for 2025 (estimate). SCENARIO ARITHMETIC, NOT A FORECAST.
--
-- Extra demand is measured against the last observed year: 2025 for cars, 2024 for data centres.
--   EV transition term   = extra EVs x (EV copper - petrol-car copper)          [the headline EV term]
--   Car-market growth    = change in total car sales x petrol-car copper        [shown separately; not an EV effect]
--   Total sales are DERIVED as EV sales / EV share from rounded IEA numbers (+ interpolation for 2030), not read from EV data.
--   Data centres: copper in the capacity built in the target year, minus the copper in the base-year build.
-- Column naming: *_t = tonnes of copper per year; *_kg = kilograms per vehicle; *_gw = gigawatts; _pct_of_mine = percent of 2025e world mine production.
-- ---------------------------------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS mart_scenario_inputs;
DROP TABLE IF EXISTS mart_ev_sales_path;
DROP TABLE IF EXISTS mart_ev_copper_cases;
DROP TABLE IF EXISTS mart_dc_capacity_path;
DROP TABLE IF EXISTS mart_dc_copper_cases;
DROP TABLE IF EXISTS mart_demand_context;
DROP TABLE IF EXISTS mart_demand_headline;
DROP TABLE IF EXISTS mart_demand_sensitivity;
DROP TABLE IF EXISTS mart_demand_assumptions;

-- Copper-content and data-centre inputs, taken from the collected tables (each row keeps its source id). 'mid' is the middle of the
-- source's range, a convenience and not a best estimate.
CREATE TABLE mart_scenario_inputs AS
SELECT 'bev_cu_kg' AS input_id, 'Copper per battery-electric car (mid-size)' AS name, 'kg per car' AS unit,
       copper_kg_low AS low, (copper_kg_low + copper_kg_high) / 2.0 AS mid, copper_kg_high AS high, source_id
FROM copper_intensity_vehicle WHERE vehicle_type = 'Battery electric (BEV)'
UNION ALL SELECT 'phev_cu_kg', 'Copper per plug-in hybrid car', 'kg per car', copper_kg_low, (copper_kg_low + copper_kg_high) / 2.0, copper_kg_high, source_id
FROM copper_intensity_vehicle WHERE vehicle_type = 'Plug-in hybrid (PHEV)'
UNION ALL SELECT 'petrol_midsize_cu_kg', 'Copper per mid-size internal-combustion (petrol or diesel) car', 'kg per car', copper_kg_low, (copper_kg_low + copper_kg_high) / 2.0, copper_kg_high, source_id
FROM copper_intensity_vehicle WHERE vehicle_type = 'Mid-size ICE car'
UNION ALL SELECT 'petrol_compact_cu_kg', 'Copper per compact internal-combustion car', 'kg per car', copper_kg_low, (copper_kg_low + copper_kg_high) / 2.0, copper_kg_high, source_id
FROM copper_intensity_vehicle WHERE vehicle_type = 'Compact ICE car'
UNION ALL SELECT 'petrol_luxury_cu_kg', 'Copper per luxury internal-combustion car', 'kg per car', copper_kg_low, (copper_kg_low + copper_kg_high) / 2.0, copper_kg_high, source_id
FROM copper_intensity_vehicle WHERE vehicle_type = 'Luxury ICE car'
UNION ALL SELECT 'hev_cu_kg', 'Copper per hybrid electric car (not in the IEA EV data; used for a bounding case)', 'kg per car', copper_kg_low, (copper_kg_low + copper_kg_high) / 2.0, copper_kg_high, source_id
FROM copper_intensity_vehicle WHERE vehicle_type = 'Hybrid electric (HEV)'
UNION ALL SELECT 'dc_cu_t_per_mw', 'Copper per MW of data-centre capacity (non-crypto); capacity basis not stated by the source', 't per MW', value_low, (value_low + value_high) / 2.0, value_high, source_id
FROM datacentre_copper_assumptions WHERE metric = 'Copper intensity of non-crypto data centres'
UNION ALL SELECT 'dc_fibre_reduction_t_per_mw', 'Possible reduction in copper per MW from a shift to fibre', 't per MW', value_low, (value_low + value_high) / 2.0, value_high, source_id
FROM datacentre_copper_assumptions WHERE metric LIKE 'Possible reduction in intensity%'
UNION ALL SELECT assumption_id, name, unit, value_low, value_mid, value_high, source_id FROM scenario_assumptions;

-- World electric-car sales (BEV, PHEV), EV share and derived total car sales: 2025 actual and 2035 as published by the IEA for each
-- scenario ('direct'), and 2030 interpolated two ways (linear, constant yearly growth), because the IEA file has no 2030.
-- The IEA rounds to two significant figures, so each endpoint has a rounding half-step; total sales have a min and max from it.
CREATE TABLE mart_ev_sales_path AS
WITH w AS (
    SELECT category, year,
           MAX(CASE WHEN parameter = 'EV sales' AND powertrain = 'BEV'  THEN value END) AS bev,
           MAX(CASE WHEN parameter = 'EV sales' AND powertrain = 'PHEV' THEN value END) AS phev,
           MAX(CASE WHEN parameter = 'EV sales' AND powertrain = 'FCEV' THEN value END) AS fcev,
           MAX(CASE WHEN parameter = 'EV sales' AND powertrain = 'EV'   THEN value END) AS ev,
           MAX(CASE WHEN parameter = 'EV sales share' AND powertrain = 'EV' THEN value END) AS share_pct
    FROM stg_ev_data
    WHERE region_country = 'World' AND mode = 'Cars'
      AND ((category = 'Historical' AND year = 2025) OR (category IN ('Projection-CPS', 'Projection-STEPS') AND year = 2035))
    GROUP BY category, year
),
ends AS (
    SELECT 'CPS' AS iea_scenario, 2025 AS year, bev, phev, fcev, ev, share_pct FROM w WHERE category = 'Historical'
    UNION ALL SELECT 'STEPS', 2025, bev, phev, fcev, ev, share_pct FROM w WHERE category = 'Historical'
    UNION ALL SELECT 'CPS', 2035, bev, phev, fcev, ev, share_pct FROM w WHERE category = 'Projection-CPS'
    UNION ALL SELECT 'STEPS', 2035, bev, phev, fcev, ev, share_pct FROM w WHERE category = 'Projection-STEPS'
),
e AS (
    SELECT *,
           ev - 0.5 * power(10, CAST(log10(ev) AS INTEGER) - 1) AS ev_lo,
           ev + 0.5 * power(10, CAST(log10(ev) AS INTEGER) - 1) AS ev_hi,
           share_pct - 0.5 * power(10, CAST(log10(share_pct) AS INTEGER) - 1) AS share_lo,
           share_pct + 0.5 * power(10, CAST(log10(share_pct) AS INTEGER) - 1) AS share_hi
    FROM ends
),
pts AS (
    SELECT iea_scenario, 'direct' AS path_method, year, bev, phev, fcev, ev, share_pct, ev_lo, ev_hi, share_lo, share_hi, 0 AS is_interpolated FROM e
    UNION ALL
    SELECT a.iea_scenario, 'linear', 2030,
           a.bev + 0.5 * (b.bev - a.bev), a.phev + 0.5 * (b.phev - a.phev), NULL,
           a.ev + 0.5 * (b.ev - a.ev), a.share_pct + 0.5 * (b.share_pct - a.share_pct),
           a.ev_lo + 0.5 * (b.ev_lo - a.ev_lo), a.ev_hi + 0.5 * (b.ev_hi - a.ev_hi),
           a.share_lo + 0.5 * (b.share_lo - a.share_lo), a.share_hi + 0.5 * (b.share_hi - a.share_hi), 1
    FROM e a JOIN e b ON a.iea_scenario = b.iea_scenario AND a.year = 2025 AND b.year = 2035
    UNION ALL
    SELECT a.iea_scenario, 'constant_growth', 2030,
           a.bev * power(b.bev / a.bev, 0.5), a.phev * power(b.phev / a.phev, 0.5), NULL,
           a.ev * power(b.ev / a.ev, 0.5), a.share_pct * power(b.share_pct / a.share_pct, 0.5),
           a.ev_lo * power(b.ev_lo / a.ev_lo, 0.5), a.ev_hi * power(b.ev_hi / a.ev_hi, 0.5),
           a.share_lo * power(b.share_lo / a.share_lo, 0.5), a.share_hi * power(b.share_hi / a.share_hi, 0.5), 1
    FROM e a JOIN e b ON a.iea_scenario = b.iea_scenario AND a.year = 2025 AND b.year = 2035
)
SELECT iea_scenario, path_method, year, is_interpolated, bev, phev, fcev, ev, share_pct, ev_lo, ev_hi, share_lo, share_hi,
       ev / (share_pct / 100.0)    AS total_sales_central,
       ev_lo / (share_hi / 100.0)  AS total_sales_min,
       ev_hi / (share_lo / 100.0)  AS total_sales_max,
       ev / (share_pct / 100.0) - (bev + phev) AS non_ev_sales_central
FROM pts
ORDER BY iea_scenario, year, path_method;

-- EV copper cases: every combination of scenario, year/path, copper per BEV, per PHEV, per petrol car, and rounding case for total sales.
-- growth_case: 'central' uses the published numbers; 'min' / 'max' take the lowest / highest growth in total sales the IEA rounding allows.
-- transition_t = (extra BEV x (BEV kg - petrol kg) + extra PHEV x (PHEV kg - petrol kg)) / 1000
-- market_growth_t = change in total sales x petrol kg / 1000
-- transition_all_evs_t counts every EV sold in the target year (not only the extra ones); reference only.
CREATE TABLE mart_ev_copper_cases AS
WITH base AS (
    SELECT iea_scenario, bev, phev, total_sales_central AS t_c, total_sales_min AS t_min, total_sales_max AS t_max
    FROM mart_ev_sales_path WHERE year = 2025
),
tgt AS (SELECT * FROM mart_ev_sales_path WHERE year IN (2030, 2035)),
bevc AS (
    SELECT 'low' AS bev_case, low AS bev_kg FROM mart_scenario_inputs WHERE input_id = 'bev_cu_kg'
    UNION ALL SELECT 'mid', mid FROM mart_scenario_inputs WHERE input_id = 'bev_cu_kg'
    UNION ALL SELECT 'high', high FROM mart_scenario_inputs WHERE input_id = 'bev_cu_kg'
),
phevc AS (
    SELECT 'low' AS phev_case, low AS phev_kg FROM mart_scenario_inputs WHERE input_id = 'phev_cu_kg'
    UNION ALL SELECT 'mid', mid FROM mart_scenario_inputs WHERE input_id = 'phev_cu_kg'
    UNION ALL SELECT 'high', high FROM mart_scenario_inputs WHERE input_id = 'phev_cu_kg'
),
petc AS (
    SELECT 'midsize_low' AS petrol_case, low AS petrol_kg FROM mart_scenario_inputs WHERE input_id = 'petrol_midsize_cu_kg'
    UNION ALL SELECT 'midsize_mid', mid FROM mart_scenario_inputs WHERE input_id = 'petrol_midsize_cu_kg'
    UNION ALL SELECT 'midsize_high', high FROM mart_scenario_inputs WHERE input_id = 'petrol_midsize_cu_kg'
    UNION ALL SELECT 'compact_mid', mid FROM mart_scenario_inputs WHERE input_id = 'petrol_compact_cu_kg'
    UNION ALL SELECT 'luxury_mid', mid FROM mart_scenario_inputs WHERE input_id = 'petrol_luxury_cu_kg'
    UNION ALL SELECT 'hybrid_bound_mid', mid FROM mart_scenario_inputs WHERE input_id = 'hev_cu_kg'
),
gr(growth_case) AS (VALUES ('central'), ('min'), ('max')),
j AS (
    SELECT t.iea_scenario, t.year, t.path_method, t.is_interpolated, bevc.bev_case, bevc.bev_kg, phevc.phev_case, phevc.phev_kg,
           petc.petrol_case, petc.petrol_kg, gr.growth_case,
           t.bev - b.bev AS extra_bev, t.phev - b.phev AS extra_phev,
           CASE gr.growth_case WHEN 'central' THEN t.total_sales_central - b.t_c
                               WHEN 'min' THEN t.total_sales_min - b.t_max
                               ELSE t.total_sales_max - b.t_min END AS delta_total_sales,
           t.bev AS bev_target, t.phev AS phev_target
    FROM tgt t JOIN base b ON b.iea_scenario = t.iea_scenario
    CROSS JOIN bevc CROSS JOIN phevc CROSS JOIN petc CROSS JOIN gr
)
SELECT iea_scenario, year, path_method, is_interpolated, bev_case, bev_kg, phev_case, phev_kg, petrol_case, petrol_kg, growth_case,
       extra_bev, extra_phev, delta_total_sales,
       (extra_bev * (bev_kg - petrol_kg) + extra_phev * (phev_kg - petrol_kg)) / 1000.0 AS transition_t,
       delta_total_sales * petrol_kg / 1000.0 AS market_growth_t,
       (extra_bev * (bev_kg - petrol_kg) + extra_phev * (phev_kg - petrol_kg)) / 1000.0 + delta_total_sales * petrol_kg / 1000.0 AS combined_new_car_copper_change_t,
       (bev_target * (bev_kg - petrol_kg) + phev_target * (phev_kg - petrol_kg)) / 1000.0 AS transition_all_evs_t
FROM j;

CREATE INDEX ix_mart_ev_cases ON mart_ev_copper_cases(iea_scenario, year, path_method, bev_case, phev_case, petrol_case, growth_case);

-- Data-centre capacity added between 2024 and the target year (2030 main, 2035 exploratory) for each IEA case, and the build in the target
-- year under two paths: 'even' (the same GW added every year) and 'constant_growth' (additions grow at a fixed yearly rate, with the first
-- year solved so the total matches). Base-year builds: the 2023 to 2024 addition, and the 2020 to 2024 yearly average.
CREATE TABLE mart_dc_capacity_path AS
WITH est AS (
    SELECT basis,
           MAX(CASE WHEN year = 2020 THEN capacity_gw END) AS c2020,
           MAX(CASE WHEN year = 2023 THEN capacity_gw END) AS c2023,
           MAX(CASE WHEN year = 2024 THEN capacity_gw END) AS c2024
    FROM stg_datacentre_capacity_scenarios WHERE iea_case = 'Estimate' GROUP BY basis
),
g AS (SELECT mid / 100.0 AS g FROM mart_scenario_inputs WHERE input_id = 'dc_build_growth_pct'),
paths(path) AS (VALUES ('even'), ('constant_growth')),
t AS (
    SELECT s.iea_case, s.basis, s.year, s.capacity_gw AS capacity_target_gw, s.is_exploratory, e.c2020, e.c2023, e.c2024,
           s.year - 2024 AS n_years, s.capacity_gw - e.c2024 AS additions_total_gw
    FROM stg_datacentre_capacity_scenarios s JOIN est e ON e.basis = s.basis
    WHERE s.iea_case <> 'Estimate'
)
SELECT t.iea_case, t.basis, t.year, t.is_exploratory, p.path,
       t.c2024 AS capacity_2024_gw, t.capacity_target_gw, t.additions_total_gw, t.n_years,
       CASE p.path WHEN 'even' THEN t.additions_total_gw / t.n_years
                   ELSE t.additions_total_gw / ((power(1 + g.g, t.n_years) - 1) / g.g) * power(1 + g.g, t.n_years - 1) END AS build_in_target_year_gw,
       CASE p.path WHEN 'even' THEN t.additions_total_gw / t.n_years
                   ELSE t.additions_total_gw / ((power(1 + g.g, t.n_years) - 1) / g.g) END AS build_first_year_gw,
       t.c2024 - t.c2023 AS base_build_2023_24_gw,
       (t.c2024 - t.c2020) / 4.0 AS base_build_2020_24_avg_gw,
       g.g AS growth_rate
FROM t CROSS JOIN paths p CROSS JOIN g;

-- Data-centre copper cases: path x copper per MW x base-year build. extra_vs_base_t can be NEGATIVE when the build in the target year is
-- slower than the base-year build; the note column says so. That is a slower build, not negative demand: new_capacity_copper_t is always positive.
CREATE TABLE mart_dc_copper_cases AS
WITH ic AS (
    SELECT 'low' AS intensity_case, low AS t_per_mw FROM mart_scenario_inputs WHERE input_id = 'dc_cu_t_per_mw'
    UNION ALL SELECT 'mid', mid FROM mart_scenario_inputs WHERE input_id = 'dc_cu_t_per_mw'
    UNION ALL SELECT 'high', high FROM mart_scenario_inputs WHERE input_id = 'dc_cu_t_per_mw'
    UNION ALL SELECT 'fibre_shift', (SELECT mid FROM mart_scenario_inputs WHERE input_id = 'dc_cu_t_per_mw')
                                   - (SELECT mid FROM mart_scenario_inputs WHERE input_id = 'dc_fibre_reduction_t_per_mw')
),
bb(base_build_case) AS (VALUES ('2023-24'), ('2020-24 average')),
x AS (
    SELECT p.iea_case, p.basis, p.year, p.is_exploratory, p.path, ic.intensity_case, ic.t_per_mw, bb.base_build_case,
           p.build_in_target_year_gw, p.additions_total_gw,
           CASE bb.base_build_case WHEN '2023-24' THEN p.base_build_2023_24_gw ELSE p.base_build_2020_24_avg_gw END AS base_build_gw
    FROM mart_dc_capacity_path p CROSS JOIN ic CROSS JOIN bb
)
SELECT iea_case, basis, year, is_exploratory, path, intensity_case, t_per_mw, base_build_case, build_in_target_year_gw, base_build_gw,
       build_in_target_year_gw * 1000.0 * t_per_mw AS new_capacity_copper_t,
       base_build_gw * 1000.0 * t_per_mw AS base_year_copper_t,
       (build_in_target_year_gw - base_build_gw) * 1000.0 * t_per_mw AS extra_vs_base_t,
       additions_total_gw * 1000.0 * t_per_mw AS cumulative_additions_copper_t,
       CASE WHEN build_in_target_year_gw < base_build_gw
            THEN 'The yearly build in this case is slower than the base-year build, so less copper goes into new capacity each year than in the base year. This is a slower build, not negative demand.'
       END AS note
FROM x;

CREATE INDEX ix_mart_dc_cases ON mart_dc_copper_cases(iea_case, year, path, basis, intensity_case, base_build_case);

-- Context: USGS world output (the comparison base) and the S13 figures used only as an outside reference.
CREATE TABLE mart_demand_context AS
SELECT 'world_mine_production_2025e_t' AS metric, value * 1000.0 AS value, 't' AS unit, source_id,
       'USGS world mine production, 2025 estimate (the base for every percentage)' AS note
FROM stg_usgs_copper WHERE statistic_detail = 'Mine production: rounded' AND country = 'World total' AND year = 2025
UNION ALL SELECT 'world_mine_production_2024_t', value * 1000.0, 't', source_id, 'USGS world mine production, 2024'
FROM stg_usgs_copper WHERE statistic_detail = 'Mine production: rounded' AND country = 'World total' AND year = 2024
UNION ALL SELECT 'world_refinery_production_2025e_t', value * 1000.0, 't', source_id, 'USGS world refinery production, 2025 estimate (primary and secondary)'
FROM stg_usgs_copper WHERE statistic_detail = 'Refinery production: rounded' AND country = 'World total' AND year = 2025
UNION ALL SELECT 's13_dc_copper_demand_2025_t', value_low * 1000000.0, 't', source_id,
       'S13 as reported (secondary, low reliability): data-centre copper demand 2025; not reconciled with the model (known issue K02)'
FROM datacentre_copper_assumptions WHERE metric = 'Copper demand from data centres' AND year = 2025
UNION ALL SELECT 's13_dc_copper_demand_2040_low_t', value_low * 1000000.0, 't', source_id, 'S13 as reported: data-centre copper demand per year in 2040 (a forecast, low end)'
FROM datacentre_copper_assumptions WHERE metric = 'Copper demand from data centres' AND year = 2040
UNION ALL SELECT 's13_dc_copper_demand_2040_high_t', value_high * 1000000.0, 't', source_id, 'S13 as reported: data-centre copper demand per year in 2040 (a forecast, high end)'
FROM datacentre_copper_assumptions WHERE metric = 'Copper demand from data centres' AND year = 2040
UNION ALL SELECT 'model_dc_build_2024_copper_low_t', p.base_build_2023_24_gw * 1000.0 * (SELECT low FROM mart_scenario_inputs WHERE input_id = 'dc_cu_t_per_mw'), 't', 'S13',
       'Model: 2023 to 2024 build (total capacity, S15) x low copper per MW (S13)'
FROM mart_dc_capacity_path p WHERE p.iea_case = 'Base' AND p.year = 2030 AND p.path = 'even' AND p.basis = 'Whole data centre'
UNION ALL SELECT 'model_dc_build_2024_copper_high_t', p.base_build_2023_24_gw * 1000.0 * (SELECT high FROM mart_scenario_inputs WHERE input_id = 'dc_cu_t_per_mw'), 't', 'S13',
       'Model: 2023 to 2024 build (total capacity, S15) x high copper per MW (S13)'
FROM mart_dc_capacity_path p WHERE p.iea_case = 'Base' AND p.year = 2030 AND p.path = 'even' AND p.basis = 'Whole data centre';

-- Headline table: every component for 2030 (main year; EV paths linear and constant growth) and 2035 (direct from the IEA for EVs;
-- exploratory for data centres), with a source-range low, mid and high and the percent of 2025e world mine production.
-- Low and high combine the source ranges so that the component is smallest or largest:
--   EV transition: low = lowest BEV and PHEV copper with the highest petrol-car copper; high = the reverse.
--   Car-market growth: low = lowest growth the IEA rounding allows with the lowest petrol-car copper; high = the reverse.
--   Data centres: low and high are the smaller and larger of the results at 30 and 40 t/MW (the order can flip when the extra is negative).
CREATE TABLE mart_demand_headline AS
WITH mine AS (SELECT value AS mine_t FROM mart_demand_context WHERE metric = 'world_mine_production_2025e_t'),
ev AS (
    SELECT iea_scenario, year, path_method, is_interpolated,
           MIN(CASE WHEN bev_case = 'low'  AND phev_case = 'low'  AND petrol_case = 'midsize_high' AND growth_case = 'central' THEN transition_t END) AS tr_low,
           MIN(CASE WHEN bev_case = 'mid'  AND phev_case = 'mid'  AND petrol_case = 'midsize_mid'  AND growth_case = 'central' THEN transition_t END) AS tr_mid,
           MIN(CASE WHEN bev_case = 'high' AND phev_case = 'high' AND petrol_case = 'midsize_low'  AND growth_case = 'central' THEN transition_t END) AS tr_high,
           MIN(CASE WHEN bev_case = 'mid' AND phev_case = 'mid' AND petrol_case = 'midsize_low'  AND growth_case = 'min' THEN market_growth_t END) AS mg_low,
           MIN(CASE WHEN bev_case = 'mid' AND phev_case = 'mid' AND petrol_case = 'midsize_mid'  AND growth_case = 'central' THEN market_growth_t END) AS mg_mid,
           MIN(CASE WHEN bev_case = 'mid' AND phev_case = 'mid' AND petrol_case = 'midsize_high' AND growth_case = 'max' THEN market_growth_t END) AS mg_high
    FROM mart_ev_copper_cases GROUP BY iea_scenario, year, path_method, is_interpolated
),
dc AS (
    SELECT iea_case, basis, year, is_exploratory, path,
           MIN(CASE WHEN intensity_case IN ('low', 'high') AND base_build_case = '2023-24' THEN extra_vs_base_t END) AS ex_low,
           MIN(CASE WHEN intensity_case = 'mid' AND base_build_case = '2023-24' THEN extra_vs_base_t END) AS ex_mid,
           MAX(CASE WHEN intensity_case IN ('low', 'high') AND base_build_case = '2023-24' THEN extra_vs_base_t END) AS ex_high,
           MIN(CASE WHEN intensity_case IN ('low', 'high') AND base_build_case = '2023-24' THEN new_capacity_copper_t END) AS nc_low,
           MIN(CASE WHEN intensity_case = 'mid' AND base_build_case = '2023-24' THEN new_capacity_copper_t END) AS nc_mid,
           MAX(CASE WHEN intensity_case IN ('low', 'high') AND base_build_case = '2023-24' THEN new_capacity_copper_t END) AS nc_high
    FROM mart_dc_copper_cases GROUP BY iea_case, basis, year, is_exploratory, path
),
rows_ AS (
    SELECT 'ev_transition' AS component_id, 'EV transition: extra EVs x (EV copper - petrol-car copper)' AS component, year, iea_scenario AS variant,
           path_method, 'cars only' AS basis, is_interpolated, 0 AS is_exploratory, tr_low AS low_t, tr_mid AS mid_t, tr_high AS high_t FROM ev
    UNION ALL
    SELECT 'car_market_growth', 'Car-market growth: change in total car sales x petrol-car copper (derived from rounded EV shares; not an EV effect)', year, iea_scenario,
           path_method, 'cars only', is_interpolated, 0, mg_low, mg_mid, mg_high FROM ev
    UNION ALL
    SELECT 'dc_extra_vs_base_year_build', 'Data centres: copper in the build of the target year minus the base-year build', year, iea_case,
           path, basis, 0, is_exploratory, ex_low, ex_mid, ex_high FROM dc
    UNION ALL
    SELECT 'dc_new_capacity', 'Data centres: copper in the capacity built in the target year (gross)', year, iea_case,
           path, basis, 0, is_exploratory, nc_low, nc_mid, nc_high FROM dc
)
SELECT r.component_id, r.component, r.year, r.variant, r.path_method, r.basis, r.is_interpolated, r.is_exploratory,
       r.low_t, r.mid_t, r.high_t,
       r.low_t / m.mine_t * 100.0 AS low_pct_of_mine, r.mid_t / m.mine_t * 100.0 AS mid_pct_of_mine, r.high_t / m.mine_t * 100.0 AS high_pct_of_mine,
       CASE WHEN r.component_id = 'dc_extra_vs_base_year_build' AND r.low_t < 0
            THEN 'A negative number means the yearly build in this case is slower than the base-year build, so less copper goes into new capacity each year than in the base year. It is a slower build, not negative demand.'
            WHEN r.component_id = 'car_market_growth' THEN 'Total sales are derived as EV sales / EV share from rounded IEA numbers (plus interpolation for 2030). The band is the IEA rounding.'
            WHEN r.is_interpolated = 1 THEN 'EV sales for 2030 are interpolated between the 2025 actuals and the IEA 2035 scenario.'
            WHEN r.is_exploratory = 1 THEN 'The IEA marks 2035 data-centre values as exploratory.' END AS note
FROM rows_ r CROSS JOIN mine m;

-- Sensitivity (tornado): the headline total in 2030 = EV transition + data-centre extra over the base-year build (in the notebook this is labelled
-- 'the two effects together, on their own baselines': EV against 2025, data centres against the 2024 build), as a percent of 2025e
-- world mine production. One assumption changes at a time from a reference case that is a CONVENIENCE CHOICE, not the most likely case:
-- CPS scenario, linear 2030 path, mid copper per BEV, PHEV and petrol car, Base Case data centres, even build, total capacity, mid t/MW,
-- 2023-24 base-year build. Car-market growth is not part of this total; its rounding band is in column market_growth_t.
CREATE TABLE mart_demand_sensitivity AS
WITH ref AS (
    SELECT 'CPS' AS ev_scenario, 'linear' AS ev_path, 'mid' AS bev_case, 'mid' AS phev_case, 'midsize_mid' AS petrol_case, 'central' AS growth_case,
           'Base' AS dc_case, 'even' AS dc_path, 'Whole data centre' AS dc_basis, 'mid' AS dc_intensity, '2023-24' AS dc_base_build
),
alt(bar_order, bar, alt_label, ev_scenario, ev_path, bev_case, phev_case, petrol_case, growth_case, dc_case, dc_path, dc_basis, dc_intensity, dc_base_build) AS (
    VALUES
    (0, 'Reference case', 'Reference case', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (1, 'IEA EV scenario (CPS or STEPS)', 'STEPS', 'STEPS', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (2, '2030 EV path (straight line or constant growth)', 'constant growth', NULL, 'constant_growth', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (3, 'Copper per battery-electric car (82-91 kg)', '82 kg', NULL, NULL, 'low', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (3, 'Copper per battery-electric car (82-91 kg)', '91 kg', NULL, NULL, 'high', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (4, 'Copper per plug-in hybrid car (59-68 kg)', '59 kg', NULL, NULL, NULL, 'low', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (4, 'Copper per plug-in hybrid car (59-68 kg)', '68 kg', NULL, NULL, NULL, 'high', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (5, 'Copper in the petrol car replaced, mid-size (18-22 kg)', '22 kg', NULL, NULL, NULL, NULL, 'midsize_high', NULL, NULL, NULL, NULL, NULL, NULL),
    (5, 'Copper in the petrol car replaced, mid-size (18-22 kg)', '18 kg', NULL, NULL, NULL, NULL, 'midsize_low', NULL, NULL, NULL, NULL, NULL, NULL),
    (6, 'Size of the petrol car replaced (compact 8-10 kg, luxury 25-30 kg)', 'compact, 9 kg', NULL, NULL, NULL, NULL, 'compact_mid', NULL, NULL, NULL, NULL, NULL, NULL),
    (6, 'Size of the petrol car replaced (compact 8-10 kg, luxury 25-30 kg)', 'luxury, 27.5 kg', NULL, NULL, NULL, NULL, 'luxury_mid', NULL, NULL, NULL, NULL, NULL, NULL),
    (7, 'Bounding case: all non-EV cars treated as hybrids (39-45 kg)', 'hybrids, 42 kg', NULL, NULL, NULL, NULL, 'hybrid_bound_mid', NULL, NULL, NULL, NULL, NULL, NULL),
    (8, 'Data-centre IEA case', 'Headwinds', NULL, NULL, NULL, NULL, NULL, NULL, 'Headwinds', NULL, NULL, NULL, NULL),
    (8, 'Data-centre IEA case', 'High Efficiency', NULL, NULL, NULL, NULL, NULL, NULL, 'High Efficiency', NULL, NULL, NULL, NULL),
    (8, 'Data-centre IEA case', 'Lift-Off', NULL, NULL, NULL, NULL, NULL, NULL, 'Lift-Off', NULL, NULL, NULL, NULL),
    (9, 'Data-centre build path (even or constant growth)', 'constant growth', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'constant_growth', NULL, NULL, NULL),
    (10, 'Copper per MW (30-40 t/MW)', '30 t/MW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'low', NULL),
    (10, 'Copper per MW (30-40 t/MW)', '40 t/MW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'high', NULL),
    (10, 'Copper per MW (30-40 t/MW)', 'fibre shift, 30.5 t/MW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'fibre_shift', NULL),
    (11, 'Capacity basis (total or IT capacity)', 'IT capacity', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'IT equipment', NULL, NULL),
    (12, 'Base-year build subtracted (2023-24 or 2020-24 average)', '2020-24 average, 9.25 GW', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2020-24 average'),
    (13, 'Rounding of IEA EV sales and shares (car-market growth only)', 'least growth', NULL, NULL, NULL, NULL, NULL, 'min', NULL, NULL, NULL, NULL, NULL),
    (13, 'Rounding of IEA EV sales and shares (car-market growth only)', 'most growth', NULL, NULL, NULL, NULL, NULL, 'max', NULL, NULL, NULL, NULL, NULL)
),
p AS (
    SELECT a.bar_order, a.bar, a.alt_label,
           COALESCE(a.ev_scenario, r.ev_scenario) AS ev_scenario, COALESCE(a.ev_path, r.ev_path) AS ev_path,
           COALESCE(a.bev_case, r.bev_case) AS bev_case, COALESCE(a.phev_case, r.phev_case) AS phev_case,
           COALESCE(a.petrol_case, r.petrol_case) AS petrol_case, COALESCE(a.growth_case, r.growth_case) AS growth_case,
           COALESCE(a.dc_case, r.dc_case) AS dc_case, COALESCE(a.dc_path, r.dc_path) AS dc_path, COALESCE(a.dc_basis, r.dc_basis) AS dc_basis,
           COALESCE(a.dc_intensity, r.dc_intensity) AS dc_intensity, COALESCE(a.dc_base_build, r.dc_base_build) AS dc_base_build
    FROM alt a CROSS JOIN ref r
),
mine AS (SELECT value AS mine_t FROM mart_demand_context WHERE metric = 'world_mine_production_2025e_t'),
res AS (
    SELECT p.*, ev.transition_t AS ev_transition_t, ev.market_growth_t AS market_growth_t,
           dc.extra_vs_base_t AS dc_extra_vs_base_t, dc.new_capacity_copper_t AS dc_new_capacity_t, dc.note AS dc_note,
           ev.transition_t + dc.extra_vs_base_t AS headline_total_t
    FROM p
    JOIN mart_ev_copper_cases ev ON ev.iea_scenario = p.ev_scenario AND ev.year = 2030 AND ev.path_method = p.ev_path
         AND ev.bev_case = p.bev_case AND ev.phev_case = p.phev_case AND ev.petrol_case = p.petrol_case AND ev.growth_case = p.growth_case
    JOIN mart_dc_copper_cases dc ON dc.iea_case = p.dc_case AND dc.year = 2030 AND dc.path = p.dc_path AND dc.basis = p.dc_basis
         AND dc.intensity_case = p.dc_intensity AND dc.base_build_case = p.dc_base_build
)
SELECT res.bar_order, res.bar, res.alt_label, res.ev_transition_t, res.market_growth_t, res.dc_extra_vs_base_t, res.dc_new_capacity_t,
       res.headline_total_t, res.headline_total_t / m.mine_t * 100.0 AS headline_total_pct_of_mine,
       res.headline_total_t - (SELECT headline_total_t FROM res WHERE bar_order = 0) AS change_vs_reference_t,
       res.dc_note AS note
FROM res CROSS JOIN mine m
ORDER BY res.bar_order, res.headline_total_t;

-- Assumption register for the notebook: every input with its range, source and the reliability recorded in the sources register.
CREATE TABLE mart_demand_assumptions AS
SELECT i.input_id, i.name, i.unit, i.low, i.mid, i.high, i.source_id, s.reliability,
       CASE WHEN s.source_type = 'assumption' THEN 'project assumption' ELSE 'source range (mid = middle of the range)' END AS kind
FROM mart_scenario_inputs i JOIN sources s ON s.source_id = i.source_id
UNION ALL
SELECT 'ev_bev_sales_2025', 'World BEV car sales 2025 (IEA, rounded to 2 significant figures)', 'cars', bev - 0.5 * power(10, CAST(log10(bev) AS INTEGER) - 1), bev,
       bev + 0.5 * power(10, CAST(log10(bev) AS INTEGER) - 1), 'S05', (SELECT reliability FROM sources WHERE source_id = 'S05'), 'data (IEA)'
FROM mart_ev_sales_path WHERE iea_scenario = 'CPS' AND year = 2025
UNION ALL
SELECT 'ev_phev_sales_2025', 'World PHEV car sales 2025 (IEA, rounded)', 'cars', phev - 0.5 * power(10, CAST(log10(phev) AS INTEGER) - 1), phev,
       phev + 0.5 * power(10, CAST(log10(phev) AS INTEGER) - 1), 'S05', (SELECT reliability FROM sources WHERE source_id = 'S05'), 'data (IEA)'
FROM mart_ev_sales_path WHERE iea_scenario = 'CPS' AND year = 2025
UNION ALL
SELECT 'ev_share_2025_pct', 'EV share of world car sales 2025 (IEA, whole percent)', 'percent', share_lo, share_pct, share_hi, 'S05',
       (SELECT reliability FROM sources WHERE source_id = 'S05'), 'data (IEA)'
FROM mart_ev_sales_path WHERE iea_scenario = 'CPS' AND year = 2025 AND path_method = 'direct'
UNION ALL
SELECT 'ev_ev_sales_2035_' || lower(iea_scenario), 'World EV car sales 2035, IEA ' || iea_scenario || ' scenario (rounded)', 'cars', ev_lo, ev, ev_hi, 'S05',
       (SELECT reliability FROM sources WHERE source_id = 'S05'), 'data (IEA exploratory scenario)'
FROM mart_ev_sales_path WHERE year = 2035
UNION ALL
SELECT 'dc_capacity_2024_total', 'World installed data-centre capacity 2024 (total)', 'GW', capacity_gw, capacity_gw, capacity_gw, 'S15',
       (SELECT reliability FROM sources WHERE source_id = 'S15'), 'data (IEA estimate)'
FROM stg_datacentre_capacity_scenarios WHERE iea_case = 'Estimate' AND year = 2024 AND basis = 'Whole data centre'
UNION ALL
SELECT 'dc_capacity_2030_' || lower(replace(iea_case, ' ', '_')), 'World installed data-centre capacity 2030, IEA ' || iea_case || ' case (total)', 'GW', capacity_gw, capacity_gw, capacity_gw, 'S15',
       (SELECT reliability FROM sources WHERE source_id = 'S15'), 'data (IEA scenario)'
FROM stg_datacentre_capacity_scenarios WHERE year = 2030 AND basis = 'Whole data centre'
UNION ALL
SELECT 'world_mine_production_2025e', 'World mine production 2025 estimate (the base for every percentage)', 't', value, value, value, source_id,
       (SELECT reliability FROM sources WHERE source_id = 'S06'), 'data (USGS estimate)'
FROM mart_demand_context WHERE metric = 'world_mine_production_2025e_t';
