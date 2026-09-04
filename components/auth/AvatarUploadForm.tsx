"use client";

import { useActionState } from "react";
import Image from "next/image";
import { uploadAvatarAction } from "@/app/(dashboard)/konto/actions";
import { FieldErrors, FormErrorBanner } from "@/components/FormFeedback";
import type { ActionState } from "@/lib/action-state";
import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";

const initialState: ActionState = {};

export default function AvatarUploadForm({
  image,
  initials,
}: {
  image: string | null;
  initials: string;
}) {
  const t = useTranslations("AvatarUploadForm");
  const [state, formAction] = useActionState(uploadAvatarAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-4">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-[16px] font-semibold text-white">
        {image ? (
          <Image
            src={image}
            alt=""
            width={56}
            height={56}
            className="size-14 object-cover"
            unoptimized
          />
        ) : (
          initials
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="btn btn-secondary btn-sm w-fit cursor-pointer">
          <Camera size={13} />
          {t("changePhoto")}
          <input
            type="file"
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        </label>
        <FieldErrors errors={state.fieldErrors?.avatar} />
        <FormErrorBanner message={state.error} />
        <p className="text-[11px] text-muted-2">{t("fileHint")}</p>
      </div>
    </form>
  );
}
