# Green Job Cards — Green Enterprise Solutions

An offline tablet app for technician job cards. There is no server and no login. All data stays on the tablet.

## How a request flows (v1.1)
1. **Pre-trip**: choose *Site call-out* or *Site visit*, then the department and its technicians, the vehicle, and where from and to. You get the distance and cost estimate.
   - Send the estimate to the approver (Outlook email; the approver's address is set in Settings).
   - Set the **approval**: ? No feedback yet (grey) · ✓ Approved (green) · ↻ Deferred (orange, can be rescheduled) · ✕ Cancelled (red).
2. **Trip-prep** (call-outs only, unlocked once the pre-trip is approved):
   - **Equipment** sheet: item, serial no., quantity and a **required photo** per item. You can download an Excel template or **import a BOQ** (.xlsx / .csv).
   - **Tools** sheet (photo optional).
   - Both sheets start with 5 rows, and you can add more.
3. **Finish Trip-prep** brings up a BOM warning: *Do BOM check now* or *Later*. With *Later*, the Site call-out stays locked.
4. **BOM check**: tick every equipment item and tool. When everything is ticked, the app shows **"You are now ready for your Call-out!"**
5. **Site call-out** job card:
   - Part 4 shows the equipment taken (read-only), plus a table of additional items now needed.
   - Part 7 has the technician and customer signatures, then the **outcome**, then the **client rating** (Excellent / Average / Poor, available only after the customer has signed).
6. **Site visit** (visit requests, unlocked once approved): job & customer, technician & vehicle, travel, **findings**, photos, sign-off with client rating, and export.

**Technician ratings** (Technicians tab and Home):
- Call-out outcome: Resolved +5, Partly resolved +1, Follow-up required 0, Not resolved −2.
- Client rating: Excellent +5, Average +1, Poor −2.
- Points count once the job card PDF has been created, and go to the lead and assisting technicians.
- Levels: Starter, Bronze (10), Silver (40), Gold (100), Platinum (200).

**Email**:
- The Email button opens a **new email in the Outlook app**, with the recipient, subject and text filled in.
- A web app cannot attach a file to a new email, so the PDF is saved to Downloads first. Attach it with the paper clip in Outlook.
- Alternative: *Attach via share menu* attaches the PDF automatically; pick Outlook in the list.
- The behaviour can be changed in Settings → Email & approvals.

## What it does
- **Technicians, Company vehicles, Customers**: local databases on the tablet.
  - Export: Settings → Data → *All three + settings* (or each one separately). Send the file to a new tablet by Bluetooth, WhatsApp or email, then use **Import** there.
    - **Merge** adds new records and updates existing ones.
    - **Replace** clears that list first.
  - Customers can also be exported and imported as **CSV** (Excel). Columns: `name, branch, contact, phone, email, accountNo, address, town, kmFromHO, lat, lng, notes`. Only `name` is required.
- **Pre-trip cost summary**
  - *From*: Head Office (Old Power Station, Windhoek; set in Settings) or another town and address.
  - *To*: a customer from the database, or a town and address typed in.
  - Distance:
    - Town to town uses the built-in Namibian road network (51 towns).
    - Within a town it uses the GPS points of the head office and the customer × 1.3, or a default in-town distance.
    - You can override it at any time.
  - Cost: fuel (vehicle l/100 km × fuel price), plus labour (travel and on-site time per technician), call-out fee, accommodation and S&T for nights away, and any extra lines. Only lines whose rates are set in Settings are included.
  - Export the PDF, or tap **Start site call-out from this trip**.
- **Site call-out (job card)**
  - Job & customer: job no., date, type, customer ref.
  - Technician & vehicle.
  - Travel: from, odometer start and odometer at site (with photos), so the distance is calculated; departure, arrival and leaving times; site GPS.
  - Equipment: make, model, serial, page count. Earlier serials for the same customer are suggested.
  - Work done: reason for visit, issues encountered, issues resolved, outcome, parts used, follow-up, general notes.
  - Photos (camera or gallery, with captions).
  - Technician and customer signatures (Undo / Clear / photo of a paper signature).
  - **Export**: Save to device, WhatsApp, Email, Bluetooth, other apps. The PDF is attached via the tablet's share menu.
  - Missing items are listed before the PDF is made, with the choice *Cancel* or *Create PDF anyway*.
- Job card numbers: `JC-<tablet code>-0001`. Give each tablet its own code in Settings so numbers never clash between tablets.

## Publish on GitHub Pages (once)
1. Create a **public** repository, e.g. `green-jobcards`.
2. **Add file → Upload files**. Upload everything in this folder (including `lib/xlsx.mini.min.js` and `js/flow.js`): `index.html`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, `README.md`, and the folders `js`, `lib`, `assets`, `icons`. Then commit.
3. **Settings → Pages → Deploy from a branch → main / (root) → Save**.
4. The app is live at `https://<user>.github.io/green-jobcards/` after about a minute.

## Set up each tablet
1. Open the link in **Chrome**, then go to Settings → **Install the app** (or ⋮ → Install app). Open it once while online.
2. Settings: set the **tablet code** (T1, T2, OSH…) and your **rates** (labour, call-out fee, accommodation, S&T). Check the **fuel prices** every month.
3. Stand at the Old Power Station office and tap **Head office → Use my location**. This improves Windhoek in-town distances.
4. Add the technicians, vehicles and customers, or import them from another tablet.

## Good to know
- Clearing the browser's site data deletes everything. Export a **full backup** (Settings → Data) now and then.
- To update the app, upload the changed files and change `VERSION` in `sw.js`. The tablets then show "Update available".
