"use client";

import { useUniversalPopup } from "@/components/UniversalPopup";
import { FileUp, MessageSquarePlus, Send } from "lucide-react";
import { useState } from "react";

function InfoRequestForm({
  employeeName,
  onDone,
}: {
  employeeName: string;
  onDone: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setIsSubmitting(true);
        window.setTimeout(() => {
          setIsSubmitting(false);
          onDone();
        }, 350);
      }}
    >
      <div className="rounded-xl border border-border bg-bg p-3 text-[12.5px] text-muted-2">
        Anfrage an <span className="font-semibold text-ink">{employeeName}</span>.
        Dateien sind fuer Mitarbeiter optional, koennen aber ausdruecklich
        angefordert werden.
      </div>
      <div className="field">
        <label htmlFor="info-request-title" className="label">
          Benoetigte Information
        </label>
        <input
          id="info-request-title"
          name="title"
          className="input"
          placeholder="z. B. neue Adresse, Zertifikat, Bankdaten"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="info-request-due" className="label">
            Frist
          </label>
          <input id="info-request-due" name="due" type="date" className="input" />
        </div>
        <label className="checkbox-row mt-6">
          <input type="checkbox" name="fileRequired" className="peer sr-only" />
          <span className="checkbox" />
          <span className="checkbox-label">Datei gewuenscht</span>
        </label>
      </div>
      <div className="field">
        <label htmlFor="info-request-message" className="label">
          Nachricht
        </label>
        <textarea
          id="info-request-message"
          name="message"
          className="input min-h-28 resize-none"
          placeholder="Kurz erklaeren, was hochgeladen oder bestaetigt werden soll"
        />
      </div>
      <label
        htmlFor="info-request-template"
        className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-bg px-4 py-4 transition-colors hover:border-muted"
      >
        <FileUp size={18} className="text-muted-2" />
        <span>
          <span className="block text-[13px] font-semibold text-ink">
            Vorlage anhaengen
          </span>
          <span className="mt-0.5 block text-[11.5px] text-muted">
            Optional fuer Formulare oder Beispiele
          </span>
        </span>
      </label>
      <input id="info-request-template" type="file" className="sr-only" />
      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          Abbrechen
        </button>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? (
            "Wird gesendet..."
          ) : (
            <>
              <Send size={15} />
              Anfrage senden
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export default function EmployeeInfoRequestButton({
  employeeName,
}: {
  employeeName: string;
}) {
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() =>
        openPopup({
          title: "Info anfragen",
          content: (
            <InfoRequestForm employeeName={employeeName} onDone={closePopup} />
          ),
        })
      }
    >
      <MessageSquarePlus size={14} />
      Info anfragen
    </button>
  );
}
