"use client";

import {
  Check,
  ImagePlus,
  Loader2,
  Mail,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toasts";
import { slugify } from "@/lib/slug";
import { tenantIndustries, tenantSizes } from "@/lib/tenant-options";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ChangeEvent, type CSSProperties, useEffect, useState } from "react";

type PlanId = "starter" | "professional" | "business";

type InviteRow = {
  email: string;
  // Literale Werte, keine Anzeige-Strings: werden 1:1 als `role` im
  // Einladungs-Payload an /api/tenants gesendet (siehe <option>s in Schritt
  // 5) — bewusst nicht übersetzt, sonst würde die EN-Oberfläche einen
  // anderen Rollenwert speichern als die DE-Oberfläche.
  role: "Admin" | "HR" | "Mitarbeiter";
};

type Plan = {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  included: string;
  extra: string;
  audience: string;
  recommended?: boolean;
  features: string[];
};

type SlugState = "empty" | "checking" | "available" | "taken" | "error";

type T = ReturnType<typeof useTranslations>;

function getCountries(t: T) {
  return [
    { code: "DE", name: t("countryGermany"), timezone: "Europe/Berlin" },
    { code: "AT", name: t("countryAustria"), timezone: "Europe/Vienna" },
    { code: "CH", name: t("countrySwitzerland"), timezone: "Europe/Zurich" },
    { code: "FR", name: t("countryFrance"), timezone: "Europe/Paris" },
    { code: "NL", name: t("countryNetherlands"), timezone: "Europe/Amsterdam" },
  ];
}

const timezones = [
  "Europe/Berlin",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/London",
];

const sizes = tenantSizes;

const industries = tenantIndustries;

const colorPresets = ["#0E0E0E", "#2A6FDB", "#357A52", "#B4332A", "#7C3AED", "#D97706"];

function getPlans(t: T): Plan[] {
  return [
    {
      id: "starter",
      name: "Starter",
      monthlyPrice: 29,
      included: t("planStarterIncluded"),
      extra: t("planStarterExtra"),
      audience: t("planStarterAudience"),
      features: [
        t("planStarterFeature1"),
        t("planStarterFeature2"),
        t("planStarterFeature3"),
        t("planStarterFeature4"),
        t("planStarterFeature5"),
        t("planStarterFeature6"),
        t("planStarterFeature7"),
      ],
    },
    {
      id: "professional",
      name: "Professional",
      monthlyPrice: 59,
      included: t("planProfessionalIncluded"),
      extra: t("planProfessionalExtra"),
      audience: t("planProfessionalAudience"),
      recommended: true,
      features: [
        t("planProfessionalFeature1"),
        t("planProfessionalFeature2"),
        t("planProfessionalFeature3"),
        t("planProfessionalFeature4"),
        t("planProfessionalFeature5"),
        t("planProfessionalFeature6"),
        t("planProfessionalFeature7"),
        t("planProfessionalFeature8"),
        t("planProfessionalFeature9"),
      ],
    },
    {
      id: "business",
      name: "Business",
      monthlyPrice: 99,
      included: t("planBusinessIncluded"),
      extra: t("planBusinessExtra"),
      audience: t("planBusinessAudience"),
      features: [
        t("planBusinessFeature1"),
        t("planBusinessFeature2"),
        t("planBusinessFeature3"),
        t("planBusinessFeature4"),
        t("planBusinessFeature5"),
        t("planBusinessFeature6"),
        t("planBusinessFeature7"),
      ],
    },
  ];
}

function getStepLabels(t: T) {
  return [
    t("step1Label"),
    t("step2Label"),
    t("step3Label"),
    t("step4Label"),
    t("step5Label"),
  ];
}

