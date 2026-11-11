const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const data = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!data.name) {
            return res.send({ status: "E", message: "Item name is required" });
        }
        if (data.type !== 'P' && data.type !== 'S') {
            return res.send({ status: "E", message: "Item type must be P (product) or S (service)" });
        }
        let duplicate_item = await dbobj.collection('ob_items').findOne(
            { c_id: data.c_id, name: data.name, stat: "A", item_id: { $ne: data.item_id || 0 } });
        if (duplicate_item) {
            return res.send({ status: "E", message: "An item with this name already exists" });
        }
        if (data.sku) {
            let duplicate_sku = await dbobj.collection('ob_items').findOne(
                { c_id: data.c_id, sku: data.sku, stat: "A", item_id: { $ne: data.item_id || 0 } });
            if (duplicate_sku) {
                return res.send({ status: "E", message: "An item with this SKU already exists" });
            }
        }
        if (data.tax_id) {
            let tax = await dbobj.collection('ob_taxes').findOne({ c_id: data.c_id, tax_id: data.tax_id, stat: "A" });
            if (!tax) {
                return res.send({ status: "E", message: "Tax not found" });
            }
        }
        if (data.category_id) {
            let category = await dbobj.collection('ob_categories').findOne({ c_id: data.c_id, category_id: data.category_id, stat: "A" });
            if (!category) {
                return res.send({ status: "E", message: "Category not found" });
            }
        }

        let item_fields = {
            name: data.name,
            item_code: data.item_code || '',
            type: data.type,
            hs: data.hs || '',
            sku: data.sku || '',
            uom: data.uom || '',
            description: data.description || '',
            category_id: data.category_id || 0,
            tax_id: data.tax_id || 0,
            is_sale: data.is_sale !== false,
            is_purchase: data.is_purchase !== false,
            // Services have no stock
            is_inventory: data.type === 'P' && data.is_inventory !== false,
            sale_rate: UTILS.round2(data.sale_rate || 0),
            purchase_rate: UTILS.round2(data.purchase_rate || 0),
            mrp: UTILS.round2(data.mrp || 0),
            stk_level: Number(data.stk_level) || 0,
            is_active: data.is_active !== false,
            mdy_on: new Date()
        };

        if (!data.item_id) {
            let item_id = await UTILS.getNextId(dbobj, 'ob_items');
            let opening_stk = item_fields.is_inventory ? Number(data.opening_stk) || 0 : 0;
            await dbobj.collection('ob_items').insertOne({
                ...item_fields,
                item_id: item_id,
                c_id: data.c_id,
                opening_stk: opening_stk,
                cur_stk: opening_stk,
                stat: "A",
                crd_on: new Date()
            });
            if (opening_stk) {
                await dbobj.collection('ob_stock_ledger').insertOne({
                    trans_id: 0, c_id: data.c_id, trans_type: 'OP', trans_no: 'Opening stock', trans_date: UTILS.toDate(new Date()),
                    item_id: item_id, qty_in: opening_stk > 0 ? opening_stk : 0, qty_out: opening_stk < 0 ? -opening_stk : 0,
                    rate: item_fields.purchase_rate, loc_id: 0
                });
            }
            return res.send({ status: "S", message: "Item added", item_id: item_id });
        }

        let item = await dbobj.collection('ob_items').findOne({ c_id: data.c_id, item_id: data.item_id, stat: "A" });
        if (!item) {
            return res.send({ status: "E", message: "Item not found" });
        }
        // Stock is changed only through transactions and stock adjustments
        await dbobj.collection('ob_items').updateOne({ c_id: data.c_id, item_id: data.item_id }, { $set: item_fields });
        return res.send({ status: "S", message: "Item updated", item_id: data.item_id });
    }
    catch (err) {
        return sendError(res, err, 'item_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
