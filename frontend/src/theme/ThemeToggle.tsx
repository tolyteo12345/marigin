import { Button } from '../components/common';
import { useTheme } from './useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <Button
      variant="secondary"
      aria-pressed={isLight}
      aria-label="Chuyển chế độ sáng/tối"
      onClick={toggleTheme}
    >
      {isLight ? '☀️ Light' : '🌙 Dark'}
    </Button>
  );
}
