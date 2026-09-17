/** Estilos del manual: sirven en la página y en el HTML descargable. */
export const MANUAL_CSS = `
  :root {
    --sv-teal: #0d9488;
    --sv-teal-dark: #0f766e;
    --sv-ink: #134e4a;
    --sv-muted: #5b6b6a;
    --sv-line: #ccfbf1;
    --sv-soft: #f0fdfa;
    --sv-paper: #f7fbfa;
    --sv-card: #ffffff;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--sv-paper);
    color: var(--sv-ink);
    font-family: "Segoe UI", "DM Sans", system-ui, sans-serif;
    line-height: 1.55;
  }
  .sv-manual {
    max-width: 920px;
    margin: 0 auto;
    padding: 32px 24px 80px;
  }
  .sv-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
    margin-bottom: 20px;
  }
  .sv-toolbar a, .sv-toolbar button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid #99f6e4;
    background: #fff;
    color: var(--sv-teal-dark);
    font: 600 14px/1 "Segoe UI", system-ui, sans-serif;
    text-decoration: none;
    cursor: pointer;
  }
  .sv-toolbar a.primary, .sv-toolbar button.primary {
    background: var(--sv-teal);
    border-color: var(--sv-teal);
    color: #fff;
  }
  .sv-cover {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 28px;
    align-items: center;
    background: linear-gradient(135deg, #0f766e 0%, #0d9488 55%, #14b8a6 100%);
    color: #fff;
    border-radius: 24px;
    padding: 28px;
    overflow: hidden;
  }
  .sv-cover img {
    width: 220px;
    height: 220px;
    object-fit: cover;
    border-radius: 18px;
    box-shadow: 0 16px 40px rgba(0,0,0,.22);
    background: #fff;
  }
  .sv-cover h1 {
    font-family: Georgia, "Fraunces", serif;
    font-size: 38px;
    line-height: 1.1;
    margin: 10px 0 8px;
  }
  .sv-cover p { margin: 0; color: rgba(255,255,255,.9); }
  .sv-kicker {
    display: inline-block;
    font-size: 12px;
    letter-spacing: .12em;
    text-transform: uppercase;
    opacity: .85;
  }
  .sv-toc {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    margin: 28px 0;
    padding: 20px 24px;
    background: var(--sv-card);
    border: 1px solid var(--sv-line);
    border-radius: 16px;
  }
  .sv-toc a {
    color: var(--sv-teal-dark);
    text-decoration: none;
    font-size: 14px;
  }
  .sv-toc a:hover { text-decoration: underline; }
  .sv-section {
    margin-top: 40px;
    padding-top: 8px;
    break-inside: avoid;
  }
  .sv-section h2 {
    font-family: Georgia, "Fraunces", serif;
    font-size: 26px;
    margin: 0 0 12px;
    color: var(--sv-ink);
  }
  .sv-section h3 {
    font-size: 17px;
    margin: 22px 0 8px;
    color: var(--sv-teal-dark);
  }
  .sv-section p, .sv-section li { color: #334155; }
  .sv-split {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 22px;
    align-items: start;
    margin: 16px 0 8px;
  }
  .sv-split img {
    width: 200px;
    height: 200px;
    object-fit: cover;
    border-radius: 16px;
    border: 1px solid var(--sv-line);
    background: #fff;
  }
  .sv-mock {
    margin: 18px 0;
    width: 100%;
    height: auto;
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(15, 118, 110, .12);
    background: #fff;
  }
  .sv-steps {
    margin: 8px 0 0;
    padding-left: 20px;
  }
  .sv-steps li { margin: 6px 0; }
  .sv-callout {
    margin: 16px 0;
    padding: 14px 16px;
    background: var(--sv-soft);
    border-left: 4px solid var(--sv-teal);
    border-radius: 0 12px 12px 0;
    font-size: 14px;
  }
  .sv-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .sv-card {
    background: var(--sv-card);
    border: 1px solid var(--sv-line);
    border-radius: 14px;
    padding: 14px 16px;
  }
  .sv-card strong { color: var(--sv-ink); display: block; margin-bottom: 4px; }
  .sv-card span { font-size: 13px; color: var(--sv-muted); }
  table.sv-roles {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
  }
  table.sv-roles th, table.sv-roles td {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid var(--sv-line);
  }
  table.sv-roles th { background: var(--sv-soft); color: var(--sv-teal-dark); }
  .sv-footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid var(--sv-line);
    font-size: 13px;
    color: var(--sv-muted);
  }
  .sv-cover-superadmin {
    background: linear-gradient(135deg, #0f172a 0%, #134e4a 45%, #0d9488 100%);
  }
  .sv-cover-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 220px;
    height: 220px;
    border-radius: 18px;
    background: rgba(15, 23, 42, .55);
    border: 1px solid rgba(153, 246, 228, .35);
    color: #99f6e4;
    font: 700 64px/1 Georgia, serif;
    letter-spacing: .04em;
    box-shadow: 0 16px 40px rgba(0,0,0,.28);
  }
  .sv-figure {
    margin: 18px 0 8px;
  }
  .sv-figure svg {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(15, 118, 110, .12);
  }
  .sv-figure figcaption {
    margin-top: 8px;
    font-size: 12px;
    color: var(--sv-muted);
  }
  .sv-section code {
    font-size: 12px;
    background: var(--sv-soft);
    padding: 1px 6px;
    border-radius: 4px;
  }
  @media (max-width: 720px) {
    .sv-cover, .sv-split, .sv-toc, .sv-grid-2 { grid-template-columns: 1fr; }
    .sv-cover img, .sv-split img, .sv-cover-badge { width: 100%; height: auto; aspect-ratio: 1; }
    .sv-cover h1 { font-size: 28px; }
  }
  @media print {
    body { background: #fff; }
    .sv-toolbar { display: none !important; }
    .sv-manual { padding: 0; max-width: none; }
    .sv-cover { break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    a { color: inherit; text-decoration: none; }
  }
  @page { size: A4; margin: 12mm; }
`;
