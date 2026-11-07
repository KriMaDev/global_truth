# Categories

Five categories, which can be combined: **War**, **Politics**, **Natural disasters**, **Economic**, **Technology advancements**. An item can belong to more than one. The code is in `pipeline/globe_pipeline/categorize.py`, tested in `pipeline/tests/test_rules.py`.

## Rules

1. **Data feeds** (USGS, GDACS) are Natural disasters.
2. **News: the headline decides.** Every category whose listed words appear in the headline applies (whole words, any case). The lists:
   - **War:** war, troops, army, military, airstrike(s), missile(s), drone(s), shelling, ceasefire, truce, invasion, rebels, militants, insurgents, front line, offensive, bombing, soldiers, armed conflict, warplanes.
   - **Politics:** election(s), vote(s), voters, parliament, president, prime minister, government, minister, senate, congress, referendum, coalition, opposition, protest(s), protesters, sanctions, summit, diplomat(s), treaty, impeachment, cabinet, lawmakers.
   - **Natural disasters:** earthquake, quake, tsunami, hurricane, typhoon, cyclone, tornado, flood(s), flooding, wildfire(s), bushfire, volcano, eruption, landslide, mudslide, drought, heatwave, storm, blizzard, avalanche.
   - **Economic:** economy, economic, inflation, recession, GDP, interest rate(s), central bank, stocks, stock market, markets, trade, tariff(s), unemployment, jobs report, budget, debt, currency, oil prices, IMF, World Bank, exports, imports.
   - **Technology advancements:** AI, artificial intelligence, chip(s), semiconductor(s), satellite, rocket, spacecraft, space station, quantum, robot(s), robotics, battery, batteries, fusion, vaccine, gene, genome, cyberattack, software, supercomputer, launch, telescope, breakthrough.
3. **News: if the headline has none of these words,** GDELT's themes for the article decide. The one category with the most matching themes applies, if it has at least two; on a tie, the first in the order above. The themes per category:
   - **War:** ARMEDCONFLICT, MILITARY, TERROR, REBELLION, WMD, CEASEFIRE, PEACEKEEPING, SEIGE, WB_2433_CONFLICT_AND_VIOLENCE.
   - **Politics:** ELECTION, LEGISLATION, DEMOCRACY, PROTEST, IMPEACHMENT, REFERENDUM, CONSTITUTIONAL, USPEC_POLITICS_GENERAL1, GOV_REFORM, SANCTIONS.
   - **Natural disasters:** NATURAL_DISASTER and NATURAL_DISASTER_*, ENV_DROUGHT, ENV_WILDFIRE.
   - **Economic:** ECON_*, EPU_ECONOMY, EPU_POLICY, UNEMPLOYMENT, WB_1104_MACROECONOMIC.
   - **Technology advancements:** SCIENCE, WB_133_INFORMATION_AND_COMMUNICATION_TECHNOLOGIES, CYBER_ATTACK, TECH_*.
4. **With no category, the item is not shown.** The globe covers these five subjects only. Sport, culture and lifestyle pages are already left out by their web address (see `docs/sources.md`).

The headline leads because it is what the reader sees. GDELT's themes describe the whole article, which often touches many subjects; used alone they made too many wrong categories.

An AI-assisted classifier may be added later. If it is, it will be documented here, and items it classifies will say so.
