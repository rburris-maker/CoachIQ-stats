import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
    const supabase = createClient(
      'https://lfhbkvdfxlawwwxtvwmj.supabase.co',
      process.env.SUPABASE_SERVICE_KEY
    );

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    // Get stripe customer id from any of user's teams
    const { data: teams } = await supabase
      .from('teams')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .not('stripe_customer_id', 'is', null)
      .limit(1);

    const customerId = teams?.[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: 'No subscription found' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: req.headers.origin || 'https://coachiqsoccer.vercel.app',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    return res.status(500).json({ error: err.message });
  }
}