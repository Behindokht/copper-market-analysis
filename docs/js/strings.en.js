// All text on the site lives in this file (English). Add strings.xx.js with the same keys for another language.
// Numbers never appear here: they are filled in from the data files, using {placeholders}.
// Style: plain English, short sentences, hard figures, no dashes as punctuation. tools/check_site.py enforces the basics.
window.CMA_STRINGS = {
 "site": {
  "brand": "Copper market analysis",
  "title": "Copper market analysis"
 },
 "nav": {
  "story": "Story",
  "dollar": "Dollar vs copper",
  "ratio": "Copper vs aluminium",
  "demand": "Demand scenario",
  "quality": "Data quality"
 },
 "hero": {
  "title": "Copper: who needs it, who supplies it, and what does the price do when they collide?",
  "lead": "A look at the copper market, with the data checks in plain view. Start with two guesses. Then see the numbers.",
  "byline": "A portfolio project by Behindokht Alipour"
 },
 "pages": {
  "dollar": {
   "eyebrow": "Dollar vs copper",
   "title": "Does copper get cheaper when the US dollar gets stronger?"
  },
  "ratio": {
   "eyebrow": "Copper vs aluminium",
   "title": "Does a high copper-to-aluminium price ratio say anything about the next year?"
  },
  "demand": {
   "eyebrow": "Demand scenario",
   "title": "How much extra copper could electric cars and data centres need by 2030?"
  },
  "quality": {
   "eyebrow": "Data quality",
   "title": "Can you trust these numbers? The checks and the sources"
  },
  "placeholder": "This page comes next."
 },
 "story": {
  "eyebrow": "Story",
  "title": "How well do you already know copper's price?",
  "intro": "Guess first, then see the numbers. Each guess takes a few seconds. Nothing you enter leaves your browser.",
  "reset": "Clear my guesses",
  "guess1": {
   "title": "Guess 1",
   "question": "How much of copper's monthly ups and downs is linked to the US dollar?",
   "hint": "The left end is none of the moves. The right end is all of them. Drag the slider, then lock in your guess.",
   "slider_label": "Your guess, in percent",
   "lock": "Lock in my guess",
   "change": "Change my guess",
   "reveal_title": "What the numbers say",
   "big_caption": "The broad US dollar index tracks about {r2}% of copper's monthly moves. That covers {months} months, from {from} to {to}. The euro alone tracks about {r2_euro}%.",
   "verdict_close": "You guessed {guess}%. The answer is {actual}%. That is close.",
   "verdict_high": "You guessed {guess}%. The answer is {actual}%. Your guess is higher.",
   "verdict_low": "You guessed {guess}%. The answer is {actual}%. Your guess is lower.",
   "direction": "Direction is easier to guess than size. In about {in_ten} of every 10 months, copper and the dollar index moved in opposite directions ({opposite} of {months}). When the dollar index rose, copper fell in {fell_share}% of {rose_months} months. When it fell, copper rose in {rose_share}% of {fell_months} months.",
   "unchanged_one": "One month does not count either way. Copper's monthly average did not change in it.",
   "unchanged_many": "{unchanged} months do not count either way. A monthly average did not change in them.",
   "caveat": "This is a link in one sample. It is not proof of cause. Copper and the dollar index moved in opposite directions. That does not mean one made the other move.",
   "definition": "The share is the R squared from a simple regression of copper's monthly change on the dollar index's monthly change. It is a statistical share, not a cause.",
   "meter_you": "You: {value}%",
   "meter_dollar": "Broad dollar index: {value}%",
   "meter_euro": "Euro alone: {value}%",
   "meter_none": "none of the moves",
   "meter_all": "all of the moves",
   "meter_aria": "Scale from none to all of copper's monthly moves. Your guess is {guess} percent. The broad dollar index tracks {actual} percent. The euro alone tracks {euro} percent."
  },
  "guess2": {
   "title": "Guess 2",
   "question": "Is copper at a record high right now?",
   "hint": "Think of the average monthly price since 1960. First as quoted at the time. Then with US inflation taken out.",
   "legend": "Pick one answer",
   "opt_a": "Yes, however you measure it",
   "opt_b": "Yes as quoted at the time, but not after taking out US inflation",
   "opt_c": "No, it is not at a record",
   "change": "Change my answer",
   "reveal_title": "What the numbers say",
   "match": "Your answer matches the numbers.",
   "differ": "The numbers say otherwise. The second answer is the right one.",
   "finding": "As quoted at the time, copper averaged {nominal} a tonne in {latest_month}. That is the highest monthly average in {months} months, since {series_start}. Take out US inflation and the picture changes. {above_count} months were higher. Today is {below_2011}% below February 2011, the high since 1990. April 1974 was {peak_above}% above today.",
   "note_2011": "February 2011 is the high since 1990 after inflation. It is not the highest ever. April 1974 was higher. Inflation is taken out with US CPI, so this is a US-dollar view.",
   "chart_title": "How does today's copper price compare with the past, with and without inflation?",
   "y_label": "US dollars per tonne",
   "series_nominal": "As quoted at the time (nominal)",
   "series_real": "In {base_month} dollars (real, US CPI)",
   "label_nominal": "Nominal: as quoted",
   "label_real": "Real: {base_month} dollars",
   "label_nominal_short": "Nominal",
   "label_real_short": "Real",
   "c_now": "{value}, a record as quoted",
   "c_1974": "{value} real, {pct}% above today",
   "c_2011": "{value} real, high since 1990",
   "gap_label": "{month}: no US CPI value",
   "gap_note": "The real line has a gap in {month}. US CPI has no value for that month. The US government shutdown stopped the data collection, says BLS. We leave the real price empty and do not fill it in.",
   "tip_nominal": "As quoted at the time: {value}",
   "tip_real": "In {base_month} dollars: {value}",
   "tip_real_missing": "Real price: no value (no US CPI that month)",
   "table_summary": "Show the data as a table",
   "col_month": "Month",
   "col_nominal": "As quoted at the time",
   "col_real": "In {base_month} dollars (real)",
   "no_value": "no value",
   "aria_chart": "Line chart of the monthly copper price from {from} to {to}, as quoted at the time and in {base_month} dollars. Focus the chart and use the left and right arrow keys to move along it."
  },
  "notshow": {
   "title": "What this page does not show",
   "items": [
    "Prices are World Bank monthly averages. Single-day highs and lows are not shown.",
    "The inflation-adjusted line uses US consumer prices. It says nothing about copper in euros or other currencies.",
    "Neither answer tells you where copper goes next. The link with the dollar is a pattern in this sample. It is not a cause and not a forecast.",
    "The data start in {series_start}. 'Record' means the highest since then."
   ]
  },
  "sources": {
   "title": "Sources",
   "reliability": "reliability: {reliability}",
   "names": {
    "S02": "World Bank commodity prices (copper)",
    "S04": "US consumer prices (BLS, via FRED)",
    "S17": "Broad US dollar index (Federal Reserve, via FRED)",
    "S18": "10-year US yield (Federal Reserve, via FRED)",
    "S19": "BLS note on the missing October 2025 CPI"
   },
   "attribution": "Copper prices: adapted from World Bank Commodity Price Data (CC BY 4.0). US inflation: U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban Consumers, retrieved from FRED, Federal Reserve Bank of St. Louis. Dollar index and 10-year yield: Board of Governors of the Federal Reserve System (US), retrieved from FRED. Full credits and licences are in the footer."
  },
  "next": "Next: {title}"
 },
 "dollar": {
  "intro": "This page compares monthly changes in the copper price with monthly changes in the US dollar. The dollar is measured two ways: a broad dollar index (from {index_from}) and euros per dollar (from {euro_from}). For both, a higher number means a stronger dollar.",
  "finding_1": "Mostly yes, but only in part. Since {index_from}, copper and the broad dollar index moved in opposite directions in {opposite_share}% of months. The correlation of their monthly changes is {r}, with a 95 percent range of {low} to {high}. In months when the dollar index rose one percent, copper was on average {beta}% lower, with wide variation from month to month. The dollar index alone tracks about {share}% of copper's monthly moves.",
  "finding_2": "The link is not steady. The 36-month correlation with the broad dollar index has ranged from {min} to {max}. It is {last} now.",
  "finding_3": "For a European buyer, the euro price of copper swung a little less from month to month than the dollar price: {sd_eur}% against {sd_usd}%. Both figures cover the same {sd_months} months, {sd_from} to {sd_to}. Copper tended to fall when the dollar rose, and that softens the swing for euro buyers.",
  "chart_title": "Does the link between copper and the dollar stay the same over time?",
  "y_label": "Correlation of monthly changes, 36-month window",
  "label_index": "Broad dollar index",
  "label_euro": "Euros per dollar",
  "label_index_short": "Dollar index",
  "label_euro_short": "Euro",
  "zero_label": "0 means no link",
  "below_hint": "Below zero: copper tended to fall when the dollar rose. Above zero: copper tended to rise with it.",
  "m_low": "{value}, the lowest",
  "m_high": "{value}, the highest",
  "m_last": "{value}, latest",
  "tip_index": "Broad dollar index: {value}",
  "tip_euro": "Euros per dollar: {value}",
  "tip_none": "no value yet (needs 36 months)",
  "table_summary": "Show the data as a table",
  "col_month": "Month",
  "no_value": "no value",
  "aria_chart": "Line chart of the 36-month correlation between monthly copper changes and the dollar, from {from} to {to}. Two lines: the broad dollar index and euros per dollar. Focus the chart and use the arrow keys to move along it.",
  "numbers_title": "The numbers",
  "numbers_hint": "Ranges in brackets are 95 percent ranges. A correlation of 0 means no link, and a negative one means opposite moves.",
  "col_measure": "What was measured",
  "col_result": "Result",
  "col_months": "Months",
  "g_strength": "How strong is the link?",
  "g_holds": "Does it hold up?",
  "g_euro": "What does it mean for a European buyer?",
  "r_corr_index": "Correlation of monthly changes, broad dollar index, {from} to {to}",
  "r_corr_euro": "Correlation of monthly changes, euros per dollar, {from} to {to}",
  "r_corr_euro_same": "Same, euros per dollar, on the months from {from}",
  "r_beta": "Average copper move in a month when the broad dollar index rose one percent",
  "r_beta_yield": "Same, with the change in the 10-year US yield added",
  "r_share": "Share of copper's monthly moves tracked by the dollar index alone, and with the yield added",
  "r_period_index": "Broad dollar index, {from} to {to}",
  "r_period_euro": "Euros per dollar, {from} to {to}",
  "r_lag_before": "Broad dollar index one month before copper",
  "r_lag_same": "Broad dollar index in the same month",
  "r_lag_after": "Broad dollar index one month after copper",
  "r_month_end": "Month-end prices instead of monthly averages, correlation: averages, then month-end",
  "r_cpi": "Copper move per one percent rise of the broad dollar index, all months, then without October and November 2025",
  "r_cum_since": "Copper price change since {since}: in dollars, then in euros",
  "r_cum_last": "Copper price change over the last 12 months: in dollars, then in euros",
  "r_sd": "Monthly swing of the copper price (standard deviation), {from} to {to}: in dollars, then in euros",
  "ci_note": "The 95 percent ranges for correlations come from a block bootstrap: blocks of six months, 5,000 resamples, a fixed seed. This allows for neighbouring months being related. The ranges for copper moves come from regression standard errors that allow for the same thing (Newey-West, three lags).",
  "result_pair": "{a}, then {b}",
  "notshow": {
   "title": "What this page does not show",
   "items": [
    "It does not show that the dollar moves copper. Both can react to the same news, such as growth or interest rates. This page does not test that.",
    "Adding the 10-year US yield barely changes the dollar result. That is a check, not proof.",
    "It is not a forecast. The link was close to zero around 2019. It could change again.",
    "Monthly averages smooth prices. A check with month-end prices gives {me_end} instead of {me_avg}. It covers the dollar index only, because euro rates exist only as monthly averages.",
    "That check uses LME copper prices. They are licensed, so only the result is shown here.",
    "This is one sample of about 20 years. The 2008 to 2009 crisis and 2020 are not tested on their own."
   ]
  },
  "sources": {
   "names": {
    "S02": "World Bank commodity prices (copper)",
    "S17": "Broad US dollar index (Federal Reserve, via FRED)",
    "S16": "Euro exchange rate (Federal Reserve, via FRED)",
    "S18": "10-year US yield (Federal Reserve, via FRED)",
    "S04": "US consumer prices (BLS, via FRED)",
    "S01": "LME copper prices (licensed, only one check's result is shown)"
   },
   "attribution": "Copper prices: adapted from World Bank Commodity Price Data (CC BY 4.0). Dollar index (DTWEXBGS), euro exchange rate (EXUSEU) and 10-year yield (GS10): Board of Governors of the Federal Reserve System (US), retrieved from FRED, Federal Reserve Bank of St. Louis. US inflation: U.S. Bureau of Labor Statistics via FRED. The month-end check uses LME cash prices, which are licensed and not published here."
  },
  "next": "Next: {title}"
 },
 "footer": {
  "name": "Behindokht Alipour",
  "tagline": "Copper market analysis, a portfolio project.",
  "links_title": "Links",
  "repo_label": "Source code and data on GitHub",
  "repo_url": "https://github.com/behindokht/copper-market-analysis",
  "portfolio_label": "My art portfolio",
  "portfolio_url": "https://behindokht.github.io/art-portfolio-wall/",
  "contact_title": "Contact",
  "email_label": "Email:",
  "email_user": "behinalipoor",
  "email_domain": "gmail.com",
  "email_link": "Write an email",
  "disclaimer": "Historical results are not forecasts and not investment advice. A link in a sample is not proof that one thing causes another.",
  "credits_summary": "Credits and licences",
  "credits": [
   "Fonts: Merriweather (headings) and Open Sans (text), self-hosted. Both use the SIL Open Font License 1.1. Merriweather: Copyright The Merriweather Project Authors. Open Sans: Copyright The Open Sans Project Authors.",
   "Copper prices: adapted from World Bank Commodity Price Data, licensed under CC BY 4.0. Changes made: prices are deflated with US CPI, rebased or turned into monthly changes, as each page says.",
   "US inflation (CPIAUCSL): U.S. Bureau of Labor Statistics, Consumer Price Index for All Urban Consumers: All Items in U.S. City Average, retrieved from FRED, Federal Reserve Bank of St. Louis. Public domain, citation requested.",
   "Dollar index (DTWEXBGS), euro exchange rate (EXUSEU) and 10-year yield (GS10): Board of Governors of the Federal Reserve System (US), retrieved from FRED, Federal Reserve Bank of St. Louis. Public domain, citation requested.",
   "No LME price data is shown or published on this site. Charts, text and code are my own work."
  ]
 }
};
