const express = require('express').Router;

/* Internal endpoints (cron jobs, health check). They are not called by the React client */
class app_router {
	create() {
		let route = express();

		route.get('/ping', (req, res) => res.send({ status: "S", message: "pong" }));

		/* CRON JOBS - manual run, protected by the x-api-key header */
		route.use('/cron', (req, res, next) => {
			if (req.headers['x-api-key'] !== process.env.X_API_KEY) {
				return res.send({ status: "UA", msg: "Invalid API key." });
			}
			next();
		});
		route.use('/cron/overdue_invoices', require('./cronjobs/overdue_invoices'));
		route.use('/cron/recurring_transactions', require('./cronjobs/recurring_transactions'));
		route.use('/cron/payment_reminders', require('./cronjobs/payment_reminders'));

		return route;
	}
}

module.exports = new app_router();
