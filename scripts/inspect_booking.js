// Node script to inspect booking and settings via Supabase Admin client
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/inspect_booking.js <BOOKING_ID>

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run(id) {
  const { data: booking } = await supabase.from('bookings').select('*').eq('booking_id', id).maybeSingle();
  console.log('Booking:', booking);

  const { data: settings } = await supabase.from('settings').select('routes, booking_fee').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  console.log('Settings:', settings);

  const routesText = typeof settings?.routes === 'string' ? settings.routes : '';
  console.log('Routes sample lines:', routesText.split(/\r?\n/).slice(0,10));
}

run(process.argv[2]).catch((e) => { console.error(e); process.exit(1); });
