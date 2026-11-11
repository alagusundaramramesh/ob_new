const express = require('express');
const router = express.Router();
const UTILS = require('../../utils/util.functions');
const { sendError } = require('../../utils/util.error');

/* MAIN SCRIPT STARTS */
router.post('/', async (req, res) => {
    const { c_id, price_list_id, name, list_type, adjust_percent, rates, valid_from, valid_till, is_active } = req.body;
    let dbobj = res.locals.dbobj;
    try {
        if (!name) {
            return res.send({ status: "E", message: "Price list name is required" });
        }
        if (list_type !== 'S' && list_type !== 'P') {
            return res.send({ status: "E", message: "list_type must be S (sales) or P (purchase)" });
        }
        let percent = Number(adjust_percent) || 0;
        if (percent <= -100 || percent > 1000) {
            return res.send({ status: "E", message: "Percent change must be more than -100 and not more than 1000" });
        }
        let from_date = UTILS.toDate(valid_from);
        let till_date = UTILS.toDate(valid_till);
        if (from_date && till_date && till_date < from_date) {
            return res.send({ status: "E", message: "Valid till can not be before valid from" });
        }

        // Fixed rates: every item must exist, an item can be listed once
        let fixed_rates = [];
        for (const price_item of Array.isArray(rates) ? rates : []) {
            if (!(Number(price_item.rate) >= 0) || fixed_rates.some(fixed => fixed.item_id === price_item.item_id)) {
                return res.send({ status: "E", message: "Each item can be added once with a rate of zero or more" });
            }
            let item = await dbobj.collection('ob_items').findOne({ c_id: c_id, item_id: price_item.item_id, stat: "A" }, { projection: { item_id: 1 } });
            if (!item) {
                return res.send({ status: "E", message: `Item ${price_item.item_id} not found` });
            }
            fixed_rates.push({ item_id: price_item.item_id, rate: UTILS.round2(price_item.rate) });
        }

        let duplicate_list = await dbobj.collection('ob_price_lists').findOne(
            { c_id: c_id, name: name, stat: "A", price_list_id: { $ne: price_list_id || 0 } });
        if (duplicate_list) {
            return res.send({ status: "E", message: "A price list with this name already exists" });
        }

        let list_fields = {
            name: name, list_type: list_type, adjust_percent: percent, rates: fixed_rates,
            valid_from: from_date, valid_till: till_date, is_active: is_active !== false, mdy_on: new Date()
        };
        if (!price_list_id) {
            let new_price_list_id = await UTILS.getNextId(dbobj, 'ob_price_lists');
            await dbobj.collection('ob_price_lists').insertOne({
                ...list_fields, price_list_id: new_price_list_id, c_id: c_id, stat: "A", crd_on: new Date()
            });
            return res.send({ status: "S", message: "Price list added", price_list_id: new_price_list_id });
        }
        let existing_list = await dbobj.collection('ob_price_lists').findOne({ c_id: c_id, price_list_id: price_list_id, stat: "A" });
        if (!existing_list) {
            return res.send({ status: "E", message: "Price list not found" });
        }
        if (existing_list.list_type !== list_type) {
            let used_by_contact = await dbobj.collection('ob_contacts').findOne({ c_id: c_id, price_list_id: price_list_id, stat: "A" });
            if (used_by_contact) {
                return res.send({ status: "E", message: "The type can not be changed while contacts use this list" });
            }
        }
        await dbobj.collection('ob_price_lists').updateOne({ c_id: c_id, price_list_id: price_list_id }, { $set: list_fields });
        return res.send({ status: "S", message: "Price list updated", price_list_id: price_list_id });
    }
    catch (err) {
        return sendError(res, err, 'price_list_save');
    }
})
module.exports = router;
/* MAIN SCRIPT ENDS */
