const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve('.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const userId = 'e41a6e44-2176-48e4-a563-529458a9daca';

  const profileInsert = await supabase.from('profiles').upsert([
    { id: userId, full_name: 'Test Customer', email: 'testcustomer@example.com', phone: '+265991000000', role: 'customer' },
  ], { onConflict: 'id' });

  if (profileInsert.error) {
    console.error('profiles error', profileInsert.error.message);
    process.exit(1);
  }

  const customerInsert = await supabase.from('customer_profiles').upsert([
    {
      id: userId,
      full_name: 'Test Customer',
      email: 'testcustomer@example.com',
      phone: '+265991000000',
      customer_type: 'student',
      customer_number: 'CUST-TEST-001',
      email_verified: true,
      account_status: 'active',
    },
  ], { onConflict: 'id' });

  if (customerInsert.error) {
    console.error('customer_profiles error', customerInsert.error.message);
    process.exit(1);
  }

  console.log('Inserted successfully for', userId);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
