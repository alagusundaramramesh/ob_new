/*
 * Master data for scripts/seed_south_india.js: two South Indian companies.
 * GSTINs below are made up for demo use (they match the GSTIN format but belong to nobody).
 *
 * Item fields
 *   gst            GST slab (0, 5, 12, 18, 28)
 *   initial_qty    first stock purchase. A restock buys 60% of it again
 *   wh_qty/rt_qty  quantity range of one wholesale (invoice) / retail line
 *   supplier       name of the supplier the item is bought from
 *   low_at_end     true = stock is reduced below the reorder level at the end (shows in the reorder report)
 */

const TEXTILES = {
    company: {
        name: 'Sri Murugan Textiles & Readymades',
        address1: '45, Oppanakara Street, Town Hall',
        address2: 'Near Big Bazaar Road',
        city: 'Coimbatore',
        zip: '641001',
        state_code: '33',
        phone: '0422 2391234',
        email: 'accounts@srimurugantextiles.example.com',
        tax_no: '33AAHFS4821K1Z7'
    },
    print_terms: '1. Goods once sold will not be taken back or exchanged without the bill.\n2. Interest at 18% p.a. is charged on overdue invoices.\n3. Subject to Coimbatore jurisdiction.',
    footer_text: 'Thank you for choosing Sri Murugan Textiles',
    accent_color: '#7a1f3d',

    // Users of the company (the owner is created separately). role_code: S sales, F accountant, K storekeeper, R retail
    users: [
        { name: 'Revathi Accountant', email: 'accountant@srimurugan.demo', phone: '9843011122', role_code: 'F' },
        { name: 'Senthil Sales', email: 'sales@srimurugan.demo', phone: '9843011133', role_code: 'S' },
        { name: 'Palani Store', email: 'store@srimurugan.demo', phone: '9843011144', role_code: 'K' },
        { name: 'Anitha Counter', email: 'retail@srimurugan.demo', phone: '9843011155', role_code: 'R' }
    ],

    categories: [
        { name: 'Sarees' },
        { name: 'Silk Sarees', parent: 'Sarees' },
        { name: "Men's Wear" },
        { name: 'Women & Kids Wear' },
        { name: 'Home Linen' },
        { name: 'Fabrics' },
        { name: 'Services' }
    ],

    items: [
        { name: 'Coimbatore Cotton Saree', category: 'Sarees', hs: '5208', sku: 'SAR-COT-01', uom: 'Nos', gst: 5, sale: 650, purchase: 480, mrp: 799, stk_level: 40, initial_qty: 200, wh_qty: [6, 24], rt_qty: [1, 2], supplier: 'Erode Cotton Mills' },
        { name: 'Kora Cotton Saree with Zari Border', category: 'Sarees', hs: '5208', sku: 'SAR-KOR-02', uom: 'Nos', gst: 5, sale: 899, purchase: 650, mrp: 1099, stk_level: 30, initial_qty: 120, wh_qty: [5, 20], rt_qty: [1, 2], supplier: 'Erode Cotton Mills' },
        { name: 'Kanchipuram Pure Silk Saree', category: 'Silk Sarees', hs: '5007', sku: 'SAR-KAN-03', uom: 'Nos', gst: 5, sale: 18500, purchase: 14200, mrp: 22000, stk_level: 5, initial_qty: 30, wh_qty: [1, 4], rt_qty: [1, 1], supplier: 'Kanchipuram Silk Weavers Society' },
        { name: 'Soft Silk Saree', category: 'Silk Sarees', hs: '5007', sku: 'SAR-SOF-04', uom: 'Nos', gst: 5, sale: 4800, purchase: 3600, mrp: 5900, stk_level: 10, initial_qty: 60, wh_qty: [2, 8], rt_qty: [1, 2], supplier: 'Kanchipuram Silk Weavers Society' },
        { name: 'Kerala Kasavu Saree', category: 'Sarees', hs: '5208', sku: 'SAR-KAS-05', uom: 'Nos', gst: 5, sale: 1450, purchase: 1050, mrp: 1800, stk_level: 15, initial_qty: 60, wh_qty: [3, 12], rt_qty: [1, 2], supplier: 'Madurai Sungudi Handlooms' },
        { name: 'Madurai Sungudi Saree', category: 'Sarees', hs: '5208', sku: 'SAR-SUN-06', uom: 'Nos', gst: 5, sale: 950, purchase: 700, mrp: 1200, stk_level: 15, initial_qty: 80, wh_qty: [4, 15], rt_qty: [1, 2], supplier: 'Madurai Sungudi Handlooms' },
        { name: 'Cotton Veshti 4 Muzham', category: "Men's Wear", hs: '5208', sku: 'VES-COT-07', uom: 'Nos', gst: 5, sale: 550, purchase: 390, mrp: 650, stk_level: 40, initial_qty: 200, wh_qty: [10, 40], rt_qty: [1, 3], supplier: 'Erode Cotton Mills' },
        { name: 'Silk Veshti with Angavastram', category: "Men's Wear", hs: '5007', sku: 'VES-SIL-08', uom: 'Set', gst: 5, sale: 3200, purchase: 2400, mrp: 3900, stk_level: 8, initial_qty: 40, wh_qty: [2, 6], rt_qty: [1, 1], supplier: 'Kanchipuram Silk Weavers Society', low_at_end: true },
        { name: "Men's Formal Shirt", category: "Men's Wear", hs: '6205', sku: 'SHI-FOR-09', uom: 'Nos', gst: 12, sale: 1299, purchase: 850, mrp: 1599, stk_level: 30, initial_qty: 150, wh_qty: [6, 24], rt_qty: [1, 3], supplier: 'Tiruppur Knit Garments Pvt Ltd' },
        { name: "Men's Casual Shirt", category: "Men's Wear", hs: '6205', sku: 'SHI-CAS-10', uom: 'Nos', gst: 5, sale: 799, purchase: 520, mrp: 999, stk_level: 30, initial_qty: 150, wh_qty: [6, 24], rt_qty: [1, 3], supplier: 'Tiruppur Knit Garments Pvt Ltd' },
        { name: 'Kids Cotton Frock', category: 'Women & Kids Wear', hs: '6111', sku: 'KID-FRO-11', uom: 'Nos', gst: 5, sale: 599, purchase: 390, mrp: 749, stk_level: 25, initial_qty: 120, wh_qty: [6, 24], rt_qty: [1, 3], supplier: 'Tiruppur Knit Garments Pvt Ltd' },
        { name: 'Churidar Material 2.5m', category: 'Women & Kids Wear', hs: '5208', sku: 'CHU-MAT-12', uom: 'Nos', gst: 5, sale: 499, purchase: 340, mrp: 649, stk_level: 25, initial_qty: 100, wh_qty: [5, 20], rt_qty: [1, 3], supplier: 'Surat Fabric Traders', low_at_end: true },
        { name: 'Innerwear Pack of 3', category: "Men's Wear", hs: '6107', sku: 'INN-PAC-13', uom: 'Pack', gst: 5, sale: 349, purchase: 230, mrp: 449, stk_level: 40, initial_qty: 200, wh_qty: [10, 40], rt_qty: [1, 3], supplier: 'Tiruppur Knit Garments Pvt Ltd' },
        { name: 'Double Bedsheet Cotton', category: 'Home Linen', hs: '6302', sku: 'BED-DOU-14', uom: 'Nos', gst: 5, sale: 799, purchase: 540, mrp: 999, stk_level: 30, initial_qty: 150, wh_qty: [8, 40], rt_qty: [1, 2], supplier: 'Erode Cotton Mills' },
        { name: 'Premium Bedsheet with 2 Pillow Covers', category: 'Home Linen', hs: '6302', sku: 'BED-PRE-15', uom: 'Set', gst: 12, sale: 1299, purchase: 900, mrp: 1599, stk_level: 20, initial_qty: 80, wh_qty: [4, 20], rt_qty: [1, 2], supplier: 'Erode Cotton Mills' },
        { name: 'Cotton Bath Towel', category: 'Home Linen', hs: '6302', sku: 'TOW-BAT-16', uom: 'Nos', gst: 5, sale: 249, purchase: 165, mrp: 329, stk_level: 50, initial_qty: 300, wh_qty: [12, 60], rt_qty: [1, 4], supplier: 'Erode Cotton Mills' },
        { name: 'Shirting Fabric', category: 'Fabrics', hs: '5208', sku: 'FAB-SHI-17', uom: 'Mtr', gst: 5, sale: 220, purchase: 150, mrp: 260, stk_level: 200, initial_qty: 1500, wh_qty: [30, 150], rt_qty: [2, 6], supplier: 'Surat Fabric Traders' },
        { name: 'Stitching & Tailoring', category: 'Services', type: 'S', hs: '9988', uom: 'Nos', gst: 5, sale: 450, purchase: 0, wh_qty: [5, 30], rt_qty: [1, 2], retail: true },
        { name: 'Saree Fall & Pico', category: 'Services', type: 'S', hs: '9988', uom: 'Nos', gst: 5, sale: 120, purchase: 0, wh_qty: [5, 30], rt_qty: [1, 3], retail: true },
        { name: 'Courier & Freight Charges', category: 'Services', type: 'S', hs: '9965', uom: 'Nos', gst: 18, sale: 1500, purchase: 0, wh_qty: [1, 1], rt_qty: [1, 1], retail: false, is_freight: true }
    ],

    price_lists: [
        { name: 'Wholesale Dealers (-8%)', list_type: 'S', adjust_percent: -8 },
        { name: 'Other State Dealers (-5%)', list_type: 'S', adjust_percent: -5 },
        {
            name: 'Hotel & Institution Rates', list_type: 'S', adjust_percent: 0,
            rates: [{ item: 'Double Bedsheet Cotton', rate: 720 }, { item: 'Cotton Bath Towel', rate: 210 }, { item: 'Premium Bedsheet with 2 Pillow Covers', rate: 1150 }]
        },
        { name: 'Deepavali Offer (-5%)', list_type: 'S', adjust_percent: -5, valid_from: '10-01', valid_till: '11-30' },
        { name: 'Erode Mill Contract (-3%)', list_type: 'P', adjust_percent: -3 }
    ],

    // b2b customers (GSTIN) are used for wholesale invoices, the others only for retail sales
    customers: [
        { name: 'Saravana Silks', gstin: '33AAHFS2231M1ZP', city: 'Chennai', zip: '600017', address1: '112, Usman Road, T Nagar', state: '33', phone: '9840012345', credit_days: 30, price_list: 'Wholesale Dealers (-8%)', weight: 4, opening: 85000 },
        { name: 'Meenakshi Sarees Emporium', gstin: '33AABCM5521L1Z3', city: 'Madurai', zip: '625001', address1: '23, West Masi Street', state: '33', phone: '9443123456', credit_days: 30, price_list: 'Wholesale Dealers (-8%)', weight: 3, opening: 0 },
        { name: 'Kumaran Textiles', gstin: '33AAGFK7788R1ZK', city: 'Tiruchirappalli', zip: '620008', address1: '9, Big Bazaar Street', state: '33', phone: '9486234567', credit_days: 45, price_list: 'Wholesale Dealers (-8%)', weight: 2, opening: 42000 },
        { name: 'Lakshmi Cloth House', gstin: '33AAACL3345D1Z9', city: 'Salem', zip: '636001', address1: '61, Gandhi Road, Fairlands', state: '33', phone: '9894345678', credit_days: 30, price_list: 'Wholesale Dealers (-8%)', weight: 2, opening: 0 },
        { name: 'Royal Fashions', gstin: '29AAECR9012F1ZV', city: 'Bengaluru', zip: '560053', address1: '14, Chickpet Main Road', state: '29', phone: '9845456789', credit_days: 45, price_list: 'Other State Dealers (-5%)', weight: 3, opening: 0 },
        { name: 'Kerala Kasavu Mart', gstin: '32AAHFK4410Q1Z6', city: 'Kochi', zip: '682001', address1: '5/221, MG Road, Ernakulam', state: '32', phone: '9847567890', credit_days: 30, price_list: 'Other State Dealers (-5%)', weight: 2, opening: 0 },
        { name: 'Pochampally Traders', gstin: '36AABFP6623H1ZB', city: 'Hyderabad', zip: '500195', address1: '8-2-120, Begum Bazaar', state: '36', phone: '9849678901', credit_days: 60, price_list: 'Other State Dealers (-5%)', weight: 1, opening: 0 },
        { name: 'Hotel Annapoorna', gstin: '33AAACA1189B1ZM', city: 'Coimbatore', zip: '641012', address1: '88, Avinashi Road', state: '33', phone: '0422 2456789', credit_days: 30, tds: 2, price_list: 'Hotel & Institution Rates', categories: ['Home Linen'], weight: 1, opening: 0 },
        { name: 'Sri Balaji Uniforms', gstin: '33AAKFB2204C1Z2', city: 'Tiruppur', zip: '641604', address1: '17, Kangeyam Road', state: '33', phone: '9942789012', credit_days: 15, price_list: 'Hotel & Institution Rates', categories: ['Fabrics', "Men's Wear", 'Women & Kids Wear'], weight: 1, opening: 0 },
        { name: 'Priya Ramesh', city: 'Coimbatore', zip: '641002', address1: '12, Gandhipuram', state: '33', phone: '9894890123', price_list: 'Deepavali Offer (-5%)', retail_only: true },
        { name: 'Karthik Subramanian', city: 'Coimbatore', zip: '641035', address1: '3, Saibaba Colony', state: '33', phone: '9894901234', retail_only: true },
        { name: 'Dhanalakshmi R', city: 'Coimbatore', zip: '641045', address1: '27, RS Puram', state: '33', phone: '9894012345', retail_only: true }
    ],

    suppliers: [
        { name: 'Erode Cotton Mills', gstin: '33AAACE4521G1ZH', city: 'Erode', zip: '638001', address1: '101, Perundurai Road', state: '33', phone: '9443100001', credit_days: 30, price_list: 'Erode Mill Contract (-3%)', opening: 125000 },
        { name: 'Kanchipuram Silk Weavers Society', gstin: '33AAAAK1234P1Z8', city: 'Kanchipuram', zip: '631501', address1: '5, Gandhi Road', state: '33', phone: '9443100002', credit_days: 15, opening: 0 },
        { name: 'Tiruppur Knit Garments Pvt Ltd', gstin: '33AABCT8890K1Z4', city: 'Tiruppur', zip: '641603', address1: '44, Avinashi Road', state: '33', phone: '9443100003', credit_days: 30, opening: 0 },
        { name: 'Surat Fabric Traders', gstin: '24AAFFS6654N1ZD', city: 'Surat', zip: '395002', address1: 'B-12, Textile Market, Ring Road', state: '24', phone: '9825100004', credit_days: 45, opening: 0 },
        { name: 'Madurai Sungudi Handlooms', gstin: '33AAAFM9012J1Z1', city: 'Madurai', zip: '625002', address1: '6, Kamarajar Salai', state: '33', phone: '9443100005', credit_days: 30, opening: 0 }
    ],

    transporters: [
        { name: 'Sri Ganesh Roadways', gstin: '33AABFS5566G1ZQ' },
        { name: 'VRL Logistics Ltd', gstin: '29AAACV3177D1Z4' }
    ],

    banks: [
        { bank_name: 'State Bank of India', acc_name: 'Sri Murugan Textiles', acc_number: '30455512345', acc_type: 'C', branch_name: 'Town Hall, Coimbatore', ifsc_code: 'SBIN0000869', upi_id: 'srimurugan@sbi', opening_balance: 2500000 },
        { bank_name: 'Indian Bank', acc_name: 'Sri Murugan Textiles', acc_number: '6512349876', acc_type: 'S', branch_name: 'Oppanakara Street, Coimbatore', ifsc_code: 'IDIB000C012', upi_id: 'srimurugan@indianbk', opening_balance: 150000 }
    ],
    cash_opening: 60000,

    // Extra ledger accounts: opening is debit (+) or credit (-)
    accounts: [
        { name: 'Furniture & Fixtures', group_code: 'FA', opening: 350000 },
        { name: 'Electricity Charges', group_code: 'EI' },
        { name: 'Freight Outward', group_code: 'ED' },
        { name: 'Bank Charges', group_code: 'EI' },
        { name: 'Staff Welfare', group_code: 'EI' },
        { name: 'Indian Bank Term Loan', group_code: 'SL', opening: -600000 }
    ],

    // Expenses posted as journal entries every month. credit = bank0, bank1 or cash
    monthly_journals: [
        { desc: 'Shop rent', day: 3, credit: 'bank0', lines: [{ account: 'Rent Expenses', amount: [45000, 45000] }] },
        { desc: 'Staff salary', day: 28, credit: 'bank0', lines: [{ account: 'Salary', amount: [118000, 126000] }] },
        { desc: 'Electricity bill', day: 10, credit: 'cash', lines: [{ account: 'Electricity Charges', amount: [13500, 19800] }] },
        { desc: 'Term loan EMI', day: 5, credit: 'bank1', lines: [{ account: 'Interest on loan', amount: [5200, 5200] }, { account: 'Indian Bank Term Loan', amount: [17800, 17800] }] },
        { desc: 'Freight outward', day: 20, credit: 'cash', lines: [{ account: 'Freight Outward', amount: [3200, 9400] }] },
        { desc: 'Tea, snacks and staff welfare', day: 25, credit: 'cash', lines: [{ account: 'Staff Welfare', amount: [2400, 4100] }] },
        { desc: 'Internet and phone', day: 12, credit: 'bank0', lines: [{ account: 'IT and Internet Expenses', amount: [1890, 2150] }] },
        { desc: 'Savings account interest', day: 28, credit: null, debit: 'bank1', months: [6, 9, 12, 3], lines: [{ account: 'Interest Income', amount: [1650, 2100] }] },
        { desc: 'Festival season advertising', day: 8, credit: 'bank0', months: [9, 10], lines: [{ account: 'Advertising & Promotion', amount: [24000, 36000] }] },
        { desc: 'Shop insurance', day: 15, credit: 'bank0', months: [5], lines: [{ account: 'Insurance Expenses', amount: [28500, 28500] }] }
    ],
    contra: { days: [14, 28], from: 'cash', to: 'bank0', amount: [60000, 120000] },

    // Invoices that repeat every month for a customer (the first one is the template of a recurring profile)
    standing_orders: [
        { customer: 'Hotel Annapoorna', day: 5, lines: [{ item: 'Double Bedsheet Cotton', qty: 40 }, { item: 'Cotton Bath Towel', qty: 60 }] }
    ],
    recurring: [
        { name: 'Hotel Annapoorna - monthly linen supply', customer: 'Hotel Annapoorna', frequency: 'M', days_ahead: 2, auto_email: true },
        { name: 'Sri Balaji Uniforms - quarterly fabric', customer: 'Sri Balaji Uniforms', frequency: 'Q', days_ahead: 20, auto_email: false }
    ],

    // Volume. wholesale_prob = chance of a wholesale invoice on a working day
    wholesale_prob: 0.6,
    wholesale_extra_prob: 0.12,
    retail_per_day: [0, 2],
    chain_prob: 0.1,
    einvoice: true,
    api_username: 'srimurugan_api'
};

