"use client";

import { useActionState, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  reportMySicknessAction,
  requestMyVacationAction,
  updateMyProfileAction,
  type VacationActionState,
} from "@/app/(dashboard)/u/[tenant]/mein-bereich/actions";
import AddressFields from "@/components/AddressFields";
import DatePickerField from "@/components/DatePickerField";
import EmergencyContactsEditor from "@/components/EmergencyContactsEditor";
import FormSubmitButton from "@/components/FormSubmitButton";
import SelectOrOtherField from "@/components/SelectOrOtherField";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import type { ActionState } from "@/lib/action-state";
import type { MyProfileFields, ProfileCompleteness } from "@/lib/self-service";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Save,
  ThermometerSnowflake,
  UserRoundCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";

const initialState: ActionState = {};

function todayInputValue() {
  const now = new Date();
  const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);

  return offsetDate.toISOString().slice(0, 10);
}

const nationalityOptions = [
  "Deutsch",
  "Österreichisch",
  "Schweizerisch",
  "Türkisch",
  "Polnisch",
  "Italienisch",
  "Rumänisch",
  "Griechisch",
  "Kroatisch",
  "Russisch",
  "Ukrainisch",
  "Serbisch",
].map((label) => ({ value: label, label }));

const maritalStatusOptions = [
  "Ledig",
  "Verheiratet",
  "Eingetragene Lebenspartnerschaft",
  "Geschieden",
  "Verwitwet",
  "Getrennt lebend",
].map((label) => ({ value: label, label }));

const healthInsuranceOptions = [
  "TK (Techniker Krankenkasse)",
  "AOK",
  "Barmer",
  "DAK-Gesundheit",
  "IKK classic",
  "BKK",
  "Knappschaft",
  "Privat (PKV)",
].map((label) => ({ value: label, label }));

export function MyVacationRequestForm({ tenant }: { tenant: string }) {
  const t = useTranslations("SelfServiceForms");
  const [state, formAction] = useActionState<VacationActionState, FormData>(
    requestMyVacationAction,
    initialState,
  );
  const today = todayInputValue();
  // Nach JEDER Server-Action-Auflösung (auch bei einem Fehler, nicht nur bei
  // Erfolg) setzt React unkontrollierte Formularfelder zurück — ohne dieses
  // Echo verlor die Notiz ihren Inhalt, sobald ein Fehler zurückkam
  // (QA-Bug BUG-018). `key` erzwingt zusätzlich einen frischen Mount pro
  // Server-Antwort, damit die neuen `defaultValue`s wirklich übernommen
  // werden (ein reiner Re-Render ignoriert `defaultValue`-Änderungen).
  const [startDate, setStartDate] = useState(state.values?.startDate ?? "");
  const [endDate, setEndDate] = useState(state.values?.endDate ?? "");
  // Der allgemeine Fehlerbanner (z. B. "Enddatum vor Startdatum") bezieht
  // sich auf die zuletzt ABGESENDETEN Werte — sobald eines der beiden Daten
  // sich seither geändert hat, ist er nicht mehr zutreffend (BUG-018).
  const datesChangedSinceError =
    startDate !== (state.values?.startDate ?? "") || endDate !== (state.values?.endDate ?? "");

  return (
    <form key={JSON.stringify(state)} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="tenant" value={tenant} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="my-vacation-start" className="label">
            {t("fromLabel")}
          </label>
          <DatePickerField
            id="my-vacation-start"
            name="startDate"
            defaultValue={state.values?.startDate}
            min={today}
            onChange={setStartDate}
          />
          {/* Sobald ein Datum gewählt ist, ist "Bitte ein Startdatum wählen"
              gegenstandslos — bisher blieb die Meldung bis zum nächsten
              Absenden unverändert stehen (QA-Bug BUG-018). */}
          {!startDate && <FieldErrors errors={state.fieldErrors?.startDate} />}
        </div>
        <div className="field">
          <label htmlFor="my-vacation-end" className="label">
            {t("toLabel")}
          </label>
          <DatePickerField
            id="my-vacation-end"
            name="endDate"
            defaultValue={state.values?.endDate}
            min={startDate || today}
            onChange={setEndDate}
          />
          {!endDate && <FieldErrors errors={state.fieldErrors?.endDate} />}
        </div>
      </div>
      <div className="field">
        <label htmlFor="my-vacation-note" className="label">
          {t("noteOptionalLabel")}
        </label>
        <input
          id="my-vacation-note"
          name="note"
          className="input"
          defaultValue={state.values?.note}
          placeholder={t("vacationNotePlaceholder")}
        />
      </div>
      <FormErrorBanner message={datesChangedSinceError ? undefined : state.error} />
      <FormSubmitButton Icon={CalendarPlus} pendingLabel={t("submittingVacation")} className="btn btn-primary w-fit">
        {t("requestVacation")}
      </FormSubmitButton>
    </form>
  );
}

