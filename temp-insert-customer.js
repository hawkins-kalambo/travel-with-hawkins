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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const email = 'testcustomer@example.com';
  const password = 'TestPass123!';

  let userId = null;

  try {
    const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      console.error('listUsers error', listErr.message);
      process.exit(1);
    }

    const existingUser = usersData?.users?.find((u) => u.email === email);
    if (existingUser?.id) {
      userId = existingUser.id;
    } else {
      const { data: createdData, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Test Customer', role: 'customer' },
      });

      if (createErr) {
        console.error('createUser error', createErr.message);
        process.exit(1);
      }

      userId = createdData.user?.id ?? null;
    }
  } catch (e) {
    console.error('user lookup exception', e.message);
    process.exit(1);
  }

  if (!userId) {
    console.error('No auth user ID resolved');
    process.exit(1);
  }

  const profileInsert = await supabase.from('profiles').upsert([{ id: userId, full_name: 'Test Customer', email, phone: '+265991000000', role: 'customer' }], { onConflict: 'id' });
  if (profileInsert.error) {
    console.error('profiles insert error', profileInsert.error.message);
    process.exit(1);
  }

  const customerInsert = await supabase.from('customer_profiles').upsert([{ id: userId, full_name: 'Test Customer', email, phone: '+265991000000', customer_type: 'student', customer_number: 'CUST-TEST-001', email_verified: true, account_status: 'active' }], { onConflict: 'id' });
  if (customerInsert.error) {
    console.error('customer_profiles insert error', customerInsert.error.message);
    process.exit(1);
  }

  console.log('Inserted customer profile successfully for user', userId);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
