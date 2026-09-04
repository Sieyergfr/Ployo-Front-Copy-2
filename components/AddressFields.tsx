import { addressDefaults, type AddressInput } from "@/lib/address";
import SelectOrOtherField from "@/components/SelectOrOtherField";

// Diese Datei hat bewusst kein "use client" und ruft next-intl nicht selbst
// auf: sie wird sowohl direkt aus Server-Component-Seiten (employees/
// [employeeId]/page.tsx, standorte/[locationId]/page.tsx) als auch aus
// Client Components (CreateLocationButton.tsx, Navigation.tsx,
// SelfServiceForms.tsx) heraus gerendert. `t` kommt deshalb als Prop vom
// jeweiligen Aufrufer (Namespace "AddressFields", per useTranslations bzw.
// getTranslations je nach Kontext geholt).
type T = (key: string) => string;

function getCountryOptions(t: T) {
  return [
    { value: "DE", label: t("countryGermany") },
    { value: "AT", label: t("countryAustria") },
    { value: "CH", label: t("countrySwitzerland") },
    { value: "NL", label: t("countryNetherlands") },
    { value: "BE", label: t("countryBelgium") },
    { value: "FR", label: t("countryFrance") },
    { value: "PL", label: t("countryPoland") },
    { value: "IT", label: t("countryItaly") },
  ];
}

type AddressFieldsProps = {
  idPrefix: string;
  namePrefix?: string;
  defaults?: AddressInput | null;
  required?: boolean;
  className?: string;
  /** Wenn die Felder außerhalb des `<form>`-Elements gerendert werden, koppelt dies sie per `form`-Attribut an. */
  formId?: string;
  t: T;
};

function fieldName(prefix: string | undefined, name: string) {
  if (!prefix) {
    return name;
  }

  return `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export default function AddressFields({
  idPrefix,
  namePrefix,
  defaults,
  required = false,
  className = "grid gap-3 sm:grid-cols-2",
  formId,
  t,
}: AddressFieldsProps) {
  const values = addressDefaults(defaults);
  const countryOptions = getCountryOptions(t);

  return (
    <div className={className}>
      <div className="field sm:col-span-2">
        <label htmlFor={`${idPrefix}-care-of`} className="label">
          C/O
        </label>
        <input
          id={`${idPrefix}-care-of`}
          name={fieldName(namePrefix, "careOf")}
          form={formId}
          className="input bg-white"
          defaultValue={values.careOf}
          placeholder={t("optional")}
          autoComplete="address-line2"
          maxLength={255}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-street`} className="label">
          {t("streetLabel")}
        </label>
        <input
          id={`${idPrefix}-street`}
          name={fieldName(namePrefix, "street")}
          form={formId}
          className="input bg-white"
          defaultValue={values.street}
          autoComplete="address-line1"
          required={required}
          maxLength={255}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-house-number`} className="label">
          {t("houseNumberLabel")}
        </label>
        <input
          id={`${idPrefix}-house-number`}
          name={fieldName(namePrefix, "houseNumber")}
          form={formId}
          className="input bg-white"
          defaultValue={values.houseNumber}
          autoComplete="address-line1"
          required={required}
          maxLength={64}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-postal-code`} className="label">
          {t("postalCodeLabel")}
        </label>
        <input
          id={`${idPrefix}-postal-code`}
          name={fieldName(namePrefix, "postalCode")}
          form={formId}
          className="input bg-white"
          defaultValue={values.postalCode}
          autoComplete="postal-code"
          required={required}
          maxLength={32}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-city`} className="label">
          {t("cityLabel")}
        </label>
        <input
          id={`${idPrefix}-city`}
          name={fieldName(namePrefix, "city")}
          form={formId}
          className="input bg-white"
          defaultValue={values.city}
          autoComplete="address-level2"
          required={required}
          maxLength={128}
        />
      </div>
      <div className="field sm:col-span-2">
        <label htmlFor={`${idPrefix}-country`} className="label">
          {t("countryLabel")}
        </label>
        <SelectOrOtherField
          id={`${idPrefix}-country`}
          name={fieldName(namePrefix, "country")}
          form={formId}
          options={countryOptions}
          defaultValue={values.country}
        />
      </div>
    </div>
  );
}
