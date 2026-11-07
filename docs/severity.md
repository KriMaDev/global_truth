# Severity rules

Every event on the globe has one of four severity levels. The level comes only from the documented rules below, never from a guess. The code is in `pipeline/globe_pipeline/severity.py`. Any change to a rule must change this page and the code together, with tests.

> **Status:** the scale and palette are final. The rules for each source are a **draft** and take effect with the live pipeline in milestone 3.

## The scale

| Level | Colour | Size on globe | Pulse |
|---|---|---|---|
| Low | `#56B4E9` (sky blue) | smallest | none |
| Moderate | `#F0E442` (yellow) | small | slow |
| High | `#E69F00` (orange) | medium | medium |
| Critical | `#D55E00` (vermillion) | largest | fast |

These are Okabe-Ito colours, chosen to be distinguishable with the common types of colour blindness. Size and pulse also change with the level, so colour is never the only signal. With reduced motion turned on, there is no pulse and size still shows the level. The legend is always visible.

## Rules by source (draft)

### Earthquakes (USGS)
1. If USGS gives a PAGER alert, it decides the level: green → low, yellow → moderate, orange → high, red → critical.
2. Otherwise the magnitude decides: under 5.0 → low, 5.0–5.9 → moderate, 6.0–6.9 → high, 7.0 and above → critical.

### GDACS alerts
Green → low, Orange → high, Red → critical. GDACS alerts are automated estimates and are labelled as such, with a pointer to official national authorities.

### NASA EONET events
EONET gives no severity, so each event type has a fixed default level. The table will be filled in when EONET is added in milestone 7. If GDACS reports the same event, the GDACS level is used.

### News reports
1. Casualty numbers stated in the headline or snippet ("at least N killed/dead"): 1 or more → moderate, 10 or more → high, 100 or more → critical.
2. A listed set of hazard terms (e.g. "state of emergency", "evacuation ordered") gives moderate. The list will live here once written.
3. Otherwise → low.

### What does not change severity
How many outlets cover a story is shown as **coverage**, separately. It never raises severity, because prominence is not severity.
