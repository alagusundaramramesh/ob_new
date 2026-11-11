const bodyParser = require('body-parser');
const cors = require('cors');
var morgan = require('morgan');
var path = require('path');
var rfs = require('rotating-file-stream');
var fileupload = require('express-fileupload');
var express = require('express');


class StandardMiddleware {

    attachTo(app) {
        var accessLogStream = rfs.createStream('access.log', {
            interval: '1d', // rotate daily
            path: path.join(__dirname, '../../log')
        });
        app.use(fileupload({ limits: { fileSize: 5 * 1024 * 1024 } }));
        app.use(morgan('combined', { stream: accessLogStream }));
        app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));
        app.use(bodyParser.json({ type: ['application/json'], limit: '5mb' }));
        app.use(bodyParser.urlencoded({ extended: true }));
        const corsOptions = {
            origin: "*", // React app URL (restrict this in production)
            credentials: false,
        };
        app.use(cors(corsOptions));
    }
}

module.exports = new StandardMiddleware();
