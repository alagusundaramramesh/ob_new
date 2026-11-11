const fs = require('fs');
const path = require('path');

/* Thrown for problems the user can fix (invalid input, locked books, not enough stock ...). Routes send the message to the client */
class BusinessError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'BusinessError';
        this.code = code || 'BUSINESS_RULE';
    }
}

module.exports = {
    BusinessError,

    /* Appends an error line to utils/log.txt. Never log passwords or tokens, send only safe context */
    async Errorlog(message) {
        try {
            let logFilePath = path.join(__dirname, 'log.txt');
            let timestamp = new Date().toISOString();
            const logEntry = `${timestamp} - server ${message}\n`;

            await fs.promises.appendFile(logFilePath, logEntry, 'utf8');
        } catch (err) {
            console.error('Error writing to log file:', err);
        }
    },

    /* Common catch block of the routes: business errors go to the client, everything else is logged */
    sendError(res, err, route_name) {
        if (err instanceof BusinessError) {
            return res.send({ status: 'E', code: err.code, message: err.message });
        }
        console.error(`${route_name} failed`, err);
        return res.send({ status: 'E', message: 'Unable to process request' });
    }
};
