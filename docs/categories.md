# Categories

Eleven categories, which can be combined: **War**, **Politics**, **Natural disasters**, **Economic**, **Technology advancements**, **Health & outbreaks**, **Climate & environment**, **Crime & justice**, **Humanitarian & migration**, **Science & space** and **Sport**. An item can belong to more than one. The code is in `pipeline/globe_pipeline/categorize.py`, tested in `pipeline/tests/test_rules.py`.

- **Health & outbreaks** was added on 8 November 2026 so emerging epidemics are tracked.
- **Climate & environment, Crime & justice, Humanitarian & migration, Science & space and Sport** were added on 8 November 2026 after the first review of what people search for (see "Review of what people search for" below). Science & space took the space and life-science words out of Technology advancements, which keeps computing, AI, chips, robots, batteries and cyberattacks.
- **Sport is on by default**, like every category. In each outlet's daily balance it has its own allowance (see `docs/sources.md`), so it never pushes news out. It started as off by default, for fear of crowding the globe, and was turned on the same day (8 November 2026, owner) when real data showed only a handful of sport items.

## Rules

1. **Data feeds** (USGS, GDACS) are Natural disasters.
2. **News from an outlet's sport section** (web address containing `/sport` or `/football`) is **Sport, and only Sport.** Sport headlines are full of words like "offensive", "attack", "storm" or "court" that mean something else on a news page.
3. **Other news: the outlet's own section and the headline decide together.**
   - **The outlet's section** comes first, because it is the outlet's own editorial label: a folder in the article's web address with a topical name. `business`, `economy` → Economic; `politics` → Politics; `environment`, `climate-crisis`, `energy-and-environment` → Climate & environment; `science` → Science & space; `technology`, `tech`, `science-technology` → Technology advancements; `health` → Health & outbreaks; `law`, `crime`, `courts-crime` → Crime & justice; `global-development` → Humanitarian & migration. Only folders count, not the article's own name. Most outlets' addresses name only places or dates (BBC, CBC, The Hindu, ABC, Xinhua), so this covers few items: 16 of 372 in a sample on 8 Nov 2026 (The Guardian, Premium Times, The Straits Times, Anadolu Agency).
   - **The headline's words** add every category whose listed words appear in it (whole words, any case). The lists:
   - **War:** war, troops, army, military, airstrike(s), missile(s), drone(s), shelling, ceasefire, truce, invasion, rebels, militants, insurgents, front line, offensive, bombing, soldiers, armed conflict, warplanes.
   - **Politics:** election(s), vote(s), voters, parliament, president, prime minister, government, minister, senate, congress, referendum, coalition, opposition, protest(s), protesters, sanctions, summit, diplomat(s), treaty, impeachment, cabinet, lawmakers.
   - **Natural disasters:** earthquake, quake, tsunami, hurricane, typhoon, cyclone, tornado, flood(s), flooding, wildfire(s), bushfire, volcano, eruption, landslide, mudslide, drought, heatwave, storm, blizzard, avalanche.
   - **Economic:** economy, economic, inflation, recession, GDP, interest rate(s), central bank, stocks, stock market, markets, trade, tariff(s), unemployment, jobs report, budget, debt, currency, oil prices, IMF, World Bank, exports, imports.
   - **Technology advancements:** AI, artificial intelligence, chip(s), semiconductor(s), quantum, robot(s), robotics, battery, batteries, vaccine, cyberattack, software, supercomputer, launch, breakthrough.
   - **Health & outbreaks:** outbreak(s), epidemic, pandemic, virus(es), disease(s), infection(s), cholera, Ebola, Marburg, mpox, monkeypox, measles, dengue, malaria, polio, COVID, COVID-19, coronavirus, influenza, flu, bird flu, H5N1, plague, World Health Organization, vaccination (campaign), quarantine. ("WHO" alone is not used: matching ignores capitals, so "Who is…" would count.)
   - **Climate & environment:** climate, climate change, global warming, emissions, carbon, net zero, greenhouse gas(es), COP29–COP32, climate summit, pollution, polluted, deforestation, biodiversity, glacier(s), sea level(s), renewable(s), coral (reef), endangered species, extinction, fossil fuel(s), hottest year, heat record, environmental. ("COP" alone is not used: it is also slang for a police officer.) Disasters themselves stay in Natural disasters.
   - **Crime & justice:** murder(s), murdered, homicide, assassination, assassinated, shooting(s), gunman, gunmen, stabbing, stabbed, arrest(s), arrested, charged, indicted, indictment, on trial, stands trial, goes on trial, verdict, sentenced, convicted, acquitted, court, Supreme Court, prosecutor(s), police, fraud, corruption, bribery, kidnapping, kidnapped, abducted, trafficking, smuggling, cartel(s), gang(s), extradition, extradited, jailed, prison, robbery, heist. ("Trial" alone is not used, because of clinical trials.) Terrorism stays in War.
   - **Humanitarian & migration:** refugee(s), migrant(s), migration, asylum (seekers), displaced, displacement, famine, hunger, starvation, malnutrition, humanitarian (aid), aid convoy, aid workers, aid trucks, food aid, food crisis, food insecurity, UNHCR, UNRWA, World Food Programme, deportation(s), deported. ("Aid" alone is not used: "military aid" is not humanitarian.)
   - **Science & space:** satellite(s), rocket, spacecraft, space station, telescope, gene(s), genome, fusion, space, NASA, ESA, ISRO, Mars, Moon, lunar, asteroid, comet, astronaut(s), astronomers, galaxy, black hole, exoplanet, scientists, researchers, study finds, new study, fossils, dinosaur, species, physics.
   - **Sport:** World Cup, Olympics, Olympic, Paralympics, Premier League, Champions League, La Liga, Bundesliga, Serie A, FIFA, UEFA, NBA, NFL, MLB, NHL, cricket, rugby, tennis, Wimbledon, Grand Slam, Formula 1, Formula One, Grand Prix, Tour de France, Super Bowl, footballer, golf, boxing, UFC. ("Marathon" was tried and dropped on 8 Nov 2026: headlines use it figuratively.)
