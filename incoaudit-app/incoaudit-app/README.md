# IncoAudit

A serverless-style personal expense tracker & prediction app (React web version),
built from the original SmartFin AI project documentation.

## Features
- Dashboard — cashflow trend, category breakdown, recent activity
- Digital Ledger — manual entry + simulated "Connect payment app" auto-import
  with merchant-based auto-categorization
- AI Predictive Analytics — next-month spend forecast per category (linear trend)
- Smart Alerts — budget threshold warnings per category
- Savings & Milestones — goal tracking with progress bars
- Budget settings — per-category monthly limits

## Run locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview
```

The production build is written to `dist/` and can be deployed to any static
host (Vercel, Netlify, S3 + CloudFront, GitHub Pages, etc.) or wrapped into a
mobile shell (Capacitor/React Native WebView) if you want it on a phone.

## Branding

The IncoAudit mark and wordmark live in `public/` as SVGs
(`incoaudit-icon.svg`, `incoaudit-wordmark.svg`) — the icon is wired up as
the sidebar logo and browser favicon. Both are vector, so you can resize or
recolor them in any SVG/text editor.

## Notes on the data

- All data lives in React state only — nothing persists between refreshes.
  To make it persistent, add a real backend (matches the doc's Lambda +
  DynamoDB/MongoDB design) or wire up local storage in `src/App.jsx`.
- "Connect payment app" is **simulated** — it generates mock UPI-style
  transactions and auto-categorizes them by merchant keyword. Real payment
  apps (Google Pay, PhonePe, etc.) don't expose a public API for reading a
  user's transaction history. Production apps get this data either by:
  1. Reading bank SMS/notifications on-device (Android, with user permission), or
  2. India's RBI-regulated Account Aggregator framework (consent-based bank
     data sharing via providers like Setu, Anumati, CAMS Finserv).
  Swap `fetchMockPaymentFeed()` in `src/App.jsx` for either integration —
  everything downstream (parsing, categorization, review UI) stays the same.
