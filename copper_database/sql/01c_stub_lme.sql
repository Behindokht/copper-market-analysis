-- 01c_stub_lme.sql
-- Used instead of 01b when the licensed LME files are NOT in this copy of the project (they are never published).
-- An empty stand-in with the same columns, so the marts still build; every LME column in the panel stays empty,
-- and the checks that need LME data are skipped (they carry requires=lme_data in 03_checks.sql).
DROP TABLE IF EXISTS stg_lme_copper_daily;
CREATE TABLE stg_lme_copper_daily (
    date TEXT, cash_usd_t REAL, cash_unofficial_usd_t REAL, three_month_usd_t REAL, three_month_unofficial_usd_t REAL,
    fifteen_month_usd_t REAL, dec_1_usd_t REAL, dec_2_usd_t REAL, dec_3_usd_t REAL, inventory_t REAL, volume_as_exported REAL,
    source_id TEXT, source_file TEXT
);
