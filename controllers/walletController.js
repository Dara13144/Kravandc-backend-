const prisma = require('../utils/prisma');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Get User Wallet & Recent Transactions
 */
const getWallet = async (req, res, next) => {
  try {
    const userId = req.user.id;

    let wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, balance: 0.00, currency: 'USD' },
        include: { transactions: true }
      });
    }

    const pendingPayments = await prisma.payment.findMany({
      where: { userId, status: 'WAITING' },
      orderBy: { createdAt: 'desc' }
    });

    return sendSuccess(res, 'Wallet details retrieved', {
      balance: wallet.balance,
      currency: wallet.currency,
      transactions: wallet.transactions,
      pendingPayments
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Request Wallet Withdrawal
 */
const requestWithdraw = async (req, res, next) => {
  try {
    const { amount, bankName, accountNumber, accountName } = req.body;
    const userId = req.user.id;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < amount) {
      return sendError(res, 'Insufficient wallet balance for withdrawal');
    }

    // Deduct balance & create pending withdrawal transaction
    const [updatedWallet, transaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data: { balance: { decrement: parseFloat(amount) } }
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: parseFloat(amount),
          type: 'WITHDRAW',
          status: 'PENDING',
          description: `Withdrawal request to ${bankName} (${accountNumber} - ${accountName})`
        }
      })
    ]);

    return sendSuccess(res, 'Withdrawal request submitted successfully', {
      newBalance: updatedWallet.balance,
      transaction
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Audited Admin Balance Adjustment
 * Only authorized Admins/Super Admins can adjust user balances.
 */
const addBalance = async (req, res, next) => {
  try {
    const adminUser = req.user;
    if (!adminUser || !['ADMIN', 'SUPER_ADMIN'].includes(adminUser.role)) {
      return sendError(res, 'Unauthorized. Only administrators can perform manual balance adjustments.', null, 403);
    }

    const { amount, targetUserId, description, reason } = req.body;
    const userId = targetUserId || adminUser.id;

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return sendError(res, 'Please provide a valid adjustment amount');
    }

    const numericAmount = parseFloat(parseFloat(amount).toFixed(2));

    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, balance: 0.0, currency: 'USD' }
      });
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + numericAmount;

    const [updatedWallet, transaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter }
      }),
      prisma.transaction.create({
        data: {
          walletId: wallet.id,
          userId,
          amount: numericAmount,
          balanceBefore,
          balanceAfter,
          type: 'ADMIN_ADJUSTMENT',
          status: 'COMPLETED',
          reference: `ADMIN_ADJ_${Date.now()}`,
          description: description || reason || `Admin balance adjustment by ${adminUser.email} (+$${numericAmount.toFixed(2)} USD)`
        }
      })
    ]);

    return sendSuccess(res, `Successfully adjusted $${numericAmount.toFixed(2)} USD for user!`, {
      balance: updatedWallet.balance,
      transaction
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getWallet,
  requestWithdraw,
  addBalance
};
