import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import InfoTip from "../InfoTip";
import { splitGlossaryText } from "../../utils/termGlossary";
import { useGlossaryEnabled } from "./GlossaryProvider";

interface GlossaryTextProps {
  children: ReactNode;
}

/** Explain known terms without changing their wording. */
export default function GlossaryText({ children }: GlossaryTextProps) {
  const { t } = useTranslation("termGlossary");
  const enabled = useGlossaryEnabled();
  if (!enabled || typeof children !== "string") return children;

  return splitGlossaryText(children).map(({ text, termId }, index) => {
    if (!termId) return <Fragment key={index}>{text}</Fragment>;
    const title = t(`terms.${termId}.label`);
    const description = t(`terms.${termId}.description`);
    return (
      <span key={index} data-glossary-term={termId}>
        <InfoTip title={title} content={description} label={t("openLabel", { term: text })} termId={termId}>
          {text}
        </InfoTip>
      </span>
    );
  });
}
