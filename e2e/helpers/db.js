const { execFileSync } = require('node:child_process');
const { DB_CONTAINER, DB_USER, DB_NAME } = require('./env');

/** Quotes a value as a SQL string literal. */
const lit = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`);

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-tAq', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

/** Runs a SELECT and returns the rows as an array of objects. */
function rows(select) {
  const out = psql(`select coalesce(json_agg(t), '[]'::json) from (${select}) t`);
  return JSON.parse(out);
}

/** Removes everything a test created, identified by its unique chat ids. */
function deleteWhatsAppData(chatIds) {
  if (!chatIds.length) return;
  const list = chatIds.map(lit).join(',');
  psql(`delete from whatsapp_messages where chat_id in (${list}) or sender_id in (${list})`);
  psql(`delete from whatsapp_chats where chat_id in (${list})`);
}

/** Unique suffix so tests never collide with each other or with leftover data. */
const runId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

module.exports = { psql, rows, lit, deleteWhatsAppData, runId };
