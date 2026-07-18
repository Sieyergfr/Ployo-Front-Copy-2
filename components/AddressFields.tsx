import { addressDefaults, type AddressInput } from "@/lib/address";

type AddressFieldsProps = {
  idPrefix: string;
  namePrefix?: string;
  defaults?: AddressInput | null;
  required?: boolean;
  className?: string;
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
          className="input bg-white"
          defaultValue={values.careOf}
          placeholder="Optional"
          autoComplete="address-line2"
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-street`} className="label">
          Strasse
        </label>
        <input
          id={`${idPrefix}-street`}
          name={fieldName(namePrefix, "street")}
          className="input bg-white"
          defaultValue={values.street}
          autoComplete="address-line1"
          required={required}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-house-number`} className="label">
          Hausnummer
        </label>
        <input
          id={`${idPrefix}-house-number`}
          name={fieldName(namePrefix, "houseNumber")}
          className="input bg-white"
          defaultValue={values.houseNumber}
          autoComplete="address-line1"
          required={required}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-postal-code`} className="label">
          Postleitzahl
        </label>
        <input
          id={`${idPrefix}-postal-code`}
          name={fieldName(namePrefix, "postalCode")}
          className="input bg-white"
          defaultValue={values.postalCode}
          autoComplete="postal-code"
          required={required}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-city`} className="label">
          Stadt
        </label>
        <input
          id={`${idPrefix}-city`}
          name={fieldName(namePrefix, "city")}
          className="input bg-white"
          defaultValue={values.city}
          autoComplete="address-level2"
          required={required}
        />
      </div>
      <div className="field sm:col-span-2">
        <label htmlFor={`${idPrefix}-country`} className="label">
          Land
        </label>
        <input
          id={`${idPrefix}-country`}
          name={fieldName(namePrefix, "country")}
          className="input bg-white"
          defaultValue={values.country}
          autoComplete="country-name"
          required={required}
        />
      </div>
    </div>
  );
}
