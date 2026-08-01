const fs = require('fs');
const path = require('path');

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
const payload = [{
  id: 'e41a6e44-2176-48e4-a563-529458a9daca',
  full_name: 'Test Customer',
  email: 'testcustomer@example.com',
  phone: '+265991000000',
  customer_type: 'student',
  customer_number: 'CUST-TEST-001',
  email_verified: true,
  account_status: 'active',
}];

fetch(`${url}/rest/v1/customer_profiles?on_conflict=id`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify(payload),
})
  .then(async (res) => {
    const text = await res.text();
    console.log('status', res.status);
    console.log(text);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
