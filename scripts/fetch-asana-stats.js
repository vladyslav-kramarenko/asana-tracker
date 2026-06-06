#!/usr/bin/env node
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ASANA_PAT      = process.env.ASANA_PAT;
const WORKSPACE_GID  = process.env.ASANA_WORKSPACE_GID;
const USER_GID       = process.env.ASANA_USER_GID || 'me';
const DAYS           = parseInt(process.env.DAYS || '30', 10);

if (!ASANA_PAT || !WORKSPACE_GID) {
  console.error('ERROR: Set ASANA_PAT and ASANA_WORKSPACE_GID env vars.');
  console.error('Run: node scripts/get-asana-ids.js   to find your IDs.');
  process.exit(1);
}

// ── Asana API ─────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { Authorization: `Bearer ${ASANA_PAT}`, Accept: 'application/json' },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) { reject(new Error(`Asana ${res.statusCode}: ${raw}`)); return; }
        resolve(JSON.parse(raw));
      });
    }).on('error', reject);
  });
}

async function fetchCompletedTasks(since) {
  const tasks  = [];
  let offset   = null;

  do {
    const params = new URLSearchParams({
      'assignee.any':       USER_GID,
      'completed':          'true',
      'completed_at.after': since.toISOString(),
      'opt_fields':         'gid,completed_at',
      'limit':              '100',
    });
    if (offset) params.set('offset', offset);

    const body = await get(
      `https://app.asana.com/api/1.0/workspaces/${WORKSPACE_GID}/tasks/search?${params}`,
    );
    tasks.push(...body.data);
    offset = body.next_page?.offset ?? null;
  } while (offset);

  return tasks;
}

// ── Data grouping ─────────────────────────────────────────────────────────────

function buildDailyBuckets(tasks, days) {
  // Build a map of YYYY-MM-DD → 0 for the last `days` days
  const buckets = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const task of tasks) {
    const day = task.completed_at?.slice(0, 10);
    if (day && day in buckets) buckets[day]++;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

// ── SVG chart ─────────────────────────────────────────────────────────────────

function generateSVG(data) {
  const LEFT       = 38;
  const RIGHT      = 20;
  const TOP        = 44;
  const BOTTOM     = 58;
  const BAR_AREA_H = 160;
  const SVG_H      = TOP + BAR_AREA_H + BOTTOM;

  const GAP        = 4;
  const INNER_W    = 700;
  const BAR_W      = Math.max(6, Math.floor((INNER_W - (data.length - 1) * GAP) / data.length));
  const SLOT       = BAR_W + GAP;
  const SVG_W      = LEFT + data.length * SLOT - GAP + RIGHT;

  const maxCount   = Math.max(...data.map(d => d.count), 1);
  const total      = data.reduce((s, d) => s + d.count, 0);

  // Y-axis grid + labels
  const Y_TICKS = 4;
  const grid = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
    const val = Math.round((maxCount * i) / Y_TICKS);
    const y   = TOP + BAR_AREA_H - Math.round((val / maxCount) * BAR_AREA_H);
    return [
      `<line x1="${LEFT}" y1="${y}" x2="${SVG_W - RIGHT}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`,
      `<text x="${LEFT - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#9ca3af">${val}</text>`,
    ].join('');
  });

  // X-axis label interval — avoid overlapping
  const labelEvery = data.length <= 7 ? 1 : data.length <= 14 ? 2 : data.length <= 21 ? 3 : 5;

  // Bars + labels
  const bars = data.map((d, i) => {
    const bh  = d.count === 0
      ? 2
      : Math.max(4, Math.round((d.count / maxCount) * BAR_AREA_H));
    const x   = LEFT + i * SLOT;
    const y   = TOP + BAR_AREA_H - bh;
    const cx  = x + BAR_W / 2;
    const labelY = TOP + BAR_AREA_H + 14;

    const bar = `<rect x="${x}" y="${y}" width="${BAR_W}" height="${bh}" rx="3" fill="#6366f1" opacity="${d.count === 0 ? 0.15 : 1}"/>`;

    const countLabel = (d.count > 0 && bh > 18)
      ? `<text x="${cx}" y="${y - 5}" text-anchor="middle" font-size="11" fill="#4f46e5" font-weight="600">${d.count}</text>`
      : '';

    const showXLabel = i === 0 || i === data.length - 1 || i % labelEvery === 0;
    const dateLabel  = showXLabel
      ? (() => {
          const dt = new Date(d.date + 'T12:00:00Z');
          const lbl = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return `<text x="${cx}" y="${labelY}" text-anchor="end" font-size="10" fill="#9ca3af" transform="rotate(-40 ${cx} ${labelY})">${lbl}</text>`;
        })()
      : '';

    return bar + countLabel + dateLabel;
  });

  const subtitle = `${data[0].date}  →  ${data[data.length - 1].date}  ·  ${total} tasks closed`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}">
  <style>text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }</style>
  <rect width="${SVG_W}" height="${SVG_H}" rx="10" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
  <text x="${SVG_W / 2}" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="#111827">Asana · Tasks Closed per Day</text>
  <text x="${SVG_W / 2}" y="36" text-anchor="middle" font-size="11" fill="#9ca3af">${subtitle}</text>
  ${grid.join('\n  ')}
  ${bars.join('\n  ')}
</svg>`;
}

// ── README update ─────────────────────────────────────────────────────────────

function updateReadme(chartPath) {
  const readmePath = path.join(process.cwd(), 'README.md');
  const original   = fs.readFileSync(readmePath, 'utf8');
  const rel        = path.relative(process.cwd(), chartPath).replace(/\\/g, '/');
  const timestamp  = `_Updated ${new Date().toUTCString()}_`;
  const block      = `<!-- ASANA_STATS_START -->\n![Asana Tasks per Day](${rel})\n\n${timestamp}\n<!-- ASANA_STATS_END -->`;

  const updated = original.replace(
    /<!-- ASANA_STATS_START -->[\s\S]*?<!-- ASANA_STATS_END -->/,
    block,
  );

  if (updated === original) {
    console.warn('No ASANA_STATS markers found in README.md — skipping README update.');
    return;
  }
  fs.writeFileSync(readmePath, updated, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - DAYS);

    console.log(`Fetching tasks closed by ${USER_GID} in the last ${DAYS} days…`);
    const tasks   = await fetchCompletedTasks(since);
    console.log(`Fetched ${tasks.length} completed task(s).`);

    const data    = buildDailyBuckets(tasks, DAYS);
    const total   = data.reduce((s, d) => s + d.count, 0);
    console.log(`Total: ${total} tasks across ${DAYS} days`);
    data.forEach(d => d.count && console.log(`  ${d.date}: ${d.count}`));

    const svg     = generateSVG(data);
    const outDir  = path.join(process.cwd(), 'assets');
    const outPath = path.join(outDir, 'asana-chart.svg');

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, svg, 'utf8');
    console.log(`Chart saved → ${outPath}`);

    updateReadme(outPath);
    console.log('Done.');
  } catch (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
  }
})();
