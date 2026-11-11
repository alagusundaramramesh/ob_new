/* Redis is optional. It is only created when CONFIG.CAN_ENABLE_REDIS is true (see class.server.js) */
module.exports = class Redis {

    constructor(url, password) {
        this.redis = require('redis');
        this.url = url;
        this.dbIndex = parseInt(process.env.REDIS_DB_INDEX) || 0;
        this.client = this.redis.createClient({
            url: this.url,
            password: password || undefined,
            database: this.dbIndex,
        });
        this.client.on('error', (err) => console.error('Redis error', err.message));
        this.client.connect();
    }

    /** SET key with a string value. ttl_seconds is optional */
    async setData(key, value, ttl_seconds) {
        if (ttl_seconds) {
            return this.client.set(key, value, { EX: ttl_seconds });
        }
        return this.client.set(key, value);
    }

    /** GET key as a string */
    async getData(key) {
        return this.client.get(key);
    }

    /** SET key with an object, stored as JSON */
    async setJson(key, value, ttl_seconds) {
        return this.setData(key, JSON.stringify(value), ttl_seconds);
    }

    /** GET key and parse the JSON, null when the key does not exist */
    async getJson(key) {
        let value = await this.client.get(key);
        return value ? JSON.parse(value) : null;
    }

    async delData(key) {
        return this.client.del(key);
    }
};