4. **News: if neither the section nor the headline gives a category,** GDELT's themes for the article decide. The one category with the most matching themes applies, if it has at least two; on a tie, the first in the order above. The themes per category (names checked against GDELT's theme list on 8 Nov 2026):
   - **War:** ARMEDCONFLICT, MILITARY, TERROR, REBELLION, WMD, CEASEFIRE, PEACEKEEPING, SEIGE, WB_2433_CONFLICT_AND_VIOLENCE.
   - **Politics:** ELECTION, LEGISLATION, DEMOCRACY, PROTEST, IMPEACHMENT, REFERENDUM, CONSTITUTIONAL, USPEC_POLITICS_GENERAL1, GOV_REFORM, SANCTIONS.
   - **Natural disasters:** NATURAL_DISASTER and NATURAL_DISASTER_*, ENV_DROUGHT, ENV_WILDFIRE.
   - **Economic:** ECON_*, EPU_ECONOMY, EPU_POLICY, UNEMPLOYMENT, WB_1104_MACROECONOMIC.
   - **Technology advancements:** WB_133_INFORMATION_AND_COMMUNICATION_TECHNOLOGIES, CYBER_ATTACK, TECH_*.
   - **Health & outbreaks:** HEALTH_PANDEMIC, HEALTH_VACCINATION, TAX_DISEASE__, MEDICAL__, WB_621_HEALTH_NUTRITION_AND_POPULATION.
   - **Climate & environment:** ENV_CLIMATECHANGE, WB_567_CLIMATE_CHANGE, UNGP_CLIMATE_CHANGE_ACTION, ENV_GREEN, ENV_DEFORESTATION, ENV_SPECIESENDANGERED, ENV_POACHING, MOVEMENT_ENVIRONMENTAL, WB_601_POLLUTION_MANAGEMENT, WB_1791_AIR_POLLUTION, WB_1798_WATER_POLLUTION, WB_1984_OCEAN_POLLUTION. (Not ENV_* as a whole: it also covers oil, mining, coal and gas.)
   - **Crime & justice:** SOC_GENERALCRIME, CRIME_*, ARREST, TRIAL, WB_1014_CRIMINAL_JUSTICE, UNGP_CRIME_VIOLENCE, CORRUPTION, DRUG_TRADE, KIDNAP, ASSASSINATION, HUMAN_TRAFFICKING. (Not KILL: it is in most war reports too.)
   - **Humanitarian & migration:** REFUGEES, DISPLACED, IMMIGRATION, WB_2837_IMMIGRATION, EPU_CATS_MIGRATION_FEAR_MIGRATION, FOOD_SECURITY, SELF_IDENTIFIED_HUMANITARIAN_CRISIS, AID_HUMANITARIAN.
   - **Science & space:** SCIENCE, TAX_FNCACT_ASTRONOMER.
   - **Sport:** none (GDELT has no sport theme).
   - **Why themes are only the last resort** (tested 8 Nov 2026 on 372 real articles): letting themes add categories next to the headline mostly added wrong ones. With 3 matching themes it added 60 categories, most of them wrong ("Advani enters 100th year" → War, "measles outbreaks" → Economic); with 4 it still added a few wrong ones. GDELT's themes describe everything an article touches, not what it is about.
