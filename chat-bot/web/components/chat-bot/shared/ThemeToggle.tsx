import { APP_THEMES, type AppTheme, setAppTheme, useAppTheme } from "../../../theme/appTheme";

/** Light / Dark / System switch. Shown on the sign-in page, the chat bot list and the builder. */
export const ThemeToggle = ({ compact = false }: { compact?: boolean }) => {
  const theme = useAppTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Appearance">
      {APP_THEMES.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          className={`theme-toggle__option${theme === value ? " is-selected" : ""}`}
          aria-pressed={theme === value}
          title={label}
          onClick={() => setAppTheme(value as AppTheme)}
        >
          <span aria-hidden="true">{icon}</span>
          {!compact && <span className="theme-toggle__label">{label}</span>}
        </button>
      ))}
    </div>
  );
};
