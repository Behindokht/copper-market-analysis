-- 01b_staging_lme.sql
-- LME staging. Run only when the licensed LME export files are present (build_db.py checks).

-- LME copper daily. The raw table holds every data line of the 28 export files as text, including the yearly 'Averages'
-- summary line of each file. Rows count only if the date looks like '31 Dec 1998' with a known month, which drops the summary lines.
-- A price cell of '-' or empty becomes NULL (so does any non-numeric cell). If a date appears twice, the last loaded line is kept.
DROP TABLE IF EXISTS stg_lme_copper_daily;
CREATE TABLE stg_lme_copper_daily AS
WITH parsed AS (
    SELECT rowid AS raw_rowid, *,
           CASE substr("Date", 4, 3) WHEN 'Jan' THEN '01' WHEN 'Feb' THEN '02' WHEN 'Mar' THEN '03' WHEN 'Apr' THEN '04'
                WHEN 'May' THEN '05' WHEN 'Jun' THEN '06' WHEN 'Jul' THEN '07' WHEN 'Aug' THEN '08'
                WHEN 'Sep' THEN '09' WHEN 'Oct' THEN '10' WHEN 'Nov' THEN '11' WHEN 'Dec' THEN '12' END AS mm
    FROM raw_lme_copper_daily
    WHERE "Date" GLOB '[0-3][0-9] [A-Z][a-z][a-z] [1-2][0-9][0-9][0-9]'
),
dated AS (
    SELECT *, substr("Date", 8, 4) || '-' || mm || '-' || substr("Date", 1, 2) AS trade_date
    FROM parsed WHERE mm IS NOT NULL
)
SELECT
    trade_date AS date,
    CASE WHEN "Cash" GLOB '*[0-9]*' AND "Cash" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("Cash" AS REAL) END AS cash_usd_t,
    CASE WHEN "Cash UnOfficial" GLOB '*[0-9]*' AND "Cash UnOfficial" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("Cash UnOfficial" AS REAL) END AS cash_unofficial_usd_t,
    CASE WHEN "3 Month" GLOB '*[0-9]*' AND "3 Month" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("3 Month" AS REAL) END AS three_month_usd_t,
    CASE WHEN "3 Month Unofficial" GLOB '*[0-9]*' AND "3 Month Unofficial" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("3 Month Unofficial" AS REAL) END AS three_month_unofficial_usd_t,
    CASE WHEN "15 Month" GLOB '*[0-9]*' AND "15 Month" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("15 Month" AS REAL) END AS fifteen_month_usd_t,
    CASE WHEN "DEC_1" GLOB '*[0-9]*' AND "DEC_1" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("DEC_1" AS REAL) END AS dec_1_usd_t,
    CASE WHEN "DEC_2" GLOB '*[0-9]*' AND "DEC_2" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("DEC_2" AS REAL) END AS dec_2_usd_t,
    CASE WHEN "DEC_3" GLOB '*[0-9]*' AND "DEC_3" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("DEC_3" AS REAL) END AS dec_3_usd_t,
    CASE WHEN "Inventory" GLOB '*[0-9]*' AND "Inventory" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("Inventory" AS REAL) END AS inventory_t,
    CASE WHEN "Volume" GLOB '*[0-9]*' AND "Volume" NOT GLOB '*[^0-9.eE+-]*' THEN CAST("Volume" AS REAL) END AS volume_as_exported,
    source_id,
    source_file
FROM dated
WHERE raw_rowid IN (SELECT MAX(raw_rowid) FROM dated GROUP BY trade_date)
ORDER BY trade_date;

CREATE UNIQUE INDEX ix_stg_lme_date ON stg_lme_copper_daily(date);
