# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`olola-proxytest` is a tiny two-piece project that lets a browser-side dashboard talk to the [Cafe24 Admin API](https://developers.cafe24.com/) for the OLOLA store (mall ID `hmkco2030`):

- `api/cafe24.js` — a Vercel serverless function that acts as a CORS-friendly pass-through proxy to `https://{mallid}.cafe24api.com/api/v2/{path}`.
- `public/index.html` — a single-page Korean-language live dashboard ("OLOLA LIVE DASHBOARD") that calls the deployed proxy to render products / orders / customers and a few headline stats.
- `vercel.json` — declares the function (128 MB memory, 10 s max duration).
- `package.json` — metadata only. There are **no dependencies, no build step, no tests, and no scripts**.

## How the two halves talk to each other

The frontend never calls Cafe24 directly. It hits the proxy with two pieces of info:

1. `mallid` and `path` as **query-string params** (`?mallid=hmkco2030&path=products&limit=20&...`). Any extra query params are forwarded verbatim to Cafe24.
2. The Cafe24 OAuth access token as an **`Authorization: Bearer …` header**, which the proxy forwards untouched.

The proxy itself holds no secrets — the access token is typed into the dashboard at runtime and lives only in the browser tab. Cafe24 tokens expire after ~2 hours; the UI tells the user to refresh manually.

`PROXY` and `mallId` are hardcoded in `public/index.html` (the deployed URL `https://olola-proxytest-6fx5.vercel.app/api/cafe24` and `hmkco2030`). When the Vercel project name or deployment URL changes, update the `PROXY` constant in `public/index.html`.

## Working in this repo

- **Run locally:** use `vercel dev` (Vercel CLI) from the repo root if you need to exercise the function. There is no `npm start`, `npm test`, or lint config — don't invent one unless asked.
- **Deploy:** Vercel auto-deploys from the connected GitHub repo. The serverless function is exposed at `/api/cafe24`; static files in `public/` are served at the root (`/`, `/index.html`).
- **Currently only `GET` (plus `OPTIONS` preflight) is supported by the proxy.** Adding POST/PUT/DELETE means changing both `Access-Control-Allow-Methods` and the `fetch()` call in `api/cafe24.js` (which today drops the request body).
- The function uses ES module syntax (`export default async function handler`). Vercel infers this from `package.json` / file location — don't add a separate `"type": "module"` unless you have a reason.

## Conventions worth preserving

- **Korean UI copy and inline code comments are intentional.** Keep new user-facing strings in Korean to match the rest of the dashboard.
- The dashboard is a **single self-contained `index.html`** — no bundler, no framework, no external JS/CSS. New features should keep that constraint unless the user explicitly opts into tooling.
- Error responses from the proxy return `{ error: "..." }` (and sometimes `error_description` from Cafe24). The client checks `d?.error` and surfaces `error_description || error`; preserve that shape when editing either side.
