const { execSync } = require("child_process");
const { Pool } = require("pg");
(async () => {
  const raw = execSync("gcloud secrets versions access latest --secret=w4y-web-database-url", { encoding: "utf8" }).trim();
  const url = raw.replace(/@[^/]+/, "@127.0.0.1:5434");
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 15000 });
  const before = await pool.query("SELECT email, tenant_id FROM users ORDER BY email");
  const apps = await pool.query("SELECT DISTINCT fly_app FROM instances WHERE fly_app IS NOT NULL AND fly_app <> '' ORDER BY 1");
  console.log("BEFORE users:", before.rows.map(r => r.email).join(", ") || "(none)");
  console.log("BEFORE fly apps:", apps.rows.map(r => r.fly_app).join(", ") || "(none)");
  await pool.query("BEGIN");
  for (const q of [
    "DELETE FROM run_events",
    "DELETE FROM messages",
    "DELETE FROM artifacts",
    "DELETE FROM runs",
    "DELETE FROM agents",
    "DELETE FROM instances",
    "DELETE FROM billing_events",
    "DELETE FROM billing",
    "DELETE FROM users",
  ]) await pool.query(q);
  await pool.query("COMMIT");
  const left = await pool.query("SELECT COUNT(*)::text AS c FROM users");
  console.log("users remaining:", left.rows[0].c);
  await pool.end();
  if (left.rows[0].c !== "0") process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });