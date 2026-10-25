"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

const questions = ["trial", "audience", "app", "dataLocation", "plans", "cancel"] as const;

export default function LandingFaq() {
  const t = useTranslations("LandingPage.faq");
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="flex flex-col gap-2">
      {questions.map((key, index) => {
        const open = index === openIndex;
        const answerId = `faq-answer-${key}`;

        return (
          <div key={key} className="pl-faq-item pl-glass relative rounded-xl">
            {open && <div className="pl-faq-ring" aria-hidden="true" />}
            <button
              type="button"
              aria-expanded={open}
              aria-controls={answerId}
              onClick={() => setOpenIndex(open ? -1 : index)}
              className="pl-focus relative flex min-h-[60px] w-full cursor-pointer items-center justify-between gap-4 rounded-xl border-0 bg-transparent py-[18px] pr-[18px] pl-[22px] text-left"
            >
              <span className="text-[15.5px] leading-[1.4] font-semibold text-ink">
                {t(`${key}.question`)}
              </span>
              {open ? (
                <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-ink text-white shadow-[0_6px_16px_-6px_rgba(139,110,212,0.8)]">
                  <Minus size={14} strokeWidth={2.5} aria-hidden="true" />
                </span>
              ) : (
                <span className="pl-icon-flat flex size-[30px] shrink-0 items-center justify-center rounded-lg text-[#7a3c9c]">
                  <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                </span>
              )}
            </button>
            {open && (
              <p
                id={answerId}
                className="pl-faq-answer relative m-0 pr-16 pb-5 pl-[22px] text-[14.5px] leading-[1.65] text-muted-2"
              >
                {t(`${key}.answer`)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
