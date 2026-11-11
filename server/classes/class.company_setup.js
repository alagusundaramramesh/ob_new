const bcrypt = require('bcrypt');
const UTILS = require('../utils/util.functions');
const CONFIG = require('../common/inc.config');
const SYS_DATA = require('../common/sys_data');

/*
 * Creates everything a new company needs: roles, chart of accounts, GST taxes,
 * number series and payment modes. Used by signup, company_create and scripts/seed.js.
 * (PHP equivalent: the company creation flow of Company::save and CompanyModel)
 */
class CompanySetup {

    /*
     * First company + its primary (admin) user. Used by signup and scripts/seed.js.
     * company_input: { name, state_code, country_code, currency, email, phone }
     * user_input: { name, email, password, phone }
     */
    async createCompanyWithAdmin(dbobj, company_input, user_input) {
        let c_id = await UTILS.getNextId(dbobj, 'ob_companies');
        await dbobj.collection('ob_companies').insertOne({
            c_id: c_id,
            name: company_input.name,
            address1: '', address2: '', city: '', zip: '',
            state_code: company_input.state_code || '',
            country_code: company_input.country_code || CONFIG.DEFAULT_COUNTRY_CODE,
            currency: company_input.currency || CONFIG.DEFAULT_CURRENCY,
            fy_start: CONFIG.DEFAULT_FY_START_MONTH,
            email: company_input.email || user_input.email,
            phone: company_input.phone || '',
            tax_no: '',
            locked_till: null,
            allow_negative_stock: true,
            stat: CONFIG.STAT_ACTIVE,
            crd_on: new Date()
        });
        let admin_role_id = await this.createDefaults(dbobj, c_id);

        let user_id = await UTILS.getNextId(dbobj, 'ob_users');
        let new_user = {
            user_id: user_id,
            name: user_input.name,
            email: user_input.email,
            password: await bcrypt.hash(user_input.password, 10),
            phone: user_input.phone || '',
            default_c_id: c_id,
            is_prime_user: true,
            is_active: true,
            stat: CONFIG.STAT_ACTIVE,
            crd_on: new Date()
        };
        await dbobj.collection('ob_users').insertOne(new_user);
        await dbobj.collection('ob_company_users').insertOne({
            user_id: user_id, c_id: c_id, role_id: admin_role_id, stat: CONFIG.STAT_ACTIVE
        });
        return { c_id, admin_role_id, user: new_user };
    }

    /* Returns the role_id of the Admin role so the caller can link the first user to it */
    async createDefaults(dbobj, c_id) {
        let admin_role_id = await this.createRoles(dbobj, c_id);
        await this.createAccounts(dbobj, c_id);
        await this.createTaxes(dbobj, c_id);
        await this.createSeries(dbobj, c_id);
        await this.createPaymentModes(dbobj, c_id);
        return admin_role_id;
    }

    async createRoles(dbobj, c_id) {
        let admin_role_id = 0;
        for (const default_role of SYS_DATA.DEFAULT_ROLES) {
            let role_id = await UTILS.getNextId(dbobj, 'ob_roles');
            let permissions = SYS_DATA.SYS_MODULES
                .filter(sys_module => sys_module[2].split(',').includes(default_role.role_code))
                .map(sys_module => sys_module[0]);
            await dbobj.collection('ob_roles').insertOne({
                role_id: role_id,
                c_id: c_id,
                role_code: default_role.role_code,
                role_name: default_role.role_name,
                permissions: permissions,
                is_system: true,
                stat: CONFIG.STAT_ACTIVE
            });
            if (default_role.role_code === 'C') {
                admin_role_id = role_id;
            }
        }
        return admin_role_id;
    }

    async createAccounts(dbobj, c_id) {
        for (const default_account of SYS_DATA.DEFAULT_ACCOUNTS) {
            await this.createAccount(dbobj, c_id, {
                name: default_account[0],
                group_code: default_account[1],
                acc_code: default_account[2],
                is_system: true
            });
        }
    }

    /* Single account. Also used when a customer, supplier or bank is created */
    async createAccount(dbobj, c_id, account) {
        let acc_id = await UTILS.getNextId(dbobj, 'ob_accounts');
        await dbobj.collection('ob_accounts').insertOne({
            acc_id: acc_id,
            c_id: c_id,
            name: account.name,
            group_code: account.group_code,
            acc_code: account.acc_code || '',
            descr: account.descr || '',
            opening_balance: account.opening_balance || 0, // positive = debit, negative = credit
            is_system: account.is_system || false,
            is_active: true,
            stat: CONFIG.STAT_ACTIVE,
            crd_on: new Date()
        });
        return acc_id;
    }

    /* One tax per GST slab. CGST + SGST inside the state, IGST outside */
    async createTaxes(dbobj, c_id) {
        for (const gst_rate of SYS_DATA.DEFAULT_GST_RATES) {
            let half_rate = gst_rate / 2;
            let tax_id = await UTILS.getNextId(dbobj, 'ob_taxes');
            await dbobj.collection('ob_taxes').insertOne({
                tax_id: tax_id,
                c_id: c_id,
                name: `GST ${gst_rate}%`,
                tax_code: `GST${gst_rate}`,
                details: [
                    { tax_type_code: 'CGST', tax_rate: half_rate, state_type: 'I' },
                    { tax_type_code: 'SGST', tax_rate: half_rate, state_type: 'I' },
                    { tax_type_code: 'IGST', tax_rate: gst_rate, state_type: 'X' }
                ],
                is_default: gst_rate === 18,
                is_active: true,
                stat: CONFIG.STAT_ACTIVE
            });
        }
    }

    async createSeries(dbobj, c_id) {
        for (const default_series of SYS_DATA.DEFAULT_SERIES) {
            let series_id = await UTILS.getNextId(dbobj, 'ob_series');
            await dbobj.collection('ob_series').insertOne({
                series_id: series_id,
                c_id: c_id,
                trans_type: default_series[0],
                prefix: default_series[1],
                suffix: '',
                nxt_number: default_series[2],
                is_default: true,
                stat: CONFIG.STAT_ACTIVE
            });
        }
    }

    async createPaymentModes(dbobj, c_id) {
        for (const default_mode of SYS_DATA.DEFAULT_PAYMENT_MODES) {
            let pay_mode_id = await UTILS.getNextId(dbobj, 'ob_payment_modes');
            await dbobj.collection('ob_payment_modes').insertOne({
                pay_mode_id: pay_mode_id,
                c_id: c_id,
                name: default_mode[0],
                acc_group_code: default_mode[1],
                is_active: true,
                stat: CONFIG.STAT_ACTIVE
            });
        }
    }
}

module.exports = new CompanySetup();
