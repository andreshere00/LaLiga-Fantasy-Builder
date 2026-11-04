import { Select } from "@base-ui/react/select";
import { copy as localizeCopy, setLanguage, useLanguage } from "../../i18n";

const items = [{ value: "es", label: "Español" }, { value: "en", label: "English" }];
export function LanguageSelector() {
  const selected = useLanguage();
  return <Select.Root items={items} value={selected}
    onValueChange={value => { if (value === "es" || value === "en") setLanguage(value); }}>
    <Select.Trigger className="language-select" aria-label={localizeCopy("Language")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </svg>
      <Select.Value /><Select.Icon aria-hidden="true">▾</Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Positioner className="fb-select-positioner" sideOffset={4}>
      <Select.Popup className="fb-selection-popup"><Select.List>
        {items.map(item => <Select.Item className="fb-item" key={item.value} value={item.value}>
          <Select.ItemText><span lang={item.value}>{item.label}</span></Select.ItemText>
          <Select.ItemIndicator aria-hidden="true">✓</Select.ItemIndicator>
        </Select.Item>)}
      </Select.List></Select.Popup>
    </Select.Positioner></Select.Portal>
  </Select.Root>;
}
