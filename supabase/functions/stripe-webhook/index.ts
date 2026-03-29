import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify webhook signature
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('Missing stripe-signature', { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    console.log(`Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const planSlug = session.metadata?.plan_slug;
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        if (!userId || !planSlug) {
          console.error('Missing metadata in checkout session');
          break;
        }

        // Get plan ID from subscription_plans
        const { data: plan } = await supabase
          .from('subscription_plans')
          .select('id')
          .eq('slug', planSlug)
          .single();

        if (!plan) {
          console.error(`Plan not found: ${planSlug}`);
          break;
        }

        // Get subscription details for period dates
        let periodStart: string | null = null;
        let periodEnd: string | null = null;
        if (stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          periodStart = new Date(sub.current_period_start * 1000).toISOString();
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        }

        // Upsert user_subscription
        const { data: existingSub } = await supabase
          .from('user_subscriptions')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .limit(1)
          .single();

        if (existingSub) {
          await supabase
            .from('user_subscriptions')
            .update({
              plan_id: plan.id,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              status: 'active',
            })
            .eq('id', existingSub.id);
        } else {
          await supabase
            .from('user_subscriptions')
            .insert({
              user_id: userId,
              plan_id: plan.id,
              status: 'active',
              credits_used: 0,
              credits_reset_at: new Date().toISOString(),
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              current_period_start: periodStart,
              current_period_end: periodEnd,
            });
        }

        console.log(`User ${userId} upgraded to ${planSlug}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;

        // Update period dates
        const periodStart = new Date(subscription.current_period_start * 1000).toISOString();
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await supabase
          .from('user_subscriptions')
          .update({
            current_period_start: periodStart,
            current_period_end: periodEnd,
            status: subscription.status === 'active' ? 'active' : 'inactive',
          })
          .eq('stripe_subscription_id', stripeSubId);

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;

        // Downgrade to Visual plan
        const { data: visualPlan } = await supabase
          .from('subscription_plans')
          .select('id')
          .eq('slug', 'visual')
          .single();

        if (visualPlan) {
          await supabase
            .from('user_subscriptions')
            .update({
              plan_id: visualPlan.id,
              stripe_subscription_id: null,
              current_period_start: null,
              current_period_end: null,
              status: 'active',
            })
            .eq('stripe_subscription_id', stripeSubId);
        }

        console.log(`Subscription ${stripeSubId} cancelled — downgraded to Visual`);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('stripe-webhook error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
