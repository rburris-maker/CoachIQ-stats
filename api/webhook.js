import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    'https://lfhbkvdfxlawwwxtvwmj.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const obj            = event.data.object;
  const customerId     = obj.customer;
  const subscriptionId = obj.subscription;
  const userId         = obj.metadata?.userId;
  const tier           = obj.metadata?.tier || 'pro';

  try {
    if (event.type === 'checkout.session.completed') {
      if (userId) {
        await supabase.from('teams').update({
          subscription_status: tier,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        }).eq('user_id', userId);
      }
    } else if (event.type === 'customer.subscription.deleted') {
      await supabase.from('teams')
        .update({ subscription_status: 'free' })
        .eq('stripe_customer_id', customerId);
    }
  } catch (err) {
    console.error('Supabase update error:', err);
    return res.status(500).json({ error: 'Database update failed' });
  }

  return res.status(200).json({ received: true });
}
