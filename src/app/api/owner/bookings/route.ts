// src/app/api/owner/bookings/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { DEMO_CLINIC_ID } from '@/lib/kb/demo-clinic';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const bookings = await db.findBookings(DEMO_CLINIC_ID);

    // Mark unread bookings as read
    for (const b of bookings) {
      if (!b.is_read) {
        await db.markBookingRead(b.id);
      }
    }

    const enriched = await Promise.all(
      bookings.map(async (b) => {
        const customer = await db.getCustomer(b.customer_id);
        return {
          ...b,
          customerName: customer?.name || 'Patient',
          customerContact: customer?.contact || 'Web Chat',
        };
      })
    );

    return NextResponse.json({ bookings: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
  }
}
