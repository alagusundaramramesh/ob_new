/*
 * Adds the "Office Inventory" role (role_code O) to the companies that were created before this module.
 * New companies get the role automatically from SYS_DATA.DEFAULT_ROLES. Safe to run again.
 *   node scripts/add_office_inventory_role.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const SYS_DATA = require('../common/sys_data');
const { ensureIndexes } = require('../common/indexes');
const UTILS = require('../utils/util.functions');

const ROLE_CODE = 'O';

async function run() {
    let mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    let dbobj = mongoClient.db(process.env.DB_NAME);
    try {
        await ensureIndexes(dbobj);

        let default_role = SYS_DATA.DEFAULT_ROLES.find(role => role.role_code === ROLE_CODE);
        let role_permissions = SYS_DATA.SYS_MODULES
            .filter(sys_module => sys_module[2].split(',').includes(ROLE_CODE))
            .map(sys_module => sys_module[0]);

        let companies = await dbobj.collection('ob_companies').find({ stat: "A" }, { projection: { c_id: 1 } }).toArray();
        let added_count = 0;
        for (const company of companies) {
            let existing_role = await dbobj.collection('ob_roles').findOne({ c_id: company.c_id, role_code: ROLE_CODE, stat: "A" });
            if (existing_role) {
                continue;
            }
            let role_id = await UTILS.getNextId(dbobj, 'ob_roles');
            await dbobj.collection('ob_roles').insertOne({
                role_id: role_id, c_id: company.c_id, role_code: ROLE_CODE, role_name: default_role.role_name,
                permissions: role_permissions, is_system: true, stat: "A"
            });
            added_count++;
        }
        console.log(`Office Inventory role added to ${added_count} of ${companies.length} companies`);
    }
    finally {
        await mongoClient.close();
    }
}

run().catch(err => {
    console.error('Unable to add the Office Inventory role', err.message);
    process.exit(1);
});
