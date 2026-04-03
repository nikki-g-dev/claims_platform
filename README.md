# Claims Platform (Full-Stack)

Claims Platform is a full-stack claims dashboard with an Express + SQLite API and a rich browser UI.

## Features

- API-backed claims CRUD with seeded demo data
- Portfolio stats, review queue with search/filter, claim detail workspace
- Intake form creates claims server-side; insights derive from live data
- Server stores data in SQLite (`data/claims.db`)

## Run locally

```bash
npm install
npm run dev    # starts Express at http://localhost:3000
```

Open http://localhost:3000 to use the app.

## API (summary)
- `GET /api/claims` – list claims
- `GET /api/claims/:id` – claim detail
- `POST /api/claims` – create
- `PATCH /api/claims/:id` – update
- `POST /api/seed` – reset demo data

## Deploy
- Any Node host works (Render/Fly/Railway/Heroku). Start command: `npm start`. Ensure `data/` persists if you want durable storage. 