5. **With no category, the item is not shown.** The globe covers these eleven subjects only. Culture, lifestyle and opinion pages are left out by their web address (see `docs/sources.md`).

## Review of what people search for

The categories follow what people around the world look for in the news. **Once a year** (after Google publishes its Year in Search in December), the owner and Claude check Google's Year in Search, global and by region, and the topic groups Google Trends uses, and write here what changed and why. Nothing is fetched live: Google Trends has no open interface whose terms clearly allow reuse.

- **8 November 2026** (Year in Search 2025): the biggest news searches not covered by the first six categories were crimes and court cases (an assassination, the Epstein files), climate beyond disasters, science and space, refugees and migration, and sport, the most searched subject of all. All five were added. A first real run (6 hours, 59 news items) put 11 items in Crime & justice, 4 in Climate & environment, 4 in Sport and 2 in Humanitarian & migration; "marathon" was dropped from Sport after it caught a figurative use.
- **Next review:** December 2026 / January 2027 (Year in Search 2026).

## Where each category came from

Every news card says it, e.g. 'Economic from the outlet's own section "business".', 'War and Politics from words in the headline.' or 'Humanitarian & migration from GDELT's reading of the whole article.' (`category_basis` in the data; `frontend/src/ui/category-basis.ts`).

## Outlets' own tags in their feeds (8 Nov 2026)

Some outlets' RSS feeds carry editorial tags (The Guardian: "Climate crisis", "COP31"; CBC: "News/Science") or come per section (BBC, NPR). They would be the best source of categories, but their terms do not allow this use without permission: The Guardian's Open Platform terms forbid using its content or sites "for any text and data aggregation, analysis or mining purposes"; NPR's feeds are for personal, non-commercial use; CBC's terms require an agreement for any use beyond private purposes; the BBC's current feed terms could not be confirmed. So feed tags would be used **only for outlets that give written permission**, recorded in `docs/sources.md` and here, outlet by outlet. Feed tags are not used today.

## Type of natural disaster

Every natural disaster shows its type on the card, the hover label and in lists ("Earthquake · Data feed · USGS").

- **Data feeds** give it themselves: USGS earthquakes are EQ; GDACS alerts carry its event type (EQ earthquake, TC tropical cyclone, FL flood, VO volcano, DR drought, WF wildfire).
- **News** in Natural disasters takes it from the headline's words (whole words, any case). If several match, the first in this order wins, because a tsunami headline often also says "earthquake" and a cyclone headline "flood":
  1. **TS Tsunami:** tsunami
  2. **EQ Earthquake:** earthquake(s), quake(s), aftershock(s)
  3. **TC Tropical cyclone:** hurricane(s), typhoon(s), cyclone(s)
  4. **VO Volcano:** volcano(es), volcanic, eruption, erupts, erupted
  5. **WF Wildfire:** wildfire(s), bushfire(s), forest fire(s)
  6. **FL Flood:** flood(s), flooding, flooded, flash flood(s)
  7. **LS Landslide:** landslide(s), mudslide(s)
  8. **AV Avalanche:** avalanche(s)
  9. **DR Drought:** drought(s)
  10. **HW Heatwave:** heatwave(s), heat wave(s)
  11. **ST Storm:** storm(s), tornado(es), blizzard(s)
- A headline without any of these words (the category came from GDELT's themes) has no type, and none is shown.
- When reports are grouped, the event keeps the first type it has (a data feed's leads).

The labels live in `frontend/src/types.ts` (`HAZARD_LABELS`); a test keeps them in step with the pipeline's codes.

## Why the headline leads

The headline leads because it is what the reader sees. GDELT's themes describe the whole article, which often touches many subjects; used alone they made too many wrong categories.

An AI-assisted classifier may be added later. If it is, it will be documented here, and items it classifies will say so.
