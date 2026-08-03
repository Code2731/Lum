
interface SectionIntroHeaderProps {
  title: string;
  description: string;
  aside?: React.ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
}

export interface SectionIntroHeaderTextMeta {
  titleTitle: string;
  descriptionTitle: string;
}

export function getSectionIntroHeaderTextMeta(
  title: string,
  description: string,
): SectionIntroHeaderTextMeta {
  return {
    titleTitle: title,
    descriptionTitle: description,
  };
}

export function SectionIntroHeader({
  title,
  description,
  aside,
  titleClassName = "text-white/45 uppercase tracking-[0.06em] text-xs",
  descriptionClassName = "mt-1 text-[11px] leading-4 text-white/38",
}: SectionIntroHeaderProps) {
  const textMeta = getSectionIntroHeaderTextMeta(title, description);

  return (
    <div role="group" aria-label={title} className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className={titleClassName} title={textMeta.titleTitle}>{title}</h3>
        <p className={descriptionClassName} title={textMeta.descriptionTitle}>
          {description}
        </p>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}