function getStepCopy(t: T) {
  return {
    1: {
      eyebrow: t("step1Eyebrow"),
      title: t("step1Title"),
      subtitle: t("step1Subtitle"),
    },
    2: {
      eyebrow: t("step2Eyebrow"),
      title: t("step2Title"),
      subtitle: t("step2Subtitle"),
    },
    3: {
      eyebrow: t("step3Eyebrow"),
      title: t("step3Title"),
      subtitle: t("step3Subtitle"),
    },
    4: {
      eyebrow: t("step4Eyebrow"),
      title: t("step4Title"),
      subtitle: t("step4Subtitle"),
    },
    5: {
      eyebrow: t("step5Eyebrow"),
      title: t("step5Title"),
      subtitle: t("step5Subtitle"),
    },
  } satisfies Record<number, { eyebrow: string; title: string; subtitle: string }>;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function CompanyCreateWizard() {
  const t = useTranslations("CompanyCreateWizard");
  const countries = getCountries(t);
  const plans = getPlans(t);
  const stepLabels = getStepLabels(t);
  const stepCopy = getStepCopy(t);
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [country, setCountry] = useState("DE");
  const [timezone, setTimezone] = useState("Europe/Berlin");
  const [size, setSize] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#2A6FDB");
  const [plan, setPlan] = useState<PlanId>("professional");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>("empty");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdTenantSlug, setCreatedTenantSlug] = useState<string | null>(null);
  const [emailRows, setEmailRows] = useState<InviteRow[]>([
    { email: "", role: "Admin" },
    { email: "", role: "HR" },
    { email: "", role: "Mitarbeiter" },
  ]);

  const baseSlug = customSlug || slugify(name);
  const showSlugStatus = slugState !== "empty";
  const companyName = name.trim() || t("companyNamePlaceholder");
  const currentCopy = stepCopy[step as keyof typeof stepCopy];
  const blocked = step === 1 && slugState !== "available";
  const canSkip = step >= 3 && step <= 5;
  const tenantSlug = createdTenantSlug ?? baseSlug;

  useEffect(() => {
    if (!baseSlug) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/tenants/slug?slug=${encodeURIComponent(baseSlug)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setSlugState("error");
          return;
        }

        const data = (await response.json()) as { available?: boolean };
        setSlugState(data.available ? "available" : "taken");
      } catch {
        if (!controller.signal.aborted) {
          setSlugState("error");
        }
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [baseSlug, toast]);

  function formatEuro(value: number) {
    return new Intl.NumberFormat("de-DE", {
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  }

  function getPlanPrice(item: Plan) {
    const monthlyEquivalent =
      billingCycle === "yearly" ? item.monthlyPrice * 0.8 : item.monthlyPrice;
    const yearlyTotal = monthlyEquivalent * 12;

    return {
      main: `${formatEuro(monthlyEquivalent)} €`,
      detail:
        billingCycle === "yearly"
          ? t("billedYearly", { amount: formatEuro(yearlyTotal) })
          : t("billedMonthly"),
    };
  }

  // lib/tenants.ts (normalizeLogoUrl) speichert data:-URLs nur bis 250.000
  // Zeichen — größere Bilder dort abzuschneiden würde die Bilddaten
  // beschädigen, statt sie sauber abzulehnen. Deshalb hier vorab prüfen.
  const MAX_LOGO_FILE_BYTES = 180_000;

  function readLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > MAX_LOGO_FILE_BYTES) {
      toast({
        tone: "error",
        title: t("logoTooLargeTitle"),
        subtitle: t("logoTooLargeSubtitle"),
      });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setLogoUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  function setEmailRow(index: number, field: keyof InviteRow, value: string) {
    setEmailRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  }

  async function goNext() {
    if (blocked) {
      return;
    }

    setCreateError(null);

    if (step < 5) {
      setStep((current) => current + 1);
      return;
    }

    setCreating(true);
    const response = await fetch("/api/tenants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        slug: baseSlug,
        country,
        timezone,
        size,
        industry,
        contactEmail,
        logoUrl,
        primaryColor,
        plan,
        billingCycle,
        invitations: emailRows
          .map((row) => ({
            email: row.email.trim(),
            role: row.role,
          }))
          .filter((row) => row.email),
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      tenant?: {
        slug?: string;
      };
    } | null;

    if (!response.ok) {
      const message = data?.error ?? t("createFailedDefault");
      setCreating(false);
      setCreateError(message);
      toast({
        tone: "error",
        title:
          response.status === 409
            ? t("slugTakenTitle")
            : t("createFailedTitle"),
        subtitle: message,
      });

      if (response.status === 409) {
        setSlugState("taken");
        setStep(1);
      }

      return;
    }

    setCreatedTenantSlug(data?.tenant?.slug ?? baseSlug);
    setCreating(false);
    toast({
      tone: "success",
      title: t("createdTitle"),
      subtitle: t("createdSubtitle", { company: companyName }),
    });
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex w-full max-w-[540px] flex-col items-center">
        <div className="relative mb-[26px] size-24">
          <div className="absolute inset-0 rounded-full bg-success/10 [animation:skring_.5s_ease_forwards]" />
          <div className="absolute inset-3.5 flex items-center justify-center rounded-full bg-success [animation:skpop_.55s_cubic-bezier(.34,1.56,.64,1)_.12s_both]">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
              <path
                className="sk-check-path"
                d="M8 17.5 L14.5 24 L26 11"
                stroke="#fff"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div className="text-center [animation:fadeup_.5s_ease_.3s_both]">
          <h1 className="m-0 mb-2 font-display text-[30px] font-semibold tracking-[-1px] text-ink">
            {t("doneTitle", { company: companyName })}
          </h1>
          <p className="m-0 text-[14px] text-muted-2">
            {t("doneSubtitle")}
          </p>
          <div className="mt-3.5 inline-flex items-center gap-[7px] rounded-full border border-border bg-white px-[13px] py-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 6 9 17l-5-5"
                stroke="#357A52"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-mono text-[11.5px] text-muted-2">
              app.ployo.de/{tenantSlug || t("companySlugPlaceholder")}
            </span>
          </div>
        </div>

        <div className="mt-[30px] w-full overflow-hidden rounded-2xl border border-border bg-white shadow-[0_4px_24px_rgba(0,0,0,0.05)] [animation:fadeup_.5s_ease_.42s_both]">
          <div className="border-b border-border-soft px-5 pt-4 pb-[13px]">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
              {t("gettingStartedEyebrow")}
            </div>
          </div>
          {[
            {
              icon: "+",
              title: t("onboarding1Title"),
              desc: t("onboarding1Desc"),
            },
            {
              icon: "*",
              title: t("onboarding2Title"),
              desc: t("onboarding2Desc"),
            },
            {
              icon: "▦",
              title: t("onboarding3Title"),
              desc: t("onboarding3Desc"),
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex cursor-pointer items-center gap-3.5 border-t border-border-soft px-5 py-[15px] transition-colors hover:bg-bg"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[#F4F3EF] text-ink">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[14.5px] font-semibold tracking-[-0.2px] text-ink">
                  {item.title}
                </div>
                <div className="mt-0.5 text-[12.5px] text-muted">{item.desc}</div>
              </div>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <path
                  d="M9 18l6-6-6-6"
                  stroke="#C0BEB7"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ))}
        </div>

        <Link
          href={`/u/${tenantSlug || t("companySlugPlaceholder")}`}
          className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[11px] bg-ink px-[18px] py-3.5 text-[14.5px] font-semibold text-white no-underline transition-colors hover:bg-ink-hover active:translate-y-px [animation:fadeup_.5s_ease_.54s_both]"
        >
          {t("goToDashboard")}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[600px]">
      <div className="overflow-hidden rounded-[20px] border border-border bg-white shadow-[0_4px_28px_rgba(0,0,0,0.055)]">
        <div className="h-[3px] bg-border-soft">
          <div
            className="h-full w-[var(--pct)] bg-ink transition-[width] duration-300"
            style={{ "--pct": `${step * 20}%` } as CSSProperties}
          />
        </div>

        <div className="px-7 pt-[18px] pb-1">
          <div className="relative grid w-full grid-cols-5">
            <div className="absolute top-[10px] right-[10%] left-[10%] h-[1.5px] rounded-full bg-border" />
            <div
              className="absolute top-[10px] left-[10%] h-[1.5px] w-[var(--pct)] rounded-full bg-ink transition-[width] duration-300"
              style={
                {
                  "--pct": step === 1 ? "0%" : `${((step - 1) / 4) * 80}%`,
                } as CSSProperties
              }
            />
          {stepLabels.map((label, index) => {
            const stepNumber = index + 1;
            const active = stepNumber === step;
            const complete = stepNumber < step;

            return (
              <div key={label} className="relative z-10 flex min-w-0 flex-col items-center">
                <button
                  type="button"
                  className="flex cursor-pointer flex-col items-center gap-[7px] border-0 bg-transparent p-0 text-center"
                  onClick={() => setStep(stepNumber)}
                >
                  <span
                    className={cx(
                      "flex size-[21px] shrink-0 items-center justify-center rounded-full font-mono text-[9.5px] font-semibold transition-colors",
                      active || complete
                        ? "border-0 bg-ink text-white"
                        : "border border-[#D4D2CC] bg-white text-muted",
                    )}
                  >
                    {complete ? <Check size={11} strokeWidth={3.5} /> : stepNumber}
                  </span>
                  <span
                    className={cx(
                      "hidden max-w-full truncate px-1 text-[11px] font-medium sm:block",
                      active ? "text-ink" : complete ? "text-muted-2" : "text-muted",
                    )}
                  >
                    {label}
                  </span>
                </button>
              </div>
            );
          })}
          </div>
        </div>

        <div className="px-7 pt-[22px] pb-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            {currentCopy.eyebrow}
          </div>
          <h1 className="mt-2 mb-[5px] font-display text-[25px] font-semibold tracking-[-0.7px] text-ink">
            {currentCopy.title}
          </h1>
          <p className="m-0 text-[13.5px] text-muted">{currentCopy.subtitle}</p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            goNext();
          }}
        >
          <div className="min-h-[290px] px-7 pb-2">
            {step === 1 && (
              <div className="flex flex-col gap-2">
                <label htmlFor="company-name" className="label">
                  {t("companyNameLabel")}
                </label>
                <input
                  id="company-name"
                  autoFocus
                  className="w-full rounded-[11px] border border-border-light bg-white px-[15px] py-[13px] text-[15px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
                  placeholder={t("companyNamePlaceholderInput")}
                  value={name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    const nextSlug = slugify(nextName);

                    setName(nextName);
                    setCustomSlug("");
                    setSlugState(nextSlug ? "checking" : "empty");
                  }}
                />

                <div className="mt-1.5 rounded-[12px] border border-border bg-bg px-[15px] py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-[9px] uppercase tracking-[0.05em] text-muted">
                      Your workspace URL
                    </div>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-[5px] border-0 bg-transparent p-0 text-[11.5px] font-medium text-muted-2 transition-colors hover:text-ink"
                      onClick={() => setEditingSlug((current) => !current)}
                    >
                      <Pencil size={11} strokeWidth={2.2} />
                      Edit
                    </button>
                  </div>

                  <div className="mt-[9px] flex flex-wrap items-center justify-between gap-3">
                    <div className="break-all font-mono text-[14px] text-ink">
                      app.ployo.de/
                      <span className="font-medium">
                        {baseSlug || t("yourCompanySlugPlaceholder")}
                      </span>
                    </div>
                    {showSlugStatus && (
                      <div
                        className={cx(
                          "inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[12px] font-semibold",
                          slugState === "checking"
                            ? "bg-border-soft text-muted-2"
                            : slugState === "available"
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger",
                        )}
                      >
                        {slugState === "checking" ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : slugState === "available" ? (
                          <Check size={13} strokeWidth={2.6} />
                        ) : (
                          <X size={13} strokeWidth={2.6} />
                        )}
                        {slugState === "checking"
                          ? "Checking"
                          : slugState === "available"
                            ? "Available"
                            : "Not available"}
                      </div>
                    )}
                  </div>

                  {editingSlug && (
                    <input
                      aria-label={t("adjustWorkspaceUrlAria")}
                      className="mt-3 w-full rounded-[10px] border border-border-light bg-white px-3 py-2.5 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-ink"
                      placeholder={slugify(name) || t("companySlugPlaceholder")}
                      value={customSlug}
                      onChange={(event) => {
                        const nextSlug = slugify(event.target.value);

                        setCustomSlug(nextSlug);
                        setSlugState(nextSlug ? "checking" : "empty");
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field">
                    <label htmlFor="country" className="label">
                      {t("countryLabel")}
                    </label>
                    <select
                      id="country"
                      className="input cursor-pointer bg-white"
                      value={country}
                      onChange={(event) => {
                        const nextCountry = countries.find((item) => item.code === event.target.value);
                        setCountry(event.target.value);
                        setTimezone(nextCountry?.timezone ?? timezone);
                      }}
                    >
                      {countries.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="timezone" className="label">
                      {t("timezoneLabel")}
                    </label>
                    <select
                      id="timezone"
                      className="input cursor-pointer bg-white"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                    >
                      {timezones.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <span className="label">{t("companySizeLabel")}</span>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={cx(
                          "rounded-[10px] border px-4 py-2.5 text-[13.5px] font-medium transition-colors",
                          size === item
                            ? "border-ink bg-ink text-white"
                            : "border-border-light bg-white text-ink hover:border-muted",
                        )}
                        onClick={() => setSize(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field">
                    <label htmlFor="industry" className="label">
                      {t("industryLabel")}
                    </label>
                    <select
                      id="industry"
                      className="input cursor-pointer bg-white"
                      value={industry}
                      onChange={(event) => setIndustry(event.target.value)}
                    >
                      <option value="">{t("pleaseSelect")}</option>
                      {industries.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="contact-email" className="label">
                      {t("contactEmailLabel")}
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      className="input bg-white"
                      placeholder={t("contactEmailPlaceholder")}
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-4">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-[#D4D2CC] bg-bg px-5 py-6 text-center transition-colors hover:border-muted">
                  <span
                    className="flex size-[58px] items-center justify-center overflow-hidden rounded-[14px] bg-[var(--swatch)] text-white"
                    style={{ "--swatch": primaryColor } as CSSProperties}
                  >
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="font-display text-[22px] font-semibold">
                        {companyName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                    <ImagePlus size={15} />
                    {t("uploadLogo")}
                  </span>
                  <span className="text-[12.5px] text-muted">{t("logoFormatHint")}</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={readLogo} />
                </label>

                <div className="field">
                  <span className="label">{t("primaryColorLabel")}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {colorPresets.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={color}
                        aria-label={t("colorAria", { color })}
                        className={cx(
                          "size-[38px] cursor-pointer rounded-[10px] border-2 bg-[var(--swatch)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
                          primaryColor.toLowerCase() === color.toLowerCase()
                            ? "border-ink"
                            : "border-transparent",
                        )}
                        style={{ "--swatch": color } as CSSProperties}
                        onClick={() => setPrimaryColor(color)}
                      />
                    ))}
                    <input
                      aria-label={t("hexColorAria")}
                      className="input input-mono max-w-[130px] bg-white"
                      value={primaryColor}
                      onChange={(event) => setPrimaryColor(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-[9px]">
                  <span className="label">{t("livePreviewLabel")}</span>
                  <div className="flex h-[158px] overflow-hidden rounded-[14px] border border-border bg-white">
                    <div
                      className="flex w-16 shrink-0 flex-col items-center gap-3.5 bg-[var(--swatch)] px-0 py-[13px]"
                      style={{ "--swatch": primaryColor } as CSSProperties}
                    >
                      <div className="flex size-[30px] items-center justify-center overflow-hidden rounded-[9px] bg-white/90">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <span
                            className="font-display text-[13px] font-bold text-[var(--swatch)]"
                            style={{ "--swatch": primaryColor } as CSSProperties}
                          >
                            {companyName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex w-full flex-col items-center gap-[9px]">
                        <div className="h-[5px] w-[26px] rounded-[3px] bg-white/90" />
                        <div className="h-[5px] w-[26px] rounded-[3px] bg-white/40" />
                        <div className="h-[5px] w-[26px] rounded-[3px] bg-white/40" />
                        <div className="h-[5px] w-[26px] rounded-[3px] bg-white/40" />
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-border-soft px-3.5">
                        <span className="truncate font-display text-[12.5px] font-semibold text-ink">
                          {companyName}
                        </span>
                        <span
                          className="size-[22px] shrink-0 rounded-full bg-[var(--swatch)]"
                          style={{ "--swatch": primaryColor } as CSSProperties}
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-[9px] px-3.5 py-[13px]">
                        <div className="flex gap-[9px]">
                          <div className="h-[34px] flex-1 rounded-[8px] bg-[#F4F3EF]" />
                          <div className="h-[34px] flex-1 rounded-[8px] bg-[#F4F3EF]" />
                        </div>
                        <div className="h-2 w-[70%] rounded bg-[#EDEBE6]" />
                        <div
                          className="mt-auto w-fit rounded-[7px] bg-[var(--swatch)] px-[11px] py-[5px] text-[10.5px] font-semibold text-white"
                          style={{ "--swatch": primaryColor } as CSSProperties}
                        >
                          {t("primaryActionPreview")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-3">
                <div className="mb-1 flex w-fit gap-1 rounded-xl bg-border-soft p-1">
                  <button
                    type="button"
                    className={cx(
                      "cursor-pointer rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold transition-all",
                      billingCycle === "monthly"
                        ? "bg-white text-ink shadow-sm"
                        : "text-muted hover:text-ink",
                    )}
                    onClick={() => setBillingCycle("monthly")}
                  >
                    {t("billingMonthly")}
                  </button>
                  <button
                    type="button"
                    className={cx(
                      "cursor-pointer rounded-[8px] px-[15px] py-2 text-[12.5px] font-semibold transition-all",
                      billingCycle === "yearly"
                        ? "bg-white text-ink shadow-sm"
                        : "text-muted hover:text-ink",
                    )}
                    onClick={() => setBillingCycle("yearly")}
                  >
                    {t("billingYearly")}
                  </button>
                </div>

                {plans.map((item) => {
                  const selected = item.id === plan;
                  const price = getPlanPrice(item);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cx(
                        "w-full cursor-pointer rounded-[14px] border p-[15px] text-left transition-all duration-200 ease-out",
                        selected
                          ? "scale-[1.025] border-[1.5px] border-ink bg-bg shadow-[0_10px_30px_rgba(0,0,0,0.07)]"
                          : "scale-100 border-border-light bg-white hover:scale-[1.01] hover:border-muted",
                      )}
                      onClick={() => setPlan(item.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-display text-[19px] font-semibold text-ink">
                              {item.name}
                            </div>
                            {item.recommended && (
                              <span className="rounded-[7px] bg-ink px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-white">
                                {t("coreplanBadge")}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[12.5px] leading-5 text-muted-2">
                            {item.audience}
                          </p>
                        </div>
                        <span
                          className={cx(
                            "flex size-5 shrink-0 items-center justify-center rounded-full",
                            selected ? "bg-ink text-white" : "border border-[#D4D2CC] bg-white",
                          )}
                        >
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
                        <span className="font-display text-[28px] font-semibold leading-none text-ink">
                          {price.main}
                        </span>
                        <span className="text-[12.5px] text-muted-2">{t("perMonth")}</span>
                        {billingCycle === "yearly" && (
                          <span className="rounded-[7px] bg-success/10 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-success">
                            -20%
                          </span>
                        )}
                        <span className="text-[12px] font-semibold text-ink">{item.included}</span>
                        <span className="text-[12px] text-muted-2">{item.extra}</span>
                      </div>
                      <div className="mt-1 text-[11.5px] text-muted">{price.detail}</div>

                      {selected && (
                        <ul className="mt-3 grid gap-1.5">
                          {item.features.map((feature) => (
                            <li key={feature} className="flex gap-2 text-[12.3px] leading-5 text-muted-2">
                              <Check size={13} className="mt-0.5 shrink-0 text-success" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {step === 5 && (
              <div className="grid gap-3">
                {emailRows.map((row, index) => (
                  <div key={index} className="grid gap-2.5 rounded-[12px] border border-border-light bg-bg p-3 sm:grid-cols-[1fr_145px]">
                    <div className="field">
                      <label htmlFor={`invite-${index}`} className="label">
                        {t("emailLabel")}
                      </label>
                      <div className="input-wrapper">
                        <Mail size={14} className="input-icon-left" />
                        <input
                          id={`invite-${index}`}
                          type="email"
                          className="input input-with-icon-left bg-white"
                          placeholder={t("invitePlaceholder")}
                          value={row.email}
                          onChange={(event) => setEmailRow(index, "email", event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor={`invite-role-${index}`} className="label">
                        {t("roleLabel")}
                      </label>
                      <select
                        id={`invite-role-${index}`}
                        className="input cursor-pointer bg-white"
                        value={row.role}
                        onChange={(event) => setEmailRow(index, "role", event.target.value)}
                      >
                        {/* Bewusst nicht übersetzt: der Options-Text IST der
                            gesendete `role`-Wert (kein separates `value`),
                            siehe InviteRow-Typ oben. */}
                        <option>Admin</option>
                        <option>HR</option>
                        <option>Mitarbeiter</option>
                      </select>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="mt-1 inline-flex w-fit cursor-pointer items-center gap-2 rounded-[10px] border border-border-light bg-white px-4 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-muted"
                  onClick={() =>
                    setEmailRows((current) => [
                      ...current,
                      { email: "", role: "Mitarbeiter" },
                    ])
                  }
                >
                  <Plus size={15} />
                  {t("addAnotherInvite")}
                </button>
                <div className="rounded-[12px] border border-border bg-bg px-4 py-3 text-[12.5px] leading-5 text-muted-2">
                  {t("inviteLaterHint")}
                </div>
              </div>
            )}
          </div>

          {createError && (
            <div className="mx-7 mt-3 rounded-[10px] border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
              {createError}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-soft px-7 py-[18px] pb-[22px]">
            <button
              type="button"
              className={cx(
                "rounded-[10px] border px-[18px] py-[11px] text-[13.5px] font-semibold transition-colors",
                step === 1
                  ? "cursor-default border-border text-[#C0BEB7]"
                  : "cursor-pointer border-[#C8C7C2] text-ink hover:bg-bg",
              )}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              {t("back")}
            </button>

            <div className="flex items-center gap-3.5">
              {canSkip && step < 5 && (
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent px-0 py-2 text-[13.5px] font-medium text-muted transition-colors hover:text-ink"
                  onClick={goNext}
                  disabled={creating}
                >
                  {t("skip")}
                </button>
              )}
              <button
                type="submit"
                className={cx(
                  "inline-flex min-w-[132px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border-0 px-[22px] py-[11px] text-[13.5px] font-semibold transition-colors active:translate-y-px",
                  blocked
                    ? "cursor-default bg-border-soft text-muted"
                    : "bg-ink text-white hover:bg-ink-hover",
                )}
                disabled={blocked || creating}
              >
                {creating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : step === 5 ? (
                  t("createCompany")
                ) : (
                  t("next")
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="mt-[18px] text-center">
        <Link href="/select" className="text-[12.5px] text-muted no-underline transition-colors hover:text-ink">
          {t("backToCompanySelection")}
        </Link>
      </div>
    </div>
  );
}
