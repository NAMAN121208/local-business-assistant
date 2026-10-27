// src/app/api/owner/bookings/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await db.cancelBooking(id);
    if (!success) {
      return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 400 });
    }
    return NextResponse.json({ success: true, bookingId: id, status: 'cancelled' });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
  }
}
