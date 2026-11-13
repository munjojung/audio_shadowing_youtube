# Shadowing Player Pro — R2 integration (initial test)

## Contents
- `index.html`: modified directly from the user-uploaded `index(2).html` (90,203 bytes). Existing HTML layout and controls retained.
- `api/content-url.js`: Vercel Node function, short-lived presigned R2 GET URL.
- `package.json`: server SDK dependencies.

## Installation
1. Back up the repository's current `index.html` and compare it with this package before replacing it. This package was NOT built from a live clone of the current GitHub main branch.
2. Copy files to repository root. Do not overwrite an existing package.json without merging dependencies.
3. `npm install`
4. `git diff --check` and review `git diff` before committing.
5. Deploy a Preview branch first; Production environment variables need to be available to the Preview environment too, or test with Production after explicit approval.

## Vercel server environment variables
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=shadowing-content`.
Do not put secrets into browser JavaScript or Git.

## R2 CORS (bucket Settings)
Replace origin with the actual deployment domain:
```json
[
  {
    "AllowedOrigins": ["https://shadowing-player-pro.vercel.app"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
For preview testing, add the specific preview origin, not `*`.

## URL
`https://shadowing-player-pro.vercel.app/?content=TSIgstxOCwY`

## Security limitations
This is a proof-of-concept for content intended to be shareable. The API only allows one hardcoded content ID and 3 file types; however it is NOT authenticated. Anyone can request a short-lived link for that approved content. Do not use this for paid/private materials without adding learner authorization, throttling, and auditing.
The MP3 presigned URL expires after 15 minutes. Long playback sessions or seeking after expiry may fail. Production should implement refresh on expiry and test mobile Range requests.

## Checks performed
- Node syntax check of `api/content-url.js`.
- Node syntax check of every inline JavaScript block in `index.html`.
- No live R2, Vercel or browser E2E test performed.
