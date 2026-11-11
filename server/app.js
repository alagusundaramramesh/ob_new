/* API MODULES WITH NODE-JS CLUSTERING */
const Server = require('./classes/class.server');
const server = new Server();
/* IF TRUE - CLUSTER ENABLED, FALSE - CLUSTER DISABLED  */
server.start(false);

console.log(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
