import { NextResponse } from 'next/server';

/**
 * Dev-only convenience route: Flutterwave can't deliver webhooks to a
 * localhost URL, so this builds the same payload shape it would send and
 * forwards it to the real webhook handler. The real handler doesn't trust
 * amount/status from the body anyway — it independently re-verifies via
 * verifyTransaction() — so the placeholder values here don't affect what
 * gets validated, only the id/tx_ref used to look up the transaction.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const transactionId = body?.transactionId;
  const txRef = body?.txRef;

  if (!transactionId || !txRef) {
    return NextResponse.json({ message: 'transactionId and txRef are required' }, { status: 400 });
  }

  const webhookSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { message: 'FLUTTERWAVE_WEBHOOK_SECRET is not set' },
      { status: 500 }
    );
  }

  const simulatedEvent = {
    event: 'charge.completed',
    data: {
      id: Number(transactionId),
      tx_ref: txRef,
      flw_ref: `SIMULATED-${txRef}`,
      amount: 0,
      currency: 'NGN',
      charged_amount: 0,
      status: 'successful',
      payment_type: 'card',
    },
  };

  const response = await fetch('http://localhost:3000/api/payment/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'verif-hash': webhookSecret,
    },
    body: JSON.stringify(simulatedEvent),
  });

  const data = await response.json().catch(() => null);

  return NextResponse.json(data, { status: response.status });
}
