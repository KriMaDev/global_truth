# Categories

Five categories, which can be combined: **War**, **Politics**, **Natural Disasters**, **Economic**, **Technology Advancements**. An item can belong to more than one.

> **Status:** draft. The rules take effect with the live pipeline in milestone 3, in `pipeline/globe_pipeline/categorize.py`.

## Rules (rule-based, in this order)
1. **Data feeds map directly.** USGS, GDACS and EONET → Natural Disasters.
2. **The feed's section is a hint.** A "technology" or "business" RSS feed gives that category a head start.
3. **Weighted keywords** in the headline and snippet. Each category has a keyword list with weights. An item gets every category whose score passes the threshold. The lists will be published here once written.
4. **If nothing passes, the item gets no category.** It is shown only when no category filter is active. No category is guessed.

An AI-assisted classifier may be added later. If it is, it will be documented here, and items it classifies will say so.
