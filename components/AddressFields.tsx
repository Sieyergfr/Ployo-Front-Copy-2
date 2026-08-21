import { addressDefaults, type AddressInput } from "@/lib/address";
import SelectOrOtherField from "@/components/SelectOrOtherField";

const countryOptions = [
  { value: "DE", label: "Deutschland" },
  { value: "AT", label: "Österreich" },
  { value: "CH", label: "Schweiz" },
  { value: "NL", label: "Niederlande" },
  { value: "BE", label: "Belgien" },
  { value: "FR", label: "Frankreich" },
  { value: "PL", label: "Polen" },
  { value: "IT", label: "Italien" },
];

type AddressFieldsProps = {
  idPrefix: string;
  namePrefix?: string;
  defaults?: AddressInput | null;
  required?: boolean;
  className?: string;
  /** Wenn die Felder außerhalb des `<form>`-Elements gerendert werden, koppelt dies sie per `form`-Attribut an. */
  formId?: string;
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
}: AddressFieldsProps) {
  const values = addressDefaults(defaults);

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
          placeholder="Optional"
          autoComplete="address-line2"
          maxLength={255}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-street`} className="label">
          Strasse
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
          Hausnummer
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
          Postleitzahl
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
          Stadt
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
          Land
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
