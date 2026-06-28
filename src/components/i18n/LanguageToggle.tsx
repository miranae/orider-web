import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useLocale } from '../../contexts/LocaleContext';
import { SUPPORTED_LANGS, type Lang } from '../../i18n/detector';
import { Chip } from "../../theme/components";

const LABELS: Record<Lang, string> = { ko: 'KO', en: 'EN' };
const languageFocusClass = "rounded-[var(--r-sm)] px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)]";

export function LanguageToggle({ variant = 'menu' }: { variant?: 'header' | 'menu' }) {
  const { locale, setLocale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useParams();

  const onPick = async (next: Lang) => {
    if (next === locale) return;
    await setLocale(next);
    if (lang) {
      const rest = location.pathname.replace(/^\/[^/]+/, '');
      navigate(`/${next}${rest}${location.search}${location.hash}`, { replace: true });
    }
  };

  if (variant === 'header') {
    return (
      <Chip className="flex items-center gap-1 text-[length:var(--fs-xs)]">
        {SUPPORTED_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onPick(l)}
            aria-pressed={locale === l}
            className={`${languageFocusClass} ${locale === l ? 'font-bold' : 'opacity-60'}`}
          >
            {LABELS[l]}
          </button>
        ))}
      </Chip>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {SUPPORTED_LANGS.map((l) => (
        <label key={l} className="flex items-center gap-2">
          <input
            type="radio"
            name="locale"
            value={l}
            checked={locale === l}
            onChange={() => onPick(l)}
          />
          <span>{l === 'ko' ? '한국어' : 'English'}</span>
        </label>
      ))}
    </div>
  );
}
