'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Activity, BarChart3, ClipboardList, FileText, Send, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  const isActive = (path: string) => {
    return pathname === path;
  };

  const navItems = [
    { href: '/', label: 'Registro de Paciente', icon: ClipboardList },
    { href: '/patients', label: 'Galeria', icon: Users },
    { href: '/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/medical', label: 'Fila de Laudos', icon: Activity },
    { href: '/referrals', label: 'Encaminhamentos', icon: Send },
    { href: '/results', label: 'Resultados', icon: FileText },
  ];

  return (
    <nav className="glass-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex w-full justify-between items-center">
            <div className="flex-shrink-0 flex items-center group cursor-pointer" onClick={() => router.push('/')}>
              <div className="bg-cardinal-700 p-2 rounded-lg transition-transform duration-300 group-hover:rotate-12">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <span className="ml-3 text-2xl font-serif font-bold tracking-tight text-charcoal">
                Neuro<span className="text-cardinal-700">App</span>
              </span>
            </div>

            <div className="hidden lg:flex lg:items-center lg:space-x-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center px-4 py-2 text-sm font-medium rounded-full transition-all duration-300 ${isActive(href)
                    ? 'text-cardinal-700 bg-cardinal-50'
                    : 'text-gray-500 hover:text-charcoal hover:bg-sandstone-50'
                    }`}
                >
                  <Icon className={`h-4 w-4 mr-2 ${isActive(href) ? 'text-cardinal-700' : 'text-gray-400'}`} />
                  {label}
                  {isActive(href) && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-cardinal-700 rounded-full" />
                  )}
                </Link>
              ))}

              <button
                onClick={handleLogout}
                className="ml-4 p-2 text-sandstone-400 hover:text-cardinal-700 transition-colors"
                title="Sair"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>

            <div className="lg:hidden">
              {/* Mobile menu button could go here */}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu - simplified for this view */}
      <div className="lg:hidden border-t border-sandstone-100 bg-white/50 backdrop-blur-md">
        <div className="px-2 pt-2 pb-3 flex overflow-x-auto no-scrollbar">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex-shrink-0 flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all ${isActive(href)
                ? 'bg-cardinal-50 text-cardinal-700 shadow-sm'
                : 'text-gray-500 hover:bg-white/50'
                }`}
            >
              <Icon className="h-4 w-4 mr-2" />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

