# Pocket Money Tracker

A WordPress plugin for running a weekly, chore-based pocket money system at home. Kids tick off screen-free tasks each day; each ticked task earns its share of that child's weekly amount, capped so they can never earn more than the amount you've set — missed tasks simply don't earn, which is the "deduction".

Plugin code lives in [`pocket-money-tracker/`](pocket-money-tracker).

## How it works

- **Children** each have their own weekly amount (e.g. £5 for a younger child, £16 for an older one with bigger tasks like washing the car).
- **Tasks** are set per child (washing up, making the bed, tidying a room, saying something nice to a sibling, etc.) — the same list applies every day.
- A task's value is `weekly amount ÷ (number of active tasks × 7 days)`, rounded down, so the week's total can never exceed the cap.
- Ticking a task off for a day credits that amount; leaving it unticked earns nothing for that task/day.

## Setup

1. Copy (or symlink) the `pocket-money-tracker` folder into `wp-content/plugins/` on your WordPress site.
2. Activate **Pocket Money Tracker** from the Plugins screen.
3. In wp-admin, go to **Pocket Money → Children** and add each child with their weekly amount.
4. Go to **Pocket Money → Tasks**, pick a child, and add their tasks.
5. Add the `[pocket_money_tracker]` shortcode to a page — this is the kid-facing checklist, no login required. Use `[pocket_money_tracker child="3"]` to pin the shortcode to one specific child's ID (shown in the Children/Tasks admin screens).
6. Parents can also view and tick on the **Pocket Money → Overview** admin page, with a week-by-week view for every child.

## Notes

- The frontend checklist page is open to anyone who can reach its URL (no WordPress login is required, since kids don't have their own accounts). Keep the page unlisted/private if that matters for your setup.
- Weeks run Monday to Sunday. Only today or earlier can be ticked off — future days are locked.
