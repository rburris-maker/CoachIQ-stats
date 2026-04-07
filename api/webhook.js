const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Disable body parsing so we can verify Stripe signature
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe    = Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase  = createClient(
    'https://lfhbkvdfxlawwwxtvwmj.supabase.co',
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const session      = event.data.object;
  const userId       = session.metadata?.userId;
  const teamId       = session.metadata?.teamId;
  const customerId   = session.customer;
  const subscriptionId = session.subscription;

  try {
    if (event.type === 'checkout.session.completed') {
      // Mark team as pro
      if (teamId) {
        await supabase.from('teams')
          .update({
            subscription_status: 'pro',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          })
          .eq('id', teamId);
      }
      console.log(`✓ Team ${teamId} upgraded to Pro`);

    } else if (event.type === 'customer.subscription.deleted') {
      // Subscription cancelled — downgrade
      await supabase.from('teams')
        .update({ subscription_status: 'free' })
        .eq('stripe_customer_id', customerId);
      console.log(`✓ Customer ${customerId} downgraded to Free`);

    } else if (event.type === 'invoice.payment_failed') {
      // Payment failed — could notify coach here in future
      console.log(`Payment failed for customer ${customerId}`);
    }
  } catch (err) {
    console.error('Supabase update error:', err);
    return res.status(500).json({ error: 'Database update failed' });
  }

  return res.status(200).json({ received: true });
};
