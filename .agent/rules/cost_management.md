# 💰 Cost and Resource Management

As an AI assistant, you must be extremely mindful of API costs, usage limits, and cloud resource consumption.

## ☁️ Bytescale & Cloud Storage
- **Avoid Redundant Uploads**: Always check if a file has already been uploaded or if a URL mapping exists before triggering a new upload.
- **Selective Syncing**: Only upload file types that are essential for the application's current features (e.g., skip filters or secondary images unless explicitly requested).
- **Batching**: Group operations when possible to minimize the number of API calls.
- **Dry-runs**: When unsure about the volume of data, offer a "dry-run" summary to the user before executing bulk operations.

## 🔑 API Requests
- **Minimize Calls**: Avoid calling external APIs inside high-frequency loops.
- **Caching**: Reuse results from previous calls within the same session if the data is unlikely to have changed.

## 💾 Database Operations
- **Bulk Updates**: Use `upsertMany` or `updateMany` (if supported) instead of individual calls in a loop for large datasets.
- **Cleanup**: Do not leave temporary large files or database records after processing.
- **Backups**: Always run `node scripts/backup_snapshot.js` before destructive operations.
- **Transaction Timeout**: Use `{ timeout: 60000 }` or higher for transactions with many operations (e.g., moving/deleting 50+ images).
- **Preview First**: All scripts must support `--preview` mode. ALWAYS preview before `--execute`.
