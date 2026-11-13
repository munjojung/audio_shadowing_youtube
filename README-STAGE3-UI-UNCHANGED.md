# Stage 3: Original player UI unchanged

This patch intentionally does NOT contain or modify `index.html`.

## Added files
- `contents.html`: independent learner catalog; uses existing `/api/contents`, links to `/?content=<id>`.
- `admin-upload.html`: administrator UI served by a localhost-only server.
- `scripts/admin-upload-server.js`: local upload server; calls existing `scripts/register-content.js`.

## Apply
Extract into `C:\python_workspace\audio_shadowing_youtube`, preserving folders. `index.html` is not included and must remain unchanged.

## Local admin
In PowerShell with `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_UPLOAD_ACCESS_KEY_ID`, and `R2_UPLOAD_SECRET_ACCESS_KEY` set, run:

`node .\scripts\admin-upload-server.js`

Open the exact `http://127.0.0.1:43187/#...` URL printed by the process on the same PC. Keep the token private. Never deploy this local server as a public service.

After successful upload, review and commit `data/content-catalog.json` and push to deploy. The admin page does not automatically commit/push.

## Learner catalog
Once pushed and deployed, open `https://shadowing-player-pro.vercel.app/contents.html`. It opens the existing player at `/?content=<id>`.

## Notes
- R2 partial uploads may remain after a failed registration; inspect before retrying.
- Preserve any pre-existing unrelated changes in the repository.
- Full end-to-end tests and live admin uploads are not yet verified.
