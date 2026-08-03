/**
 * What the API serves at `/`.
 *
 * The dashboard itself is a page on the site (`/dashboard`), built with the
 * same design system as everything else. This is only a signpost, so nobody
 * hitting the API port in a browser sees a bare 404 and assumes it is broken.
 */
export function landing(base: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ShipIT Forge — usage API</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#07070a; color:#f5f6fa;
    font-family:'Segoe UI',system-ui,-apple-system,sans-serif; letter-spacing:-.01em; }
  main { max-width:520px; padding:32px; }
  h1 { font-size:19px; margin:0 0 10px; letter-spacing:-.02em; }
  p { color:#8a8d99; line-height:1.6; font-size:14px; margin:0 0 14px; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px;
    background:rgba(255,255,255,.06); border-radius:6px; padding:2px 6px; }
  ul { color:#8a8d99; font-size:13px; line-height:1.9; padding-left:18px; margin:0; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#34d399; margin-right:8px; }
</style></head>
<body><main>
  <h1><span class="dot"></span>Usage API is running</h1>
  <p>The dashboard is a page on the ShipIT Forge site. Open <code>/dashboard</code> there and point it at
     <code>${base}</code> under <b>Connection</b>.</p>
  <p>Endpoints on this server:</p>
  <ul>
    <li><code>/api/summary</code> — totals for a window</li>
    <li><code>/api/daily</code> — cost and volume per day</li>
    <li><code>/api/breakdown?by=flow</code> — grouped by any dimension</li>
    <li><code>/api/tools</code>, <code>/api/tools/trend</code> — reliability</li>
    <li><code>/api/runs</code>, <code>/api/runs/:id</code> — the run log</li>
    <li><code>/api/findings</code>, <code>/api/facets</code></li>
  </ul>
</main></body></html>`;
}
