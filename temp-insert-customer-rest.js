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

const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl || !serviceKey) {
  console.error('Missing Supabase env');
  process.exit(1);
}

async function request(pathname, options = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    console.error('Request failed', pathname, res.status, body);
    process.exit(1);
  }
  return body;
}

(async () => {
  const email = 'testcustomer@example.com';
  const userId = '00000000-0000-0000-0000-000000000001';

  try {
    const users = await request('/auth/v1/admin/users?per_page=100');
    const existingUser = users.users?.find((u) => u.email === email);
    if (!existingUser) {
      console.log('No existing auth user found; create one first in Supabase Auth UI or via admin endpoint.');
      process.exit(0);
    }
    console.log('Using auth user', existingUser.id);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  const profilePayload = [{ id: userId, full_name: 'Test Customer', email, phone: '+265991000000', role: 'customer' }];
  const customerPayload = [{ id: userId, full_name: 'Test Customer', email, phone: '+265991000000', customer_type: 'student', customer_number: 'CUST-TEST-001', email_verified: true, account_status: 'active' }];

  await request('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    body: JSON.stringify(profilePayload),
    headers: { 'Prefer': 'return=representation' },
  });

  await request('/rest/v1/customer_profiles?on_conflict=id', {
    method: 'POST',
    body: JSON.stringify(customerPayload),
    headers: { 'Prefer': 'return=representation' },
  });

  console.log('Inserted customer profile successfully');
})();
