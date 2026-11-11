const express = require('express');
const cluster = require('cluster');
const compression = require('compression');
const dotenv = require('dotenv');
dotenv.config();
const standardmiddleware = require('../api/middleware/standard');
const api_router = require('../api/api_router');
const app_router = require('../api/app_router');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const cpu_count = require('os').cpus().length;
const { MongoClient } = require('mongodb');
const CONFIG = require('../common/inc.config');
const { ensureIndexes } = require('../common/indexes');
const REDIS = require('./class.redis');
const CRON_INIT = require('./class.cron');

class Server {

	constructor() {
		this.epress_apps = [];
		this.workers = [];
		this.mongoClient = null; // MongoDB client instance
		this.dbobj = null;
		this.redisobj = null;
		this.cronobj = null;
		if (CONFIG.CAN_ENABLE_REDIS) {
			this.redisobj = new REDIS(process.env.REDIS_URI, process.env.REDIS_PASSWORD);
		}
	}

	async start(clustermode) {
		await this.initMongoDB();
		if (clustermode) {
			this.start_cluster_mode();
		} else {
			await this.start_normal_mode();
			this.cronobj = new CRON_INIT(this.dbobj);
		}
	}

	start_cluster_mode() {
		if (cluster.isMaster) {
			this.start_master();
			this.cronobj = new CRON_INIT(this.dbobj);
		} else {
			this.start_worker();
		}
	}

	start_normal_mode() {
		return this.start_worker();
	}

	start_master() {
		console.log(`Master started in process id [${process.pid}]`);
		for (let i = 0; i < cpu_count; i++) {
			let worker = cluster.fork();
			console.log(`Worker ${worker.id} started from process id [${process.pid}]`);
			worker.on('disconnect', () => {
				console.log(`Worker ${worker.id} died`);
			});
			this.workers.push(worker);
		}
	}

	async start_worker() {
		let app = express();
		/* ATTACHING BODY-PARSER KIND OF MODULES */
		app.use(cookieParser());
		standardmiddleware.attachTo(app);
		app.use(compression());
		app.use((req, res, next) => {
			res.locals.dbobj = this.dbobj;
			res.locals.redisobj = this.redisobj;
			res.locals.cronobj = this.cronobj;
			next();
		});

		/* ROUTING TO API-ROUTER ENDPOINTS */
		app.use('/', app_router.create());
		app.use('/api', api_router.create());

		/* SERVING THE REACT BUILD (only when the client has been built) */
		const client_build_path = path.resolve(__dirname, '../../client/build');
		if (fs.existsSync(client_build_path)) {
			app.use(
				express.static(client_build_path, {
					setHeaders: (res, filePath) => {
						if (filePath.endsWith('.html')) {
							res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
						}
					},
				})
			);
			app.get('*', (req, res) => {
				res.sendFile(path.join(client_build_path, 'index.html'));
			});
		}
		else {
			console.warn(`Client build directory not found at ${client_build_path}. React app will not be served.`);
		}

		app.get('*', (req, res) => res.send('Page Not found 404'));
		await this.start_listening(app);
		this.epress_apps.push(app);
	}

	start_listening(app) {
		return new Promise((resolve, reject) => {
			if (!process.env.PORT) {
				return reject(new Error(`PORT is not defined in the environment`));
			}
			let server = app.listen(process.env.PORT);
			server.on('error', (err) => {
				console.log(`Could not start server: ${err}`);
				reject(err);
			});
			server.on('listening', () => {
				console.log(`[${process.pid}] Server started on http://localhost:${process.env.PORT}`);
				resolve();
			});
		});
	}

	async initMongoDB() {
		try {
			this.mongoClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
			await this.mongoClient.connect();
			// Set the database reference on a single variable
			this.dbobj = this.mongoClient.db(process.env.DB_NAME);
			await ensureIndexes(this.dbobj);
			console.log(`Connected to MongoDB database: ${process.env.DB_NAME}`);
		} catch (error) {
			console.error(`Failed to connect to MongoDB: ${error}`);
			throw error;
		}
	}

	initSignals() {
		// Handle SIGINT (Ctrl+C) to gracefully close the MongoDB connection
		process.on('SIGINT', async () => {
			if (this.mongoClient) {
				console.log('Received SIGINT. Closing MongoDB connection...');
				await this.mongoClient.close();
				console.log('MongoDB connection closed.');
			}
			process.exit(0);
		});
	}
}

module.exports = Server;
