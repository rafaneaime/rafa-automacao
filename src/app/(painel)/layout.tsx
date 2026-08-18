import Link from 'next/link';
import { requirePanelSession } from '@/lib/auth';

export const runtime = 'nodejs';

const LINKS = [
  { href: '/', label: 'Automações' },
  { href: '/contatos', label: 'Contatos' },
  { href: '/logs', label: 'Logs' },
  { href: '/configuracao', label: 'Configuração' },
];

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePanelSession();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <nav className="mb-8 flex gap-4 border-b border-neutral-200 pb-3 text-sm">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
