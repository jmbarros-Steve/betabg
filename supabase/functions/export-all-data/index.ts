import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABLES = [
  "clients",
  "user_roles",
  "buyer_personas",
  "platform_connections",
  "client_credits",
  "client_financial_config",
  "brand_research",
  "ad_creatives",
  "ad_assets",
  "ad_references",
  "saved_meta_copies",
  "saved_google_copies",
  "email_templates",
  "email_campaigns",
  "klaviyo_email_plans",
  "campaign_metrics",
  "campaign_recommendations",
  "competitor_tracking",
  "competitor_ads",
  "client_assets",
  "steve_conversations",
  "steve_messages",
  "steve_feedback",
  "steve_knowledge",
  "steve_bugs",
  "steve_training_examples",
  "steve_training_feedback",
  "credit_transactions",
  "platform_metrics",
  "time_entries",
  "invoices",
  "blog_posts",
  "study_resources",
  "subscription_plans",
  "user_subscriptions",
  "learning_queue",
  "oauth_states",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const dump: Record<string, any> = {
      exported_at: new Date().toISOString(),
      project_ref: supabaseUrl,
      tables: {},
    };

    for (const table of TABLES) {
      try {
        const { data, error } = await supabase.from(table).select("*");
        if (error) {
          dump.tables[table] = { error: error.message, count: 0 };
        } else {
          dump.tables[table] = { data, count: data?.length || 0 };
        }
      } catch (e) {
        dump.tables[table] = { error: String(e), count: 0 };
      }
    }

    // Also export auth.users via admin API
    try {
      const { data: { users }, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (error) {
        dump.tables["auth_users"] = { error: error.message, count: 0 };
      } else {
        dump.tables["auth_users"] = {
          data: users.map((u) => ({
            id: u.id,
            email: u.email,
            raw_user_meta_data: u.user_metadata,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
          })),
          count: users.length,
        };
      }
    } catch (e) {
      dump.tables["auth_users"] = { error: String(e), count: 0 };
    }

    // Summary
    dump.summary = {};
    for (const [table, info] of Object.entries(dump.tables)) {
      dump.summary[table] = (info as any).count;
    }

    return new Response(JSON.stringify(dump, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=supabase-dump.json",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
