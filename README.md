# Pocket Money Tracker

A WordPress plugin for running a weekly, chore-based pocket money system at home. Kids tick off screen-free tasks each day; each ticked task earns its share of that child's weekly amount, capped so they can never earn more than the amount you've set — missed tasks simply don't earn, which is the "deduction".

Plugin code lives in [`pocket-money-tracker/`](pocket-money-tracker).

## How it works

- **Children** each have their own weekly amount (e.g. £5 for a younger child, £16 for an older one with bigger tasks like washing the car).
- **Tasks** are set per child and each one is either:
  - **Daily** — shown every day of the week, tick it off up to 7 times.
  - **Weekly** — shown once as a single "This week" checkbox (good for things like mowing the lawn or a deep clean of a room that only need doing once).
- Each task also has a **Worth** tier, picked per task:
  - **5%** — small, everyday-expected habits (making the bed, putting laundry away, shoes and coats away).
  - **10%** — a bit more effort (laying the table, feeding a pet, reading for 20 minutes).
  - **15%** — bigger jobs, usually weekly (tidying/dusting a room, washing the car).
  - Any task can also be flagged as **Bonus** — an optional extra, useful for topping up money missed from a skipped day.
- These tiers are *relative*, not fixed slices of money: completing every non-bonus task in a week always adds up to exactly the child's full weekly amount, whatever the mix of tasks or how many there are — add, remove or reweight tasks and the split just reshapes itself around the new set, it never drifts above or below 100%. Bonus tasks sit outside that split as genuine extras on top, which is what lets them make up for something missed elsewhere in the week — the running total is still capped at the weekly amount either way.

## Setup

1. Copy (or symlink) the `pocket-money-tracker` folder into `wp-content/plugins/` on your WordPress site.
2. Activate **Pocket Money Tracker** from the Plugins screen.
3. In wp-admin, go to **Pocket Money → Children** and add each child with their weekly amount.
4. Go to **Pocket Money → Tasks**, pick a child, and add their tasks.
5. Add the `[pocket_money_tracker]` shortcode to a page — this is the kid-facing checklist, no login required. Use `[pocket_money_tracker child="3"]` to pin the shortcode to one specific child's ID (shown in the Children/Tasks admin screens).
6. Parents can also view and tick on the **Pocket Money → Overview** admin page, with a week-by-week view for every child.

## Using it like an app (iPad/iPhone)

The shortcode page has its own icon and "Add to Home Screen" support built in — no App Store needed:

1. Open the page with the `[pocket_money_tracker]` shortcode in **Safari** on the iPad (use the plain page URL, not a link with `?pmt_child=` / `?pmt_week=` already in it, so the saved shortcut isn't pinned to one child or week).
2. Tap the Share icon, then **Add to Home Screen**.
3. It now opens full-screen with its own icon and no Safari address bar — just like an app.

## Notes

- The frontend checklist page is open to anyone who can reach its URL (no WordPress login is required, since kids don't have their own accounts). Keep the page unlisted/private if that matters for your setup.
- Weeks run Monday to Sunday. Only today or earlier can be ticked off — future days are locked.
