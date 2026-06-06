# Your Name

<!-- ASANA_STATS_START -->
![Asana Tasks per Day](assets/asana-chart.svg)

_Updated Sat, 06 Jun 2026 18:06:14 GMT_
<!-- ASANA_STATS_END -->

---

## Setup

1. **Get your Asana IDs** (run once locally):
   ```bash
   ASANA_PAT=your_token node scripts/get-asana-ids.js
   ```

2. **Add GitHub repository secrets** (Settings → Secrets → Actions):

   | Secret | Value |
   |--------|-------|
   | `ASANA_PAT` | Your Asana Personal Access Token (from asana.com/0/my-apps) |
   | `ASANA_WORKSPACE_GID` | Numeric workspace ID printed by the helper script |
   | `ASANA_USER_GID` | *(Optional)* Your numeric user ID — defaults to `me` |

3. **Adjust the time window** in `.github/workflows/update-asana-stats.yml`:
   ```yaml
   DAYS: '30'   # change to 7 or 14 if you prefer
   ```

4. **Push this repo to GitHub** and run the workflow once manually:
   Actions → "Update Asana Task Stats" → Run workflow

The badge updates automatically every 6 hours after that.
