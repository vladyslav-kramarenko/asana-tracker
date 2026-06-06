#!/usr/bin/env node
/**
 * One-time setup helper.
 * Run locally:  ASANA_PAT=your_token node scripts/get-asana-ids.js
 * Prints your user GID and all workspace GIDs so you can set the GitHub secrets.
 */
'use strict';

const https = require('https');

const PAT = process.env.ASANA_PAT;
if (!PAT) {
  console.error('Set ASANA_PAT first:  ASANA_PAT=0/abc123... node scripts/get-asana-ids.js');
  process.exit(1);
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Bearer ${PAT}`, Accept: 'application/json' } }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${raw}`));
        else resolve(JSON.parse(raw));
      });
    }).on('error', reject);
  });
}

(async () => {
  try {
    const me         = await get('https://app.asana.com/api/1.0/users/me?opt_fields=gid,name,email,workspaces');
    const user       = me.data;

    console.log('\n=== Your Asana IDs ===\n');
    console.log(`Name:      ${user.name}`);
    console.log(`Email:     ${user.email}`);
    console.log(`ASANA_USER_GID:  ${user.gid}\n`);

    console.log('Workspaces:');
    for (const ws of user.workspaces) {
      const detail = await get(`https://app.asana.com/api/1.0/workspaces/${ws.gid}?opt_fields=gid,name`);
      console.log(`  ${detail.data.name}`);
      console.log(`  ASANA_WORKSPACE_GID: ${detail.data.gid}\n`);
    }

    console.log('Copy the GIDs above into your GitHub repository secrets:');
    console.log('  Settings → Secrets and variables → Actions → New repository secret');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
