import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function findAuthUserByEmail(email) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail) return null;

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (!profileErr && profile?.id) return profile.id;

  let page = 1;
  while (page > 0) {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 100, page });
    if (error) {
      console.error('Auth listUsers failed', error.message || error);
      break;
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find((user) => typeof user.email === 'string' && user.email.trim().toLowerCase() === normalizedEmail);
    if (found?.id) return found.id;
    page = Number(data?.nextPage ?? 0);
    if (!page) break;
  }

  return null;
}

async function findAuthUserById(userId) {
  if (!userId) return null;

  if (typeof supabase.auth.admin.getUserById === 'function') {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (!error && data?.user?.id) return data.user.id;
  }

  let page = 1;
  while (page > 0) {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 100, page });
    if (error) {
      console.error('Auth listUsers failed', error.message || error);
      break;
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find((user) => user.id === userId);
    if (found?.id) return found.id;

    page = Number(data?.nextPage ?? 0);
    if (!page) break;
  }

  return null;
}

async function ensureProfileForAmbassador(userId, ambassador) {
  if (!userId) return;

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    console.error('Failed to query profile for ambassador', userId, profileErr.message || profileErr);
    return;
  }

  if (profile?.id) return;

  const payload = {
    id: userId,
    full_name: ambassador.full_name || null,
    email: ambassador.email || null,
    phone: ambassador.phone || null,
    role: 'ambassador',
  };

  const { error: insertError } = await supabase.from('profiles').insert([payload]);
  if (insertError) {
    console.error('Failed to create missing profile for ambassador', userId, insertError.message || insertError);
  } else {
    console.log('Created missing profile for ambassador', userId);
  }
}

async function repairAmbassadors() {
  const { data: ambassadors, error } = await supabase
    .from('ambassadors')
    .select('id, email, phone, full_name, user_id');

  if (error) {
    console.error('Failed to query ambassadors', error.message || error);
    process.exit(1);
  }

  const rows = Array.isArray(ambassadors) ? ambassadors : [];
  if (rows.length === 0) {
    console.log('No ambassadors found.');
    return;
  }

  console.log(`Found ${rows.length} ambassadors. Starting repair pass.`);

  for (const ambassador of rows) {
    const currentUserId = typeof ambassador.user_id === 'string' ? ambassador.user_id : null;
    let resolvedUserId = currentUserId;

    if (currentUserId) {
      const validUserId = await findAuthUserById(currentUserId);
      if (!validUserId) {
        console.warn('Ambassador user_id is invalid; attempting email lookup', ambassador.id, currentUserId);
        resolvedUserId = null;
      }
    }

    if (!resolvedUserId) {
      const email = typeof ambassador.email === 'string' ? ambassador.email.trim().toLowerCase() : null;
      if (!email) {
        console.warn('Skipping ambassador with no email and invalid user_id', ambassador.id);
        continue;
      }
      resolvedUserId = await findAuthUserByEmail(email);
      if (!resolvedUserId) {
        console.warn('Could not resolve auth user for ambassador email', ambassador.id, email);
        continue;
      }

      const { data: updated, error: updateError } = await supabase
        .from('ambassadors')
        .update({ user_id: resolvedUserId, updated_at: new Date().toISOString() })
        .eq('id', ambassador.id)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update ambassador user_id', ambassador.id, resolvedUserId, updateError.message || updateError);
        continue;
      }

      console.log('Repaired ambassador user_id', ambassador.id, resolvedUserId, updated);
    }

    await ensureProfileForAmbassador(resolvedUserId, ambassador);
  }
}

repairAmbassadors()
  .then(() => {
    console.log('Ambassador repair process completed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Ambassador repair script failed', err);
    process.exit(1);
  });
