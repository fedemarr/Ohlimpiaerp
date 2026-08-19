const { Client } = require('pg');
(async () => {
  const client = new Client({
    host: 'aws-1-us-east-2.pooler.supabase.com',
    port: 6543,
    user: 'postgres.caeqsieiuunqvicfpudu',
    password: 'Loscedros10',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const r = await client.query(
    `SELECT id, email, banned_until, email_confirmed_at, updated_at, last_sign_in_at FROM auth.users WHERE email = 'fede@ohlimpia.com'`
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await client.end();
})().catch(e => { console.error(e.message); process.exit(1); });
