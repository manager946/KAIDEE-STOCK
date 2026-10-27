# KAIDEE-STOCK — ขายดีมีตังค์

**หจก.มีตังค์อิงค์เจ็ท | Stock, Sales & Document Management**

> **Development bootstrap only.** This repository does **not** yet contain the production Google Apps Script source or live Google Sheets database. Never deploy this starter over the existing web app.

## Goals
- Preserve current inventory data and document records.
- Review the existing Google Apps Script and Google Sheets schema before modifying business logic.
- Implement safe cancellation and reversal of stock withdrawals, single-effect stock deduction, and PDF preview/download/printing.
- Add role-based access and audit trails with tests on a staging copy.

## Architecture
- **GitHub:** source control, reviews and tests.
- **Google Apps Script:** existing application runtime; integration requires verified editor access.
- **Google Sheets:** existing production data; do not import, overwrite or create duplicate sheets without inspection.

## Development status (2026-10-27)
- Private repository established as the source-control workspace.
- Source code and Google Sheet IDs for the live web app have not yet been verified.
- Safety-first starter components are prototypes and must not be deployed to production.

## Security
Never commit credentials, `.clasp.json`, API keys, tokens, customer exports, personal data or actual inventory datasets.

## Next steps
1. Connect/read the existing Apps Script editor and backing spreadsheet.
2. Make a backup and map tabs/columns to business processes.
3. Implement and test reversible stock movements and idempotent document processing in isolation.
4. Review differences through pull requests; deploy only after staging checks.

_This README is a starting point, not confirmation that the stock system has been modified._
