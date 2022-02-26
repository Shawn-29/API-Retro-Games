const app = require('express')();

const { TOO_MANY_REQUESTS } = require('http-status-codes').StatusCodes;

const { SYM_DB_CONNECTION } = require('./symbols');

const getConnectionPool = require('./connection');

let connectionPool = null;

/* get local environment variables if this app is run in development mode */
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: '.env' });
}

/* set the connection port;
    note that the port property is uppercase on hosting services such as Heroku */
app.set('port', process.env.PORT || 3001);

/* middleware */
app.use((_, res, next) => {
    res.header("Access-Control-Allow-Origin", process.env.HOST_URL);
    next();
});

app.use(require('express-rate-limit')({
    windowMs: 60000,
    max: 120,
    legacyHeaders: false,
    handler(_, res) {
        res.status(TOO_MANY_REQUESTS)
            .json({
                error: 'Request limit exceeded.'
            });
    }
}))
app.use(require('compression')());
app.use((_, res, next) => {
    res.locals[SYM_DB_CONNECTION] = connectionPool;
    next();
})
app.use('/', require('./router'));

/* app entry point */
(async () => {

    connectionPool = await getConnectionPool({
        host: process.env.HOST,
        user: process.env.USER,
        password: process.env.PASS,
        database: process.env.DB,
    });

    connectionPool.getConnection((err, connection) => {
        if (err) {
            console.log('Could not connect to database.');
            process.exit(0);
        }
        console.log('Connected to database successfully!');

        connection.release();

        /* we can connect to the database so start up the server to handle API requests */
        app.listen(app.get('port'), () => {
            console.log(`Server running on port ${app.get('port')}.`);
        });
    });
})();