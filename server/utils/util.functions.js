const jwt = require('jsonwebtoken');
const CONFIG = require('../common/inc.config');

module.exports = {

	/* JWT payload carries the user and the company the user is working in */
	generateToken(user, c_id, role_id) {
		let token_data = {
			email: user.email,
			user_id: user.user_id,
			c_id: c_id,
			role_id: role_id
		};
		return jwt.sign(token_data, process.env.JWT_SECRET, { expiresIn: CONFIG.TOKEN_EXPIRES_IN });
	},

	error() {
		return { status: 'E', msg: 'Error' };
	},

	/* Next numeric id of a collection. Uses the ob_counters collection so two requests never get the same id */
	async getNextId(dbobj, counter_name) {
		let counter = await dbobj.collection('ob_counters').findOneAndUpdate(
			{ _id: counter_name },
			{ $inc: { seq: 1 } },
			{ upsert: true, returnDocument: 'after' }
		);
		return counter.seq;
	},

	/* Company of the logged in user. Returns null when it is missing or inactive */
	async getCompany(dbobj, c_id) {
		return dbobj.collection('ob_companies').findOne(
			{ c_id: c_id, stat: CONFIG.STAT_ACTIVE },
			{ projection: { _id: 0 } }
		);
	},

	/* page / limit / skip for list endpoints */
	getPaging(body) {
		let limit = parseInt(body.limit) || CONFIG.DEFAULT_PAGE_LIMIT;
		if (limit > CONFIG.MAX_PAGE_LIMIT) {
			limit = CONFIG.MAX_PAGE_LIMIT;
		}
		let page = parseInt(body.page) || 1;
		let skip = (page - 1) * limit;
		return { page, limit, skip };
	},

	/* 2 decimal rounding for money values */
	round2(value) {
		return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
	},

	/* Accepts 'YYYY-MM-DD' or a Date, returns a Date at 00:00 UTC (null when invalid) */
	toDate(value) {
		if (!value) {
			return null;
		}
		let date_value = new Date(value);
		if (isNaN(date_value.getTime())) {
			return null;
		}
		return new Date(Date.UTC(date_value.getUTCFullYear(), date_value.getUTCMonth(), date_value.getUTCDate()));
	},

	/* Escapes user input before it is used inside a $regex */
	escapeRegex(text) {
		return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	},

	/* Financial year start date for a given date, based on the company fy_start month (1-12) */
	getFinancialYear(date_value, fy_start_month) {
		let year = date_value.getUTCFullYear();
		let start_year = (date_value.getUTCMonth() + 1) >= fy_start_month ? year : year - 1;
		let start = new Date(Date.UTC(start_year, fy_start_month - 1, 1));
		let end = new Date(Date.UTC(start_year + 1, fy_start_month - 1, 0));
		return { start, end, label: `${start_year}-${String(start_year + 1).slice(2)}` };
	}
};
