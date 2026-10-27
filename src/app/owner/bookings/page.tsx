'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  XCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface BookingRecord {
  id: string;
  service: string;
  start_time: string;
  end_time: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  customerName: string;
  customerContact: string;
  created_at: string;
}

export default function OwnerBookingsPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchBookings = async () => {
    try {
      const res = await fetch('/api/owner/bookings');
      if (res.ok) {
        const data = await res.json();
        setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    const interval = setInterval(fetchBookings, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCancelBooking = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this booking? This will immediately free the slot in the clinic calendar.')) {
      return;
    }

    setCancellingId(id);
    try {
      const res = await fetch(`/api/owner/bookings/${id}/cancel`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchBookings();
      }
    } finally {
      setCancellingId(null);
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (filter === 'all') return true;
    return b.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-teal-600" />
            Clinic Appointment Calendar
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Section 7.3: Review booked slots. Cancelling a booking instantly frees the 30-min slot in the deterministic availability engine.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            {(['all', 'confirmed', 'cancelled'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition ${
                  filter === status
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setLoading(true);
              fetchBookings();
            }}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Refresh bookings"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bookings Table / Cards */}
      {loading && bookings.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <div className="w-8 h-8 rounded-full border-2 border-teal-600 border-t-transparent animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-slate-500">Loading appointments...</p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No appointments found</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
            Bookings created by customers in the web chat will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          {filteredBookings.map((b) => {
            const startDate = b.start_time ? new Date(b.start_time) : null;
            const timeStr =
              mounted && startDate
                ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';
            const dateStr =
              mounted && startDate
                ? startDate.toLocaleDateString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                : '';

            const isConfirmed = b.status === 'confirmed';

            return (
              <div
                key={b.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      {b.id}
                    </span>
                    <span className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                      <User className="w-4 h-4 text-slate-400" />
                      {b.customerName || 'Patient'}
                    </span>
                    <span className="text-xs text-slate-400">({b.customerContact || 'Web Chat'})</span>

                    {/* Status Badge */}
                    {isConfirmed ? (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Confirmed
                      </span>
                    ) : (
                      <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Cancelled
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-medium text-slate-700">{b.service}</p>
                  {b.notes && <p className="text-xs text-slate-500 italic">Notes: {b.notes}</p>}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 flex-shrink-0">
                  <div className="text-right">
                    <div
                      className="text-xs font-bold text-slate-900 flex items-center gap-1 sm:justify-end"
                      suppressHydrationWarning
                    >
                      <Clock className="w-3.5 h-3.5 text-teal-600" />
                      {timeStr}
                    </div>
                    <div className="text-[11px] text-slate-500" suppressHydrationWarning>
                      {dateStr}
                    </div>
                  </div>

                  {isConfirmed && (
                    <button
                      onClick={() => handleCancelBooking(b.id)}
                      disabled={cancellingId === b.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-transparent transition flex items-center gap-1 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{cancellingId === b.id ? 'Cancelling...' : 'Cancel'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
