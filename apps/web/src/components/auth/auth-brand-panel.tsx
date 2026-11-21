import { BadgeCheckIcon, CheckCircle2Icon } from "lucide-react";

export const AUTH_BRAND = {
  appName: "CertiFlow",
  headline: "Certificates that are approved properly and verified in seconds.",
  description:
    "Training centres submit batches. District, quality and state officers approve them. Every passed candidate gets exactly one certificate on WhatsApp, and anyone can check it is genuine.",
  features: [
    "Two officers must approve every batch, and a batch moves only once",
    "One certificate per candidate, even when WhatsApp fails and retries",
    "A cancelled certificate shows as invalid immediately",
  ],
  footer: "Pragati Skills Mission",
} as const;

export function AuthBrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-10">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-primary-foreground/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-primary-foreground/5 blur-3xl" />

      <div className="relative flex items-center gap-2 text-lg font-semibold">
        <BadgeCheckIcon className="size-5" aria-hidden />
        {AUTH_BRAND.appName}
      </div>

      <div className="relative max-w-md space-y-6">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight">{AUTH_BRAND.headline}</h2>
        <p className="text-primary-foreground/80">{AUTH_BRAND.description}</p>
        <ul className="space-y-3">
          {AUTH_BRAND.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-sm text-primary-foreground/90">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-sm text-primary-foreground/70">{AUTH_BRAND.footer}</p>
    </aside>
  );
}
