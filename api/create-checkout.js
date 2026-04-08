import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { userId, email, teamId, tier } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: 'Missing userId or email' });
    }

    const priceId = tier === 'elite'
      ? process.env.STRIPE_ELITE_PRICE_ID
      : process.env.STRIPE_PRICE_ID;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, teamId: teamId || '', tier: tier || 'pro' },
      allow_promotion_codes: true,
      success_url: `${req.headers.origin || 'https://coachiqsoccer.vercel.app'}/?upgraded=true`,
      cancel_url:  `${req.headers.origin || 'https://coachiqsoccer.vercel.app'}/?upgraded=false`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
