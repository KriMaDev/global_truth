# Severity rules

Every event on the globe has one of four severity levels. The level comes only from the documented rules below, never from a guess. The code is in `pipeline/globe_pipeline/severity.py`, and `pipeline/tests/test_rules.py` tests every rule and its boundaries. Any change to a rule must change this page and the code together, with tests.

Each event also carries a short **reason** in plain words, shown on its card, e.g. "Magnitude 6.2 (USGS)", "GDACS Orange alert (severity derived from it)" or "Headline reports 22 or more deaths".

## The scale

| Level | Colour | Pillar of light on the globe | Pulse | Rings |
|---|---|---|---|---|
| Low | `#56B4E9` (sky blue) | shortest, slimmest | none | no |
| Moderate | `#F0E442` (yellow) | short | slow | no |
| High | `#E69F00` (orange) | tall | medium | yes |
| Critical | `#D55E00` (vermillion) | tallest, widest | fast | yes |

Each event is a pillar of light rising from its location. These are Okabe-Ito colours, chosen to be distinguishable with the common types of colour blindness. Height, width, pulse and rings also change with the level, so colour is never the only signal. With reduced motion turned on, there is no pulse and no rings; height and width still show the level. The legend is always visible.

## Rules by source

### Earthquakes (USGS)
1. If USGS gives a PAGER alert (its estimate of impact on people), it decides the level: green → low, yellow → moderate, orange → high, red → critical.
2. Otherwise the magnitude decides: under 5.0 → low, 5.0–5.9 → moderate, 6.0–6.9 → high, 7.0 and above → critical.

### GDACS alerts
Green → low, Orange → high, Red → critical. GDACS alerts are automated estimates: the card says so and points to official national authorities. This mapping is our change to GDACS's data, stated as required by its CC BY 4.0 licence.

### The same earthquake from USGS and GDACS
They become one event listing both sources (see `pipeline/globe_pipeline/cluster.py`). It takes the higher of the two levels, with that rule's reason.

### NASA EONET events (milestone 7)
EONET gives no severity, so each event type will have a fixed default level, listed here when EONET is added.

### News reports
Only the headline is read: it is what the reader sees, and the rule can be checked against it.
1. **Deaths stated in the headline.** 1 or more → moderate, 10 or more → high, 100 or more → critical. Recognised forms:
   - "at least 12 killed", "12 people dead", "30 die", "dozens of civilians killed", "kills 22", "death toll rises to 1,250";
   - number words: one to twelve, "a dozen" (12), "dozens" (24), "scores" (40), "hundreds" (200), "thousands" (2,000).
2. **A hazard term in the headline** gives moderate:
   - "state of emergency", "evacuat…", "martial law", "curfew";
   - "air strike"/"airstrike", "missile strike", "drone strike", "shelling", "invasion", "coup", "explosion", "hostage", "massacre";
   - "outbreak", "epidemic", "pandemic", "famine", "tsunami warning".
3. **Otherwise** → low.

When several outlets report the same story, the event takes the highest level any of their headlines gives.

The same news rules apply to every category, Sport included: a headline reporting deaths at a stadium is rated like any other.

### What does not change severity
How many outlets cover a story is shown as **coverage**, separately. It never raises severity, because prominence is not severity.

## On the globe

### News and natural disasters look different

- **News** (every category except Natural disasters) is a **pillar of light**.
- **Natural disasters** (data feeds, and news headlines in Natural disasters) are a **symbol on a glass disc**, floating just above a small glowing spot, with a rim and a soft halo in the severity colour. The symbol shows the type: earthquake (seismograph trace), tsunami (curling wave), tropical cyclone (the weather-map sign), volcano, wildfire (flame), flood (house in water), landslide (rocks on a slope), avalanche, drought (sun over cracked ground), heatwave (thermometer), storm (cloud and bolt), and a warning sign for a disaster of unknown type.
- Severity shows the same way on both: colour, size, pulse speed and (high, critical) rings. The symbol adds the type, a second signal that does not depend on colour.
- The symbols are our own drawings (`frontend/src/globe/hazard-icons.ts`); the legend lists them all under "Disaster symbols".
- In the geography view, news shrinks to small dots and the symbols sit smaller and lower.

### Groups of events
Where pillars would crowd (closer than 4°, 2° or 1° on screen depending on zoom; never when zoomed right in), they merge into one pillar (or one symbol: natural disasters and news are grouped separately, so a group is always one or the other). It takes the **highest severity among its events** and stands at that event's place, with a badge showing how many events it holds. Grouping never changes any event's own severity. Code: `frontend/src/clusters.ts`.

### Geography view: country colours
Each country takes the **highest severity among its events** that pass the current filters and time window, matched by the event's `geo.country_code`. Countries without such events stay a neutral tint. Events without a country (e.g. remote earthquakes at sea) do not colour any country. Code: `countrySeverity` in `frontend/src/geography.ts`.

### Known limits
- Most news is low: a headline without a death count or a listed hazard term is low, however important the story. This keeps the rule checkable rather than guessing importance.
- Headlines sometimes report the same deaths differently across outlets ("22 killed" and "11 dead"); the highest wins.
