import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type CheckoutBody = {
  slug?: string;
  amount?: number;
};

function getOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutBody;
    const slug = (body.slug ?? "").trim();
    const amount = body.amount;

    if (!slug) {
      return NextResponse.json({ error: "Falta el slug." }, { status: 400 });
    }
    if (!Number.isInteger(amount) || (amount as number) < 50) {
      return NextResponse.json(
        { error: "Importe inválido (mínimo 0,50€)." },
        { status: 400 },
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Falta STRIPE_SECRET_KEY en el servidor." },
        { status: 500 },
      );
    }

    const supabaseUrl =
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Faltan credenciales de Supabase en el servidor." },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name,stripe_account_id")
      .eq("slug", slug)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "No se encontró el camarero." },
        { status: 404 },
      );
    }

    const destination = (profile as { stripe_account_id: string | null })
      .stripe_account_id;
    if (!destination) {
      return NextResponse.json(
        { error: "El camarero no tiene Stripe Connect configurado." },
        { status: 400 },
      );
    }

    const origin = getOrigin(req);
    if (!origin) {
      return NextResponse.json(
        { error: "No se pudo determinar el origen de la petición." },
        { status: 400 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      submit_type: "donate",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amount as number,
            product_data: {
              name: `Propina para ${profile.full_name ?? "camarero"}`,
            },
          },
        },
      ],
      payment_intent_data: {
        transfer_data: { destination },
        on_behalf_of: destination,
        metadata: { slug },
      },
      metadata: { slug },
      success_url: `${origin}/pay/${encodeURIComponent(
        slug,
      )}?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pay/${encodeURIComponent(slug)}?canceled=1`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

