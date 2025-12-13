import { NextRequest, NextResponse } from 'next/server';
import { 
  getExchangeRates, 
  getExchangeRate, 
  getSupportedCurrencies, 
  calculateTransfer,
  createTransferOrder,
  formatCurrency,
  getUserTransfers,
  getAllRecentTransactions,
  calculateFee,
  getCountryInfo,
  getIkambaRemitContext,
  getActivePaymentReceivers,
  getPaymentReceiverForCurrency,
  validateTransferOrder,
  fetchLiveRatesFromAPI,
  getUserProfile,
  upsertUserProfile,
  extractSenderDetails,
  getUserPreferredCurrency,
  CURRENCY_CONFIG,
  COUNTRY_CONFIG,
} from '@/lib/ikamba-remit';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'rates':
        const rates = await getExchangeRates();
        return NextResponse.json({ success: true, data: rates });

      case 'live-rates':
        // Fetch raw rates directly from API
        const liveRates = await fetchLiveRatesFromAPI();
        return NextResponse.json({ success: true, data: liveRates });

      case 'currencies':
        const currencies = getSupportedCurrencies();
        return NextResponse.json({ success: true, data: currencies });

      case 'countries':
        return NextResponse.json({ success: true, data: COUNTRY_CONFIG });

      case 'rate':
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        if (!from || !to) {
          return NextResponse.json({ success: false, error: 'Missing from or to currency' }, { status: 400 });
        }
        const rate = await getExchangeRate(from, to);
        if (!rate) {
          return NextResponse.json({ success: false, error: `No rate found for ${from} to ${to}` }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: rate });

      case 'calculate':
        const calcFrom = searchParams.get('from') || 'RUB';
        const calcTo = searchParams.get('to') || 'RWF';
        const amount = parseFloat(searchParams.get('amount') || '0');
        
        if (amount <= 0) {
          return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
        }
        
        const calculation = await calculateTransfer(amount, calcFrom, calcTo);
        if (!calculation) {
          return NextResponse.json({ success: false, error: `Cannot calculate transfer for ${calcFrom} to ${calcTo}` }, { status: 400 });
        }
        return NextResponse.json({ success: true, data: calculation });

      case 'fee':
        const feeFrom = searchParams.get('from') || 'RUB';
        const feeTo = searchParams.get('to') || 'RWF';
        const feeAmount = parseFloat(searchParams.get('amount') || '1000');
        const feeResult = calculateFee(feeAmount, feeFrom, feeTo);
        return NextResponse.json({ success: true, data: feeResult });

      case 'payment-receivers':
        // Get all active payment receivers
        const receivers = await getActivePaymentReceivers();
        return NextResponse.json({ success: true, data: receivers });

      case 'payment-receiver':
        // Get payment receiver for specific currency
        const currency = searchParams.get('currency');
        if (!currency) {
          return NextResponse.json({ success: false, error: 'Missing currency' }, { status: 400 });
        }
        const receiver = await getPaymentReceiverForCurrency(currency);
        if (!receiver) {
          return NextResponse.json({ success: false, error: `No active payment receiver for ${currency}` }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: receiver });

      case 'user-profile':
        // Get user profile by userId
        const profileUserId = searchParams.get('userId');
        if (!profileUserId) {
          return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
        }
        const userProfile = await getUserProfile(profileUserId);
        if (!userProfile) {
          return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }
        const senderDetails = extractSenderDetails(userProfile, profileUserId);
        const preferredCurrency = getUserPreferredCurrency(userProfile);
        return NextResponse.json({ 
          success: true, 
          data: {
            profile: userProfile,
            senderDetails,
            preferredCurrency
          }
        });

      case 'user-transfers':
        const userId = searchParams.get('userId');
        if (!userId) {
          return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
        }
        const userTransfers = await getUserTransfers(userId);
        return NextResponse.json({ success: true, data: userTransfers });

      case 'all-transfers':
        const allTransfers = await getAllRecentTransactions();
        return NextResponse.json({ success: true, data: allTransfers });

      case 'context':
        const context = await getIkambaRemitContext();
        return NextResponse.json({ success: true, data: context });

      default:
        // Return all data for AI context
        const [allRates, allCurrencies, allReceivers] = await Promise.all([
          getExchangeRates(),
          Promise.resolve(getSupportedCurrencies()),
          getActivePaymentReceivers(),
        ]);
        return NextResponse.json({ 
          success: true, 
          data: { 
            rates: allRates, 
            currencies: allCurrencies,
            countries: COUNTRY_CONFIG,
            paymentReceivers: allReceivers,
          } 
        });
    }
  } catch (error) {
    console.error('Ikamba Remit API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'validate-order': {
        // Validate order without creating it
        const { order } = body;
        if (!order) {
          return NextResponse.json(
            { success: false, error: 'Order data required' },
            { status: 400 }
          );
        }
        const validation = await validateTransferOrder(order);
        return NextResponse.json({ success: true, data: validation });
      }

      case 'create-order': {
        const { order } = body;
        
        if (!order) {
          return NextResponse.json(
            { success: false, error: 'Order data required' },
            { status: 400 }
          );
        }

        // The createTransferOrder function now handles validation and sender details
        const result = await createTransferOrder(order);
        
        if (!result.success) {
          return NextResponse.json(result, { status: 400 });
        }
        
        // Build detailed message for AI
        let message = `Order #${result.orderId} created successfully.`;
        if (result.senderDetails) {
          message += ` Sender: ${result.senderDetails.senderName} (${result.senderDetails.senderEmail}).`;
        }
        if (result.paymentInstructions) {
          message += ` ${result.paymentInstructions.instructions}`;
        }
        
        return NextResponse.json({
          success: true,
          orderId: result.orderId,
          transactionId: result.transactionId,
          senderDetails: result.senderDetails,
          validation: result.validation,
          paymentInstructions: result.paymentInstructions,
          message,
        });
      }

      case 'calculate': {
        const { from, to, amount } = body;
        if (!from || !to || !amount) {
          return NextResponse.json(
            { success: false, error: 'Missing from, to, or amount' },
            { status: 400 }
          );
        }
        const calculation = await calculateTransfer(amount, from, to);
        if (!calculation) {
          return NextResponse.json(
            { success: false, error: `Cannot calculate transfer for ${from} to ${to}` },
            { status: 400 }
          );
        }
        
        // Also get payment receiver info
        const receiver = await getPaymentReceiverForCurrency(from);
        
        return NextResponse.json({ 
          success: true, 
          data: {
            ...calculation,
            paymentReceiver: receiver,
          }
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Ikamba Remit API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}