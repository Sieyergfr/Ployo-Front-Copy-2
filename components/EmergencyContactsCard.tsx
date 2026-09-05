"use client";

import {
  addEmergencyContactAction,
  deleteEmergencyContactAction,
  setPrimaryEmergencyContactAction,
  updateEmergencyContactAction,
} from "@/app/(dashboard)/u/[tenant]/employees/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { useActionStateWithToast } from "@/components/Toasts";
import { useUniversalPopup } from "@/components/UniversalPopup";
import type { EmergencyContact } from "@/lib/employees";
import { AlertTriangle, Ellipsis, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type T = ReturnType<typeof useTranslations>;

/**
 * Rendert das versteckte Aktions-Formular über ein Portal nach `document.body`.
 * Diese Karte sitzt im Bearbeiten-Modus innerhalb des großen
 * `employee-edit-form` — ein verschachteltes `<form>` wäre ungültiges HTML
 * (der Browser schließt beim Parsen das äußere Formular vorzeitig, sobald er
 * auf das End-Tag des inneren trifft, wodurch alles danach im DOM aus dem
 * äußeren Formular herausfällt und "Speichern" nur noch einen Teil der Felder
 * abschickt). Erst nach dem Mount rendern, da `document.body` serverseitig
 * nicht existiert.
 */
function ContactActionsForm({
  formId,
  tenant,
  employeeId,
  employeeHandle,
  contactId,
}: {
  formId: string;
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  contactId: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Portal-Ziel (document.body) existiert erst nach dem Client-Mount —
    // absichtlich kein SSR-Zweig, keine Cascading-Render-Sorge (Effekt läuft
    // genau einmal, Re-Render bleibt lokal auf diese kleine Komponente).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <form id={formId} className="hidden" aria-hidden="true">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      <input type="hidden" name="contactId" value={contactId} />
    </form>,
    document.body,
  );
}

function ContactForm({
  tenant,
  employeeId,
  employeeHandle,
  contact,
  onDone,
  t,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  contact?: EmergencyContact;
  onDone: () => void;
  t: T;
}) {
  const [, addFormAction] = useActionStateWithToast(addEmergencyContactAction);
  const [, updateFormAction] = useActionStateWithToast(updateEmergencyContactAction);

  return (
    <form
      className="flex flex-col gap-4"
      action={contact ? updateFormAction : addFormAction}
    >
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="employeeHandle" value={employeeHandle} />
      {contact && <input type="hidden" name="contactId" value={contact.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="contact-name" className="label">
            {t("nameLabel")}
          </label>
          <input
            id="contact-name"
            name="name"
            className="input"
            defaultValue={contact?.name}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="contact-relation" className="label">
            {t("relationLabel")}
          </label>
          <input
            id="contact-relation"
            name="relation"
            className="input"
            defaultValue={contact?.relation}
          />
        </div>
        <div className="field">
          <label htmlFor="contact-phone" className="label">
            {t("phoneLabel")}
          </label>
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            className="input input-mono"
            defaultValue={contact?.phone}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="contact-email" className="label">
            {t("emailLabel")}
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            className="input"
            defaultValue={contact?.email}
            placeholder={t("optional")}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="contact-note" className="label">
          {t("noteLabel")}
        </label>
        <input
          id="contact-note"
          name="note"
          className="input"
          defaultValue={contact?.note}
          placeholder={t("optional")}
        />
      </div>

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <button type="submit" className="btn btn-primary">
          {contact ? t("save") : t("add")}
        </button>
      </div>
    </form>
  );
}

function ContactQuickMenu({
  formId,
  contact,
  onEdit,
  t,
}: {
  formId: string;
  contact: EmergencyContact;
  onEdit: () => void;
  t: T;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [, setPrimaryFormAction] = useActionStateWithToast(setPrimaryEmergencyContactAction);
  const [, deleteFormAction] = useActionStateWithToast(deleteEmergencyContactAction);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label={t("actionsAria")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Ellipsis size={14} />
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[220px] rounded-[12px] border border-border bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] font-medium text-ink hover:bg-bg"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
          >
            <Pencil size={13} />
            {t("edit")}
          </button>
          {!contact.isPrimary && (
            <button
              type="submit"
              role="menuitem"
              form={formId}
              formAction={setPrimaryFormAction}
              className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] font-medium text-ink hover:bg-bg"
            >
              <Star size={13} />
              {t("setPrimary")}
            </button>
          )}
          <ConfirmSubmitButton
            form={formId}
            formAction={deleteFormAction}
            className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] font-medium text-danger hover:bg-danger/5"
            description={t("deleteConfirmDescription", { name: contact.name })}
          >
            <Trash2 size={13} />
            {t("delete")}
          </ConfirmSubmitButton>
        </div>
      )}
    </div>
  );
}

export default function EmergencyContactsCard({
  tenant,
  employeeId,
  employeeHandle,
  contacts,
}: {
  tenant: string;
  employeeId: string;
  employeeHandle: string;
  contacts: EmergencyContact[];
}) {
  const t = useTranslations("EmergencyContactsCard");
  const { openPopup, closePopup } = useUniversalPopup();

  function openContactForm(contact?: EmergencyContact) {
    openPopup({
      title: contact ? t("editContactTitle") : t("addContactTitle"),
      content: (
        <ContactForm
          tenant={tenant}
          employeeId={employeeId}
          employeeHandle={employeeHandle}
          contact={contact}
          onDone={closePopup}
          t={t}
        />
      ),
    });
  }

  return (
    <section>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-[-0.3px] text-danger">
          <AlertTriangle size={17} />
          {t("sectionTitle")}
        </h2>
        <button
          type="button"
          aria-label={t("addContactTitle")}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border bg-white text-muted transition-colors hover:border-muted hover:text-ink"
          onClick={() => openContactForm()}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="grid gap-2.5">
        {contacts.length === 0 && (
          <p className="text-[12.5px] text-muted">{t("noContactsYet")}</p>
        )}
        {contacts.map((contact) => {
          const formId = `emergency-contact-actions-${contact.id}`;

          return (
            <div key={contact.id} className="rounded-xl border border-border-soft bg-white p-3">
              <ContactActionsForm
                formId={formId}
                tenant={tenant}
                employeeId={employeeId}
                employeeHandle={employeeHandle}
                contactId={contact.id}
              />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-ink">
                      {contact.name}
                    </span>
                    {contact.isPrimary && (
                      <span title={t("primaryContactTitle")}>
                        <Star size={12} className="shrink-0 text-warning" fill="currentColor" />
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">{contact.relation}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold text-danger">
                    {contact.phone}
                  </span>
                  <ContactQuickMenu
                    formId={formId}
                    contact={contact}
                    onEdit={() => openContactForm(contact)}
                    t={t}
                  />
                </div>
              </div>
              {contact.note && (
                <div className="mt-2 text-[12px] text-muted-2">{contact.note}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
