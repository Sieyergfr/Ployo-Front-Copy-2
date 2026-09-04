"use client";

import { useActionState } from "react";
import {
  linkOwnEmployeeAction,
  unlinkOwnEmployeeAction,
} from "@/app/(dashboard)/u/[tenant]/mein-bereich/actions";
import EmployeeSelector from "@/components/EmployeeSelector";
import FormSubmitButton from "@/components/FormSubmitButton";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import { useCloseOnSuccess, useUniversalPopup } from "@/components/UniversalPopup";
import type { ActionState } from "@/lib/action-state";
import { Link2, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";

const initialState: ActionState = {};

type UnlinkedEmployee = {
  id: string;
  initials: string;
  name: string;
  employeeNumber: string;
  location: string;
  team: string;
  role: string;
};

function LinkExistingForm({
  tenant,
  employees,
  onDone,
}: {
  tenant: string;
  employees: UnlinkedEmployee[];
  onDone: () => void;
}) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const [state, formAction, isPending] = useActionState(linkOwnEmployeeAction, initialState);
  useCloseOnSuccess(state, isPending, onDone);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <EmployeeSelector
        label={t("employeeRecord")}
        name="employeeId"
        mode="single"
        options={employees}
      />
      <FieldErrors errors={state.fieldErrors?.employeeId} />

      <p className="m-0 text-[12.5px] leading-[1.55] text-muted-2">
        {t("linkDescription")}
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton Icon={Link2} pendingLabel={t("linking")}>
          {t("link")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

function UnlinkConfirmForm({
  tenant,
  employeeName,
  onDone,
}: {
  tenant: string;
  employeeName: string;
  onDone: () => void;
}) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const [state, formAction, isPending] = useActionState(unlinkOwnEmployeeAction, initialState);
  useCloseOnSuccess(state, isPending, onDone);

  return (
    <form className="flex flex-col gap-4" action={formAction}>
      <input type="hidden" name="tenant" value={tenant} />

      <p className="m-0 text-[13px] leading-[1.55] text-muted-2">
        {t.rich("unlinkDescription", {
          name: employeeName,
          b: (chunks) => <strong className="text-ink">{chunks}</strong>,
        })}
      </p>

      <FormErrorBanner message={state.error} />

      <div className="mt-1 flex justify-end gap-2.5 border-t border-border-soft pt-4">
        <button type="button" className="btn btn-secondary" onClick={onDone}>
          {t("cancel")}
        </button>
        <FormSubmitButton
          Icon={Unlink}
          pendingLabel={t("unlinking")}
          className="btn btn-secondary border-danger/25 text-danger hover:border-danger/40 hover:bg-danger/5"
        >
          {t("unlinkConfirm")}
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function UnlinkOwnEmployeeButton({
  tenant,
  employeeName,
}: {
  tenant: string;
  employeeName: string;
}) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const { openPopup, closePopup } = useUniversalPopup();

  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm text-danger"
      onClick={() =>
        openPopup({
          title: t("unlinkConfirm"),
          content: (
            <UnlinkConfirmForm tenant={tenant} employeeName={employeeName} onDone={closePopup} />
          ),
        })
      }
    >
      {t("unlinkConfirm")}
    </button>
  );
}

type SelfServiceEmployeeLinkProps = {
  tenant: string;
  unlinkedEmployees: UnlinkedEmployee[];
};

/**
 * Nur noch "Bestehendes Profil verknüpfen" — das Anlegen eines neuen,
 * eigenen Profils per Self-Service wurde bewusst entfernt (To-Do:
 * "Konto verknüpfen => Mitarbeiter auswählen, statt anlegen"). Fehlt eine
 * unverknüpfte Personalakte im Betrieb, muss HR eine anlegen bzw.
 * verknüpfen.
 */
export default function SelfServiceEmployeeLink({
  tenant,
  unlinkedEmployees,
}: SelfServiceEmployeeLinkProps) {
  const t = useTranslations("SelfServiceEmployeeLink");
  const { openPopup, closePopup } = useUniversalPopup();

  if (unlinkedEmployees.length === 0) {
    return (
      <p className="mt-4 text-center text-[12.5px] leading-[1.55] text-muted-2">
        {t("noUnlinkedProfile")}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2.5">
      <button
        type="button"
        className="btn btn-primary"
        onClick={() =>
          openPopup({
            title: t("linkExisting"),
            content: (
              <LinkExistingForm
                tenant={tenant}
                employees={unlinkedEmployees}
                onDone={closePopup}
              />
            ),
          })
        }
      >
        <Link2 size={15} />
        {t("linkExisting")}
      </button>
    </div>
  );
}
