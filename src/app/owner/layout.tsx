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
  BarChart3,
  Database,
  Check,
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

  const [mounted, setMounted] = useState(false);
  const [demoActionStatus, setDemoActionStatus] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const isLoginPage = pathname === '/owner/login';

  const fetchStats = async () => {
    if (isLoginPage) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch('/api/owner/stats');
      if (res.ok) {
        const data = await res.json();
        setStats({
          needsHumanCount: Number(data?.needsHumanCount) || 0,
          unreadBookingsCount: Number(data?.unreadBookingsCount) || 0,
          unreadEscalationsCount: Number(data?.unreadEscalationsCount) || 0,
        });
      }
    } catch (e) {
      // quiet fail
    }
  };

  useEffect(() => {
    setMounted(true);
    if (!isLoginPage) {
      fetchStats();
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
  }, [pathname, isLoginPage]);

  const handleLogout = async () => {
    try {
      await fetch('/api/owner/logout', { method: 'POST' });
    } catch (e) {
      // quiet
    }
    router.push('/owner/login');
  };

  const handleLoadDemoData = async () => {
    setLoadingDemo(true);
    try {
      const res = await fetch('/api/owner/demo-data', { method: 'POST' });
      if (res.ok) {
        setDemoActionStatus('Demo data loaded!');
        fetchStats();
        setTimeout(() => setDemoActionStatus(null), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDemo(false);
    }
  };

  const handleResetDemoData = async () => {
    setLoadingDemo(true);
    try {
      const res = await fetch('/api/owner/demo-data', { method: 'DELETE' });
      if (res.ok) {
        setDemoActionStatus('Demo data reset.');
        fetchStats();
        setTimeout(() => setDemoActionStatus(null), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDemo(false);
    }
  };

  // If on login page, render children directly without owner shell
  if (isLoginPage) {
    return <>{children}</>;
  }

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
    {
      name: 'Daily Summary',
      href: '/owner/summary',
      icon: BarChart3,
      badge: 0,
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
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map((item) => {
              const active = Boolean(pathname && pathname.startsWith(item.href));
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
                  {mounted && item.badge > 0 && (
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
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Demo Data Controls for Judges */}
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                onClick={handleLoadDemoData}
                disabled={loadingDemo}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-teal-300 px-2.5 py-1.5 rounded-md flex items-center gap-1 border border-slate-700 transition"
                title="Populate demo conversations for judges"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{demoActionStatus ? demoActionStatus : 'Load Demo Data'}</span>
              </button>
            </div>

            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 sm:px-3 py-1.5 rounded-md flex items-center gap-1.5 transition border border-slate-700"
              title="Open customer web chat in new tab"
            >
              <span>Customer Chat</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            <button
              onClick={handleLogout}
              className="text-xs text-rose-300 hover:text-rose-100 hover:bg-rose-950/40 p-1.5 sm:px-2.5 sm:py-1.5 rounded-md flex items-center gap-1 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="lg:hidden flex items-center justify-around bg-slate-800/90 border-t border-slate-700/60 px-2 py-2 overflow-x-auto">
          {navItems.map((item) => {
            const active = Boolean(pathname && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
                  active ? 'bg-teal-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                <div className="relative">
                  <item.icon className="w-4 h-4" />
                  {mounted && item.badge > 0 && (
                    <span
                      className={`absolute -top-1.5 -right-2.5 text-[9px] font-bold px-1 rounded-full ${
                        item.badgeColor || 'bg-rose-500 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-16">{children}</main>

      {/* Subtle Footer */}
      <footer className="bg-white border-t border-slate-200 text-center py-4 text-xs text-slate-400">
        City Health Clinic • Voice-First Local Business Assistant • Powered by Wispr Flow
      </footer>
    </div>
  );
}
