"use client";

import { createLocationAction } from "@/app/(dashboard)/u/[tenant]/standorte/actions";
import AddressFields from "@/components/AddressFields";
import { DbDrawer, DbField, dbInputClass } from "@/components/dashboard/DbDrawer";
import { ctaClass, secondaryClass } from "@/components/dashboard/ui";
import EmployeeSelector, {
  type EmployeeSelectorOption,
} from "@/components/EmployeeSelector";
import { FormErrorBanner } from "@/components/FormFeedback";
import { OpeningHoursEditor } from "@/components/OpeningHoursEditor";
import { useActionStateWithToast } from "@/components/Toasts";
import { BUNDESLAENDER } from "@/lib/german-holidays";
import { locationColorPalette, locationKindLabel, locationKinds, paletteHex } from "@/lib/org-options";
import { Building2, Check, Plus } from "lucide-react";
import { startTransition, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <h3 className="m-0 shrink-0 font-display text-[15px] font-semibold">{title}</h3>
        <span className="h-px flex-1 bg-[#ecebe7]" />
      </div>
      {children}
    </section>
  );
}

function CreateLocationDrawer({
  tenant,
  employees,
  onClose,
}: {
  tenant: string;
  employees: EmployeeSelectorOption[];
  onClose: () => void;
}) {
  const t = useTranslations("CreateLocationButton");
  const tAddress = useTranslations("AddressFields");
  const [state, formAction, isPending] = useActionStateWithToast(createLocationAction);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("Filiale");
  const [status, setStatus] = useState("active");
  const [color, setColor] = useState<string>(locationColorPalette[1].value);
  const [bundesland, setBundesland] = useState("");
  const colorEntry = locationColorPalette.find((entry) => entry.value === color) ?? locationColorPalette[0];
  const accent = paletteHex(colorEntry.className);

  return (
    <DbDrawer
      title={
        <span className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#6e6e6b] uppercase">{t("eyebrow")}</span>
          {t("addLocation")}
        </span>
      }
      width={580}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" form="create-location-form" className={ctaClass} disabled={isPending}>
            {isPending ? t("creatingLocation") : t("createLocation")}
          </button>
        </div>
      }
    >
      <div className="relative flex items-center gap-3.5 overflow-hidden rounded-[14px] border border-[#ecebe7] bg-white py-3.5 pr-4 pl-5">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] text-white" style={{ background: accent }}>
          <Building2 size={18} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">{name.trim() || t("newLocation")}</span>
          <span className="text-[13px] text-[#6e6e6b]">
            {locationKindLabel(kind)}
            {status === "inactive" && ` · ${t("inactive")}`}
          </span>
        </span>
        <span className="font-mono text-[10px] tracking-[0.12em] text-[#6e6e6b] uppercase">{t("preview")}</span>
      </div>

      <form
        id="create-location-form"
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (isPending) return;
          // Ein form-action-Submit setzt unkontrollierte Felder auch dann zurück,
          // wenn die Server Action einen Validierungsfehler als State zurückgibt.
          // Explizites Dispatch behält die Eingaben; native Pflichtfeldprüfung
          // und der Redirect nach erfolgreichem Erstellen bleiben erhalten.
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        <FormErrorBanner message={state.error} />
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="bundesland" value={bundesland} />

        <FormSection title={t("general")}>
          <DbField label={`${t("locationName")} *`}>
            <input
              name="name"
              className={dbInputClass}
              placeholder={t("locationNamePlaceholder")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              autoFocus
            />
          </DbField>

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("type")}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("type")}>
              {locationKinds.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={kind === option}
                  onClick={() => setKind(option)}
                  className={`db-focus min-h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
                    kind === option ? "border-ink bg-ink text-white" : "border-[#e4e3df] bg-white text-ink hover:border-[#9a9a96]"
                  }`}
                >
                  {locationKindLabel(option)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3.5">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("status")}</span>
              <span role="radiogroup" aria-label={t("status")} className="flex gap-0.5 self-start rounded-[10px] bg-[#f2f1ed] p-[3px]">
                {(["active", "inactive"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={status === value}
                    onClick={() => setStatus(value)}
                    className={`db-focus min-h-9 cursor-pointer rounded-[8px] border-0 px-3 text-[13px] ${
                      status === value ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "bg-transparent font-medium text-[#6e6e6b]"
                    }`}
                  >
                    {t(value)}
                  </button>
                ))}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">
                {t("locationColor")} · {colorEntry.label}
              </span>
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("locationColor")}>
                {locationColorPalette.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    role="radio"
                    aria-checked={color === entry.value}
                    aria-label={entry.label}
                    title={entry.label}
                    onClick={() => setColor(entry.value)}
                    className={`db-focus flex size-7 cursor-pointer items-center justify-center rounded-full border-0 text-white ${
                      color === entry.value ? "ring-2 ring-offset-2" : ""
                    }`}
                    style={{ background: paletteHex(entry.className), ["--tw-ring-color" as string]: paletteHex(entry.className) }}
                  >
                    {color === entry.value && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title={t("address")}>
          <AddressFields idPrefix="location-address" required t={tAddress} />
          <DbField label={t("bundesland")}>
            <select className={dbInputClass} value={bundesland} onChange={(event) => setBundesland(event.target.value)}>
              <option value="">{t("noBundesland")}</option>
              {BUNDESLAENDER.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name}
                </option>
              ))}
            </select>
          </DbField>
          {!bundesland && (
            <span className="flex items-center gap-2 text-[12.5px] text-[#6e6e6b]">
              <span className="size-1.5 rounded-full bg-[#e07b00]" />
              {t("bundeslandHint")}
            </span>
          )}
        </FormSection>

        <FormSection title={t("leadAndContact")}>
          <EmployeeSelector label={t("locationLead")} name="lead" options={employees} />
          <DbField label={t("contactEmail")}>
            <input name="email" type="email" className={dbInputClass} placeholder="standort@example.com" autoComplete="email" />
          </DbField>
        </FormSection>

        <FormSection title={t("operations")}>
          <DbField label={t("minStaffingPerDay")} hint={t("minStaffingHint")}>
            <input name="shiftMinStaffing" type="number" min={0} max={99} className={`${dbInputClass} max-w-[200px]`} placeholder={t("companyDefault")} />
          </DbField>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.08em] text-[#6e6e6b] uppercase">{t("openingHours")}</span>
            <OpeningHoursEditor name="openingHours" defaultValue={[]} allowInherit initiallyCustom={false} />
          </div>
          <p className="m-0 text-[12.5px] leading-[1.55] text-[#6e6e6b]">{t("assignmentHint")}</p>
        </FormSection>
      </form>
    </DbDrawer>
  );
}

export default function CreateLocationButton({
  tenant,
  initialOpen = false,
  employees,
  className,
  children,
}: {
  tenant: string;
  initialOpen?: boolean;
  employees: EmployeeSelectorOption[];
  className?: string;
  /** Eigener Inhalt, z. B. die gestrichelte Kachel im Kartenraster. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("CreateLocationButton");
  const [open, setOpen] = useState(initialOpen);

  return (
    <>
      <button type="button" className={className ?? ctaClass} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Plus size={15} strokeWidth={2} />
            {t("addLocation")}
          </>
        )}
      </button>
      {open && <CreateLocationDrawer tenant={tenant} employees={employees} onClose={() => setOpen(false)} />}
    </>
  );
}
