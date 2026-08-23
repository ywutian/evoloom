import { NavigationLink } from "#/components/shared/navigation-link";
import { EvoLoomWordmark } from "#/evoloom/brand";
import { copy, useEvoLoomLocale } from "#/evoloom/locale";
import type { EvoLoomConfig } from "#/evoloom/config";

interface EvoLoomHeaderProps {
  config?: EvoLoomConfig | null;
  onModelChange?: (model: string) => void;
  modelPending?: boolean;
}

export function EvoLoomHeader({
  config,
  onModelChange,
  modelPending = false,
}: EvoLoomHeaderProps) {
  const { locale, setLocale } = useEvoLoomLocale();
  const text = copy[locale];

  return (
    <header className="evoloom-header">
      <EvoLoomWordmark />
      <nav aria-label={text.header.navigation} className="evoloom-header__nav">
        <NavigationLink to="/proof" className="evoloom-nav-link">
          {text.nav.proof}
        </NavigationLink>
        <button
          type="button"
          className="evoloom-language-toggle"
          onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}
          aria-label={text.header.switchLanguage}
        >
          {text.header.language}
        </button>
        {config && onModelChange ? (
          <label className="evoloom-model-select">
            <span className="sr-only">{text.header.model}</span>
            <select
              value={config.selected_model}
              disabled={modelPending}
              onChange={(event) => onModelChange(event.target.value)}
            >
              {config.available_models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </nav>
    </header>
  );
}
