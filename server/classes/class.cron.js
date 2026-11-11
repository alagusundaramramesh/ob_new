const cron = require('node-cron');

/*
 * Scheduled jobs (replaces the PHP "Obo" cron jobs, see docs for the ones not ported yet).
 * Each job lives in api/cronjobs and is also reachable through app_router for manual runs.
 */
class Cron {

    constructor(dbobj) {
        this.dbobj = dbobj;
        this.jobs = [];
        this.start_jobs();
    }

    start_jobs() {
        // Every day at 01:00 - create the documents of the recurring invoices that are due
        this.jobs.push(cron.schedule('0 1 * * *', () => this.run_job('recurring_transactions')));
        // Every day at 09:30 - mail the payment reminders (after the overdue flag below)
        this.jobs.push(cron.schedule('30 9 * * *', () => this.run_job('payment_reminders')));
        // Every day at 09:00 - flag overdue invoices
        this.jobs.push(cron.schedule('0 9 * * *', () => this.run_job('overdue_invoices')));
        console.log('Cron jobs scheduled');
    }

    async run_job(job_name) {
        try {
            const job = require(`../api/cronjobs/${job_name}`);
            const summary = await job.run(this.dbobj);
            console.log(`Cron job ${job_name} finished`, summary);
        } catch (error) {
            console.error(`Cron job ${job_name} failed`, error);
        }
    }
}

module.exports = Cron;
