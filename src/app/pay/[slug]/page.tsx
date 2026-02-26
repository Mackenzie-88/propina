"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Profile = {
  full_name: string | null;
  avatar_url: string | null;
};

function formatEuro(amountCents: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function parseEuroToCents(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const euros = Number.parseFloat(normalized);
  if (!Number.isFinite(euros)) return null;
  return Math.round(euros * 100);
}

export default function PayPage({ params }: { params: { slug: string } }) {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "1";
  const canceled = searchParams.get("canceled") === "1";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const presetAmounts = useMemo(() => [200, 500, 1000], []);
  const [selectedPreset, setSelectedPreset] = useState<number>(presetAmounts[0]);
  const [customAmount, setCustomAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const envProblem = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return "Faltan variables de entorno de Supabase.";
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingProfile(true);
      setPageError(null);

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        setLoadingProfile(false);
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name,avatar_url")
        .eq("slug", params.slug)
        .single();

      if (cancelled) return;
      if (error) {
        setPageError("No pudimos cargar los datos del camarero.");
        setProfile(null);
      } else {
        setProfile((data ?? null) as Profile | null);
      }
      setLoadingProfile(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  const effectiveAmountCents = useMemo(() => {
    const custom = parseEuroToCents(customAmount);
    if (customAmount.trim() !== "") return custom;
    return selectedPreset;
  }, [customAmount, selectedPreset]);

  async function onSubmit() {
    setSubmitError(null);

    if (!effectiveAmountCents || effectiveAmountCents < 50) {
      setSubmitError("Introduce un importe válido (mínimo 0,50€).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: params.slug,
          amount: effectiveAmountCents,
        }),
      });

      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error || "No se pudo iniciar el pago.");
      }

      window.location.assign(body.url);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Error inesperado.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-gradient-to-b from-white to-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        {success ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-sm">
            ¡Gracias! Tu propina se ha enviado correctamente.
          </div>
        ) : null}
        {canceled ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">
            Pago cancelado. Si quieres, puedes intentarlo de nuevo.
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name ?? "Camarero"}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>

            <div className="min-w-0">
              <p className="text-sm text-slate-500">Enviar propina a</p>
              <h1 className="truncate text-xl font-semibold text-slate-900">
                {loadingProfile ? "Cargando..." : profile?.full_name ?? "Camarero"}
              </h1>
            </div>
          </div>

          {envProblem ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {envProblem} Revisa tu `.env` (ver `.env.example`).
            </div>
          ) : pageError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {pageError}
            </div>
          ) : null}

          <div className="mt-6">
            <p className="text-sm font-medium text-slate-700">Importe</p>

            <div className="mt-3 grid grid-cols-3 gap-3">
              {presetAmounts.map((amt) => {
                const active = customAmount.trim() === "" && selectedPreset === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(amt);
                      setCustomAmount("");
                    }}
                    className={[
                      "rounded-2xl border px-3 py-3 text-base font-semibold shadow-sm transition",
                      active
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {formatEuro(amt)}
                  </button>
                );
              })}

              <div className="col-span-3">
                <label className="mt-2 block text-sm text-slate-600">
                  Otro importe
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-slate-400">
                  <span className="text-slate-500">€</span>
                  <input
                    inputMode="decimal"
                    placeholder="Ej: 7,50"
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setSelectedPreset(0);
                    }}
                    className="w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Pago rápido con Apple Pay / Google Pay cuando esté disponible.
                </p>
              </div>
            </div>
          </div>

          {submitError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {submitError}
            </div>
          ) : null}

          <button
            type="button"
            disabled={submitting || !!envProblem || !!pageError || loadingProfile}
            onClick={onSubmit}
            className={[
              "mt-6 w-full rounded-2xl px-5 py-4 text-lg font-semibold shadow-sm transition",
              submitting || !!envProblem || !!pageError || loadingProfile
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800",
            ].join(" ")}
          >
            {submitting
              ? "Redirigiendo…"
              : `Enviar propina${
                  effectiveAmountCents ? ` · ${formatEuro(effectiveAmountCents)}` : ""
                }`}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Pagos procesados por Stripe.
        </p>
      </div>
    </main>
  );
}

