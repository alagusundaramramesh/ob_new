const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');

/*
 * A price list changes the rate of items for the customers (list_type S) or suppliers (list_type P) that use it.
 *   rates          - a fixed rate for some items: [{ item_id, rate }]
 *   adjust_percent - for every other item: item master rate + / - this percent (-10 = 10% cheaper, 5 = 5% dearer)
 * valid_from / valid_till are optional. (PHP: ob_price_list, ob_price_item, ob_price_list_apply)
 */
class PriceList {

    /* True when the list can be used on that date */
    isValidOn(price_list, trans_date) {
        if (!price_list || !price_list.is_active || price_list.stat !== CONFIG.STAT_ACTIVE) {
            return false;
        }
        if (price_list.valid_from && trans_date < new Date(price_list.valid_from)) {
            return false;
        }
        if (price_list.valid_till && trans_date > new Date(price_list.valid_till)) {
            return false;
        }
        return true;
    }

    /* Rate of one item: the fixed rate of the list, otherwise the master rate with the percent change */
    getRate(price_list, item_id, base_rate) {
        let fixed_rate = (price_list.rates || []).find(price_item => price_item.item_id === item_id);
        if (fixed_rate) {
            return UTILS.round2(fixed_rate.rate);
        }
        return UTILS.round2(base_rate * (1 + (price_list.adjust_percent || 0) / 100));
    }

    /* The list of a contact when it can be used on trans_date, otherwise null */
    async findForContact(dbobj, c_id, contact, trans_date) {
        if (!contact || !contact.price_list_id) {
            return null;
        }
        let price_list = await dbobj.collection('ob_price_lists').findOne(
            { c_id: c_id, price_list_id: contact.price_list_id, stat: CONFIG.STAT_ACTIVE });
        return this.isValidOn(price_list, trans_date) ? price_list : null;
    }
}

module.exports = new PriceList();
