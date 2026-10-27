'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Inbox,
  HelpCircle,
  Sparkles,
  Calendar,
  LogOut,
  ExternalLink,
  Stethoscope,
  Bell,
} from 'lucide-react';

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [stats, setStats] = useState<{
    needsHumanCount: number;
    unreadBookingsCount: number;
    unreadEscalationsCount: number;
  }>({
    needsHumanCount: 0,
    unreadBookingsCount: 0,
    unreadEscalationsCount: 0,
  });

  // Don't render owner shell on login page
  if (pathname === '/owner/login') {
    return <>{children}</>;
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/owner/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/owner/logout', { method: 'POST' });
    router.push('/owner/login');
  };

  const navItems = [
    {
      name: 'Inbox',
      href: '/owner/inbox',
      icon: Inbox,
      badge: stats.needsHumanCount,
      badgeColor: 'bg-amber-500 text-white',
    },
    {
      name: 'Unanswered & Fixes',
      href: '/owner/unanswered',
      icon: HelpCircle,
      badge: stats.unreadEscalationsCount,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      name: 'Voice KB Setup',
      href: '/owner/setup',
      icon: Sparkles,
      badge: 0,
    },
    {
      name: 'Bookings',
      href: '/owner/bookings',
      icon: Calendar,
      badge: stats.unreadBookingsCount,
      badgeColor: 'bg-blue-500 text-white',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center text-white shadow">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base text-white tracking-tight flex items-center gap-2">
                City Health Clinic
                <span className="text-[10px] bg-teal-900 text-teal-300 font-mono px-2 py-0.5 rounded border border-teal-700">
                  Owner Console
                </span>
              </span>
              <p className="text-[11px] text-slate-400">Voice-Configured via Wispr Flow</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                    active
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.name}</span>
                  {item.badge > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        item.badgeColor || 'bg-slate-700 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="flex items-center space-x-3">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition border border-slate-700"
              title="Open customer web chat in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden sm:inline">Customer Chat</span>
            </a>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-rose-400 p-2 rounded-md hover:bg-slate-800 transition"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sub-Navigation Bar */}
      <div className="md:hidden bg-slate-800 text-slate-300 border-b border-slate-700 overflow-x-auto no-scrollbar flex">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex-1 min-w-[90px] py-2.5 px-2 text-center text-xs font-medium flex flex-col items-center gap-1 border-b-2 transition ${
                active
                  ? 'border-teal-400 text-white bg-slate-900/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <item.icon className="w-4 h-4" />
                {item.badge > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 text-[9px] font-bold px-1 rounded-full ${
                      item.badgeColor || 'bg-rose-500 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