const HARDWARE = {
    company: {
        name: 'Kovai Hardware Mart',
        address1: '212, Trichy Road, Ramanathapuram',
        address2: '',
        city: 'Coimbatore',
        zip: '641045',
        state_code: '33',
        phone: '0422 2301177',
        email: 'sales@kovaihardware.example.com',
        tax_no: '33AAFCK7788M1Z2'
    },
    print_terms: '1. Goods once sold will not be taken back.\n2. Subject to Coimbatore jurisdiction.',
    footer_text: 'Kovai Hardware Mart - building materials and tools',
    accent_color: '#0f5132',

    users: [
        { name: 'Gopal Manager', email: 'manager@kovaihw.demo', phone: '9894022233', role_code: 'S' }
    ],

    categories: [{ name: 'Building Materials' }, { name: 'Electrical' }, { name: 'Paints' }, { name: 'Tools & Fasteners' }, { name: 'Services' }],

    items: [
        { name: 'OPC Cement 50kg Bag', category: 'Building Materials', hs: '2523', sku: 'CEM-OPC-01', uom: 'Bag', gst: 28, sale: 395, purchase: 330, mrp: 420, stk_level: 100, initial_qty: 600, wh_qty: [20, 100], rt_qty: [1, 5], supplier: 'Kovai Steel Traders' },
        { name: 'TMT Steel Bar 12mm', category: 'Building Materials', hs: '7214', sku: 'STE-TMT-02', uom: 'Kg', gst: 18, sale: 74, purchase: 62, mrp: 0, stk_level: 500, initial_qty: 4000, wh_qty: [200, 1000], rt_qty: [10, 40], supplier: 'Kovai Steel Traders' },
        { name: 'PVC Pipe 1 inch 6m', category: 'Building Materials', hs: '3917', sku: 'PVC-PIP-03', uom: 'Nos', gst: 18, sale: 285, purchase: 215, mrp: 330, stk_level: 40, initial_qty: 250, wh_qty: [10, 60], rt_qty: [1, 5], supplier: 'Kovai Steel Traders' },
        { name: 'Ceramic Floor Tile 2x2 ft', category: 'Building Materials', hs: '6908', sku: 'TIL-FLO-04', uom: 'Nos', gst: 18, sale: 55, purchase: 40, mrp: 68, stk_level: 300, initial_qty: 2500, wh_qty: [100, 600], rt_qty: [10, 40], supplier: 'Morbi Tiles Exports' },
        { name: 'Tractor Emulsion Paint 20L', category: 'Paints', hs: '3209', sku: 'PNT-EMU-05', uom: 'Nos', gst: 18, sale: 4800, purchase: 3900, mrp: 5400, stk_level: 10, initial_qty: 60, wh_qty: [2, 10], rt_qty: [1, 2], supplier: 'Sri Ganapathy Paints' },
        { name: 'Wall Putty 40kg', category: 'Paints', hs: '3214', sku: 'PNT-PUT-06', uom: 'Bag', gst: 18, sale: 1150, purchase: 920, mrp: 1300, stk_level: 15, initial_qty: 100, wh_qty: [5, 20], rt_qty: [1, 3], supplier: 'Sri Ganapathy Paints' },
        { name: 'Copper Wire 1.5 sqmm 90m', category: 'Electrical', hs: '8544', sku: 'ELE-WIR-07', uom: 'Coil', gst: 18, sale: 2250, purchase: 1750, mrp: 2600, stk_level: 15, initial_qty: 100, wh_qty: [3, 15], rt_qty: [1, 2], supplier: 'Bengaluru Electricals' },
        { name: 'Modular Switch Plate', category: 'Electrical', hs: '8536', sku: 'ELE-SWI-08', uom: 'Nos', gst: 18, sale: 120, purchase: 80, mrp: 150, stk_level: 60, initial_qty: 400, wh_qty: [20, 80], rt_qty: [2, 8], supplier: 'Bengaluru Electricals' },
        { name: 'Cordless Drill 12V', category: 'Tools & Fasteners', hs: '8467', sku: 'TOO-DRI-09', uom: 'Nos', gst: 18, sale: 3200, purchase: 2500, mrp: 3900, stk_level: 5, initial_qty: 25, wh_qty: [1, 4], rt_qty: [1, 1], supplier: 'Bengaluru Electricals', low_at_end: true },
        { name: 'Hex Bolt & Nut Set (100 pcs)', category: 'Tools & Fasteners', hs: '7318', sku: 'TOO-BOL-10', uom: 'Box', gst: 18, sale: 340, purchase: 240, mrp: 400, stk_level: 20, initial_qty: 150, wh_qty: [5, 25], rt_qty: [1, 4], supplier: 'Kovai Steel Traders' },
        { name: 'Delivery & Unloading Charges', category: 'Services', type: 'S', hs: '9965', uom: 'Nos', gst: 18, sale: 1800, purchase: 0, wh_qty: [1, 1], rt_qty: [1, 1], retail: false, is_freight: true }
    ],

    price_lists: [
        { name: 'Contractor Rates (-6%)', list_type: 'S', adjust_percent: -6 }
    ],

    customers: [
        { name: 'Annai Builders', gstin: '33AACFA4410B1ZN', city: 'Coimbatore', zip: '641012', address1: '19, Race Course Road', state: '33', phone: '9894033344', credit_days: 30, price_list: 'Contractor Rates (-6%)', weight: 3, opening: 0 },
        { name: 'Sri Vari Constructions', gstin: '33AAGFS6672D1ZT', city: 'Pollachi', zip: '642001', address1: '7, Palghat Road', state: '33', phone: '9894044455', credit_days: 45, price_list: 'Contractor Rates (-6%)', weight: 2, opening: 38000 },
        { name: 'KG Interiors', gstin: '33AAHPK9981E1Z0', city: 'Tiruppur', zip: '641601', address1: '22, Mangalam Road', state: '33', phone: '9894055566', credit_days: 30, weight: 2, opening: 0 },
        { name: 'Palakkad Homes', gstin: '32AAACP2203F1ZL', city: 'Palakkad', zip: '678001', address1: '14, Stadium Bypass Road', state: '32', phone: '9847066677', credit_days: 30, weight: 1, opening: 0 },
        { name: 'Murugan Plumbing Works', city: 'Coimbatore', zip: '641035', address1: '5, Saibaba Colony', state: '33', phone: '9894077788', retail_only: true }
    ],

    suppliers: [
        { name: 'Kovai Steel Traders', gstin: '33AAACK3321H1ZE', city: 'Coimbatore', zip: '641007', address1: '60, Sungam Bypass Road', state: '33', phone: '9443122001', credit_days: 30, opening: 0 },
        { name: 'Sri Ganapathy Paints', gstin: '33AABFS7754J1Z5', city: 'Chennai', zip: '600001', address1: '31, NSC Bose Road', state: '33', phone: '9443122002', credit_days: 30, opening: 0 },
        { name: 'Bengaluru Electricals', gstin: '29AAECB5510K1ZR', city: 'Bengaluru', zip: '560002', address1: '8, SP Road', state: '29', phone: '9845122003', credit_days: 30, opening: 0 },
        { name: 'Morbi Tiles Exports', gstin: '24AAGFM8841L1ZW', city: 'Morbi', zip: '363641', address1: 'Plot 12, Ceramic Zone', state: '24', phone: '9825122004', credit_days: 45, opening: 0 }
    ],

    transporters: [{ name: 'Sri Ganesh Roadways', gstin: '33AABFS5566G1ZQ' }],

    banks: [
        { bank_name: 'Canara Bank', acc_name: 'Kovai Hardware Mart', acc_number: '1234567890123', acc_type: 'C', branch_name: 'Ramanathapuram, Coimbatore', ifsc_code: 'CNRB0001234', upi_id: 'kovaihw@canara', opening_balance: 900000 }
    ],
    cash_opening: 25000,

    accounts: [
        { name: 'Electricity Charges', group_code: 'EI' },
        { name: 'Godown Rent', group_code: 'EI' }
    ],

    monthly_journals: [
        { desc: 'Godown rent', day: 2, credit: 'bank0', lines: [{ account: 'Godown Rent', amount: [28000, 28000] }] },
        { desc: 'Staff salary', day: 28, credit: 'bank0', lines: [{ account: 'Salary', amount: [64000, 68000] }] },
        { desc: 'Electricity bill', day: 10, credit: 'cash', lines: [{ account: 'Electricity Charges', amount: [6200, 8800] }] }
    ],
    contra: { days: [15], from: 'cash', to: 'bank0', amount: [20000, 50000] },

    standing_orders: [],
    recurring: [],

    wholesale_prob: 0.3,
    wholesale_extra_prob: 0.05,
    retail_per_day: [0, 1],
    chain_prob: 0.08,
    einvoice: false,
    api_username: ''
};

module.exports = { TEXTILES, HARDWARE };
