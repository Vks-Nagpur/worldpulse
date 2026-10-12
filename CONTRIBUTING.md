# Contributing to WorldPulse

WorldPulse is free for everyone and built only from public data. Contributions that keep it that way are welcome.

## Easy ways to help (no coding)
- **Suggest a free source:** open an issue with the “Suggest a free source” form.
- **Report a wrong item:** open an issue with the “Report a wrong item” form and include the page link.
- **Translate:** interface text for Hindi lives in `frontend/src/i18n.ts`. Other languages can be added the same way.

## Ground rules
1. **Free only.** No source that needs a paid key, subscription or licence. Free keys may be optional (like NASA FIRMS), never required.
2. **No fabrication.** Every number and headline must come from a stored public source with its link and date.
3. **Respect publishers.** Store headlines, short excerpts and links only. No paywall or access-control bypassing.
4. **Label uncertainty.** Keep support levels (measured, official, several outlets, one outlet), signal limitations and “not a prediction” notes.
5. **Works without AI.** Optional AI features must be validated and never required.

## For developers
- Data engine: `backend/` (Python). Tests: `cd backend && pip install -r requirements.txt -r requirements-dev.txt && python -m pytest -q tests`
- Add a source: append an entry to `backend/worldpulse/sources.json` (kinds: `rss`, `gdelt`, `usgs`, …). A failing source never stops the others.
- Website: `frontend/` (React + TypeScript + Vite). `npm ci && npm run dev`; put a data snapshot in `frontend/public/data` to develop offline.
- The `WorldPulse data` workflow runs every 3 hours, publishes the snapshot to the `worldpulse-data` branch and deploys GitHub Pages.
