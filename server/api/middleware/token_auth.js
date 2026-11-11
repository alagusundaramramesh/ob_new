const jwt = require('jsonwebtoken');
const PERMISSION = require('../../classes/class.permission');

/* Endpoints which are called before the user is logged in. They only need the x-api-key header */
const only_x_api_key_endpoints = [
    'login',
    'signup',
    'forgot_password',
    'reset_password'
];

module.exports = async (req, res, next) => {
    req.body = req.body || {};
    let dbobj = res.locals.dbobj;
    try {
        let X_API_KEY = req.headers['x-api-key'];
        let AUTHORIZATION = req.headers['authorization']?.replace("Bearer ", "");

        let requested_endpoint = req.path.replace('/', '');

        /* PRE-LOGIN endpoints: check X-API-KEY with the server value */
        if (only_x_api_key_endpoints.includes(requested_endpoint)) {
            if (X_API_KEY !== process.env.X_API_KEY) {
                return res.send({ status: "UA", msg: "Invalid API key." });
            }
            return next();
        }

        /* POST-LOGIN endpoints need a valid JWT */
        if (!AUTHORIZATION) {
            return res.send({ status: "UA", msg: "Unauthorized Access" });
        }

        let decode_token = jwt.verify(AUTHORIZATION, process.env.JWT_SECRET);
        // The values come from the token, never from the request body
        req.body.auth_email = decode_token.email;
        req.body.user_id = decode_token.user_id;
        req.body.c_id = decode_token.c_id;
        req.body.auth_role_id = decode_token.role_id;

        /* Module permission of the role */
        let mod_code = PERMISSION.getModuleCode(requested_endpoint, req.body);
        let has_permission = await PERMISSION.can(dbobj, req.body.c_id, req.body.auth_role_id, mod_code);
        if (!has_permission) {
            return res.send({ status: "E", message: "You do not have permission for this action" });
        }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.send({ status: "UA", msg: "Token expired" });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.send({ status: "UA", msg: "Your account has been logged out." });
        }
        console.error("token_auth failed", err);
        return res.send({ status: "E", msg: "Error" });
    }
};
