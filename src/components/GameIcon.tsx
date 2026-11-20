import { Gamepad2, Swords, Zap } from 'lucide-react';

export function GameIcon({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  switch (name) {
    case 'zap':
      return <Zap className={className} />;
    case 'swords':
      return <Swords className={className} />;
    default:
      return <Gamepad2 className={className} />;
  }
}
