module.exports = {

  // Redis (optional, same switch as cges.club)
  CAN_ENABLE_REDIS: false,

  // JWT lifetime
  TOKEN_EXPIRES_IN: '15d',

  // Default values used when a new company is created
  DEFAULT_CURRENCY: 'INR',
  DEFAULT_COUNTRY_CODE: 'IN',
  DEFAULT_FY_START_MONTH: 4, // April

  // Number of rows returned by list endpoints when the client sends no limit
  DEFAULT_PAGE_LIMIT: 20,
  MAX_PAGE_LIMIT: 500,

  // Email subjects
  EMAIL_SUBJECTS: {
    WELCOME: 'Welcome to OutputBooks',
    RESET_PASSWORD: 'Reset your OutputBooks password',
    INVOICE: 'Invoice from',
  },

  // Transaction types (same codes as the PHP AppConstants so old data can be imported as is)
  TRANS_TYPES: {
    ESTIMATE: 'SE',
    SALES_ORDER: 'SO',
    DELIVERY_CHALLAN: 'SH',
    SALES_INVOICE: 'SI',
    SALES_RETAIL: 'SR',
    SALES_CREDIT_NOTE: 'SC',
    SALES_DEBIT_NOTE: 'SD',
    SALES_PAYMENT: 'SP', // receipt from a customer
    PURCHASE_QUOTE: 'PQ',
    PURCHASE_ORDER: 'PO',
    GOODS_RECEIPT: 'GR',
    PURCHASE_INVOICE: 'PI',
    PURCHASE_CREDIT_NOTE: 'PC',
    PURCHASE_DEBIT_NOTE: 'PD',
    PURCHASE_PAYMENT: 'PP', // payment to a supplier
    JOURNAL: 'J',
    CONTRA: 'JC',
  },

  // Transaction status
  TRANS_STATUS: {
    DRAFT: 'D',
    SENT: 'S',
    PAID: 'P',
    OVERDUE: 'O',
    VOID: 'V',
    CANCELLED: 'X',
  },

  // Record status used in every collection (same as cges.club: A - active, D - deleted)
  STAT_ACTIVE: 'A',
  STAT_DELETED: 'D',
};