export function MySicknessReportForm({ tenant }: { tenant: string }) {
  const t = useTranslations("SelfServiceForms");
  const [state, formAction] = useActionState(reportMySicknessAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="tenant" value={tenant} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="my-sickness-start" className="label">
            {t("sickSinceLabel")}
          </label>
          <DatePickerField id="my-sickness-start" name="startDate" />
          <FieldErrors errors={state.fieldErrors?.startDate} />
        </div>
        <div className="field">
          <label htmlFor="my-sickness-end" className="label">
            {t("expectedUntilOptionalLabel")}
          </label>
          <DatePickerField id="my-sickness-end" name="endDate" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="my-sickness-note" className="label">
          {t("noteOptionalLabel")}
        </label>
        <input id="my-sickness-note" name="note" className="input" placeholder={t("optionalPlaceholder")} />
      </div>
      <FormErrorBanner message={state.error} />
      <FormSubmitButton
        Icon={ThermometerSnowflake}
        pendingLabel={t("submittingSickness")}
        className="btn btn-primary w-fit"
      >
        {t("submitSicknessReport")}
      </FormSubmitButton>
    </form>
  );
}

export function MyProfileCompletionCard({
  tenant,
  profileFields,
  completeness,
}: {
  tenant: string;
  profileFields: MyProfileFields;
  completeness: ProfileCompleteness;
}) {
  const t = useTranslations("SelfServiceForms");
  const tAddress = useTranslations("AddressFields");
  const [isExpanded, setIsExpanded] = useState(false);
  const [state, formAction, isPending] = useActionState(updateMyProfileAction, initialState);
  const isComplete = completeness.percent >= 100;

  // Bestätigung + Animation nach dem Speichern, statt kommentarlos einfach
  // stehen zu bleiben: kurz "Gespeichert" zeigen, dabei zuklappen. Wird die
  // Angabe dadurch vollständig, verschwindet die Karte danach ganz — bis
  // dahin bleibt sie sichtbar, damit die Bestätigung nicht sofort
  // wegspringt (siehe To-Do "Profil vervollständigen ... Bestätigung +
  // Animation; Tab schließen bzw. bei Vollständigkeit ganz entfernen").
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      setJustSaved(true);
      setIsExpanded(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  useEffect(() => {
    if (!justSaved) return;
    const timeout = setTimeout(() => setJustSaved(false), 2200);
    return () => clearTimeout(timeout);
  }, [justSaved]);

  if (isComplete && !justSaved) {
    return null;
  }

  return (
    <section className="rounded-card border border-border bg-white px-6 py-[22px]">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
        onClick={() => setIsExpanded((current) => !current)}
        aria-expanded={isExpanded}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              isComplete ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
            }`}
          >
            <UserRoundCheck size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-semibold tracking-[-0.3px] text-ink">
              {t("completeProfileTitle")}
            </h2>
            <div
              className={`mt-0.5 flex items-center gap-1.5 text-[12.5px] ${
                justSaved ? "toast-card text-success" : "text-muted-2"
              }`}
            >
              {justSaved ? (
                <>
                  <Check size={13} strokeWidth={2.5} />
                  {t("saved")}
                </>
              ) : isComplete ? (
                t("allComplete")
              ) : (
                t("filledOfTotal", { filled: completeness.filledCount, total: completeness.totalCount })
              )}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp size={16} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-muted" />
        )}
      </button>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border-soft">
        <div
          className={`h-full w-[var(--pct)] rounded-full ${isComplete ? "bg-success" : "bg-warning"}`}
          style={{ "--pct": `${completeness.percent}%` } as CSSProperties}
        />
      </div>

      {!isExpanded && !isComplete && completeness.missingLabels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {completeness.missingLabels.map((label) => (
            <span
              key={label}
              className="rounded-[7px] bg-border-soft px-2 py-[3px] font-mono text-[10.5px] text-muted-2"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {isExpanded && (
        <form action={formAction} className="mt-5 flex flex-col gap-5">
          <input type="hidden" name="tenant" value={tenant} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="my-profile-birth-date" className="label">
                {t("birthDateLabel")}
              </label>
              <DatePickerField
                id="my-profile-birth-date"
                name="birthDate"
                defaultValue={profileFields.birthDate}
              />
            </div>
            <div className="field">
              <label htmlFor="my-profile-birth-place" className="label">
                {t("birthPlaceLabel")}
              </label>
              <input
                id="my-profile-birth-place"
                name="birthPlace"
                className="input"
                defaultValue={profileFields.birthPlace}
              />
            </div>
            <div className="field">
              <label htmlFor="my-profile-nationality" className="label">
                {t("nationalityLabel")}
              </label>
              <SelectOrOtherField
                id="my-profile-nationality"
                name="nationality"
                options={nationalityOptions}
                defaultValue={profileFields.nationality}
              />
            </div>
            <div className="field">
              <label htmlFor="my-profile-marital-status" className="label">
                {t("maritalStatusLabel")}
              </label>
              <SelectOrOtherField
                id="my-profile-marital-status"
                name="maritalStatus"
                options={maritalStatusOptions}
                defaultValue={profileFields.maritalStatus}
              />
            </div>
            <div className="field">
              <label htmlFor="my-profile-phone" className="label">
                {t("phoneLabel")}
              </label>
              <input
                id="my-profile-phone"
                name="phone"
                type="tel"
                className="input"
                defaultValue={profileFields.phone}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 label">{t("privateAddressLabel")}</div>
            <AddressFields
              idPrefix="my-profile-address"
              namePrefix="privateAddress"
              defaults={profileFields.privateAddress}
              t={tAddress}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="my-profile-tax-id" className="label">
                {t("taxIdLabel")}
              </label>
              <input
                id="my-profile-tax-id"
                name="taxId"
                className="input input-mono"
                defaultValue={profileFields.taxId}
              />
            </div>
            <div className="field">
              <label htmlFor="my-profile-ssn" className="label">
                {t("ssnLabel")}
              </label>
              <input
                id="my-profile-ssn"
                name="socialSecurityNumber"
                className="input input-mono"
                defaultValue={profileFields.socialSecurityNumber}
              />
            </div>
            <div className="field sm:col-span-2">
              <label htmlFor="my-profile-health-insurance" className="label">
                {t("healthInsuranceLabel")}
              </label>
              <SelectOrOtherField
                id="my-profile-health-insurance"
                name="healthInsurance"
                options={healthInsuranceOptions}
                defaultValue={profileFields.healthInsurance}
                otherPlaceholder={t("healthInsuranceOtherPlaceholder")}
              />
            </div>
            <div className="field sm:col-span-2">
              <label htmlFor="my-profile-iban" className="label">
                {t("ibanLabel")}
              </label>
              <input
                id="my-profile-iban"
                name="iban"
                className="input input-mono"
                defaultValue={profileFields.iban}
                placeholder={t("ibanPlaceholder")}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 label">{t("emergencyContactsLabel")}</div>
            <EmergencyContactsEditor contacts={profileFields.emergencyContacts} />
          </div>

          <FormErrorBanner message={state.error} />

          <div className="flex justify-end gap-2.5 border-t border-border-soft pt-4">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsExpanded(false)}
            >
              {t("cancel")}
            </button>
            <FormSubmitButton Icon={Save} pendingLabel={t("saving")}>
              {t("save")}
            </FormSubmitButton>
          </div>
        </form>
      )}

      {!isExpanded && (
        <button
          type="button"
          className="btn btn-secondary btn-sm mt-4 w-fit"
          onClick={() => setIsExpanded(true)}
        >
          {isComplete ? <Check size={14} /> : <UserRoundCheck size={14} />}
          {isComplete ? t("editDetails") : t("completeNow")}
        </button>
      )}
    </section>
  );
}
