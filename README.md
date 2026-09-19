# Kaomoji Alt Emporium

Three small reference pages for typing special characters and emoticons in Final Fantasy XI chat.

- **[Kaomoji](index.html)** — click-to-copy Japanese-style kaomoji and the symbols they're built from (paste-based).
- **[Face Builder](face-builder.html)** — emoticons built only from Alt codes confirmed to render in FFXI's chat font (keyboard-typable, no paste needed).
- **[Alt Code Reference](alt-codes.html)** — the full Windows Alt+numpad character lookup table (ANSI + Legacy/OEM).

Static HTML/CSS/JS. Open `index.html` directly or serve the folder with any static host.

## The workbook is the database

All content lives in **[Kaomoji_Alt_Emporium_Tracker.xlsx](Kaomoji_Alt_Emporium_Tracker.xlsx)** (sheet `Entries`): every face, symbol, combo and Alt code across the three pages (419 entries), each with an entry type, category, name, Alt code where one applies, and a **Player Tested** status of Verified / Untested / Unsupported. The status drives the badge on each tile. The `Guide` sheet explains the columns.

To add or change something:

1. Edit the workbook (add a row, change a category, set a status) and **save** it.
2. Regenerate the site data from this folder:

   ```
   powershell -ExecutionPolicy Bypass -File .\build-data.ps1
   ```

   This reads the workbook (needs Microsoft Excel) and rewrites `data.js`, which the three pages load. It validates every row and refuses to write anything if a row is broken, telling you which row and why. `data.js` is generated - don't edit it by hand.
3. Commit and push.

## Rendering research

Which Legacy/OEM Alt codes actually render in FFXI's chat font isn't fully documented anywhere, so we're tracking it ourselves as we test in-game. It builds on community-maintained guides (an FFXIclopedia ASCII Alt Codes guide and a HorizonXI wiki guide) - this is meant to give something back: pull the workbook, verify a few rows in your own client, and the ground truth here gets a little more complete.
