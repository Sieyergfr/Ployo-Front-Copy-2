"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { EmergencyContact } from "@/lib/employees";

let tempIdCounter = 0;

function createEmptyContact(): EmergencyContact {
  tempIdCounter += 1;

  return { id: `new-${tempIdCounter}`, name: "", relation: "", phone: "", email: "" };
}

export default function EmergencyContactsEditor({
  contacts,
}: {
  contacts: EmergencyContact[];
}) {
  const [rows, setRows] = useState<EmergencyContact[]>(contacts);
  // `contacts` kommt vom Server und ändert bei jedem Re-Render die
  // Objekt-/Array-Referenz — auch wenn sich der Inhalt nicht geändert hat.
  // `useState(contacts)` seedet `rows` deshalb nur beim allerersten Mount;
  // nach einem Speichern (Server Action → Revalidierung → neue Props) zeigte
  // das Formular bislang wieder die alten Werte, bis die Seite neu geladen
  // wurde. Deshalb hier bewusst während des Renderns synchronisieren (React-
  // Pattern "Adjusting state when a prop changes"), sobald sich der Inhalt
  // von `contacts` tatsächlich geändert hat — nicht bei jeder Referenzänderung.
  const [syncedContactsKey, setSyncedContactsKey] = useState(() => JSON.stringify(contacts));
  const contactsKey = JSON.stringify(contacts);

  if (contactsKey !== syncedContactsKey) {
    setSyncedContactsKey(contactsKey);
    setRows(contacts);
  }

  return (
    <div className="grid gap-2.5">
      <input type="hidden" name="emergencyContactsSubmitted" value="1" />
      {rows.map((contact, index) => (
        <div
          key={contact.id}
          className="rounded-xl border border-danger/20 bg-white p-3"
        >
          <input type="hidden" name="emergencyContactId" value={contact.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="field">
              <label htmlFor={`${contact.id}-name`} className="label">
                Name
              </label>
              <input
                id={`${contact.id}-name`}
                className="input bg-white"
                name="emergencyContactName"
                aria-label={`Notfallkontakt ${index + 1} Name`}
                defaultValue={contact.name}
              />
            </div>
            <div className="field">
              <label htmlFor={`${contact.id}-relation`} className="label">
                Beziehung
              </label>
              <input
                id={`${contact.id}-relation`}
                className="input bg-white"
                name="emergencyContactRelation"
                aria-label={`Notfallkontakt ${index + 1} Beziehung`}
                defaultValue={contact.relation}
              />
            </div>
            <div className="field">
              <label htmlFor={`${contact.id}-phone`} className="label">
                Telefon
              </label>
              <input
                id={`${contact.id}-phone`}
                className="input input-mono bg-white"
                name="emergencyContactPhone"
                aria-label={`Notfallkontakt ${index + 1} Telefon`}
                defaultValue={contact.phone}
              />
            </div>
            <div className="field">
              <label htmlFor={`${contact.id}-email`} className="label">
                E-Mail
              </label>
              <input
                id={`${contact.id}-email`}
                className="input bg-white"
                name="emergencyContactEmail"
                aria-label={`Notfallkontakt ${index + 1} E-Mail`}
                defaultValue={contact.email ?? ""}
                placeholder="Optional"
              />
            </div>
          </div>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-danger"
            onClick={() =>
              setRows((prev) => prev.filter((row) => row.id !== contact.id))
            }
          >
            <X size={13} />
            Kontakt entfernen
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm w-fit"
        onClick={() => setRows((prev) => [...prev, createEmptyContact()])}
      >
        Kontakt hinzufügen
      </button>
    </div>
  );
}
